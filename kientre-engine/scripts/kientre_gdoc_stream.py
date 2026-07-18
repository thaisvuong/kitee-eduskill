#!/usr/bin/env python3
"""Kientre Google Docs streaming writer.

Create a Google Doc (in a Drive folder) and append quiz content question by
question, so the user sees each question land in real time instead of waiting
for the whole set to finish. Auto-refreshes the OAuth token (Docs + Drive
scopes required).

Two sub-commands, both read a JSON payload from stdin and print JSON to stdout:

  create   { "title": "...", "folder": "<drive_folder_id or empty>" }
           -> { "ok": true, "documentId": "...", "url": "..." }

  append   { "documentId": "...", "question": { ...question object... } }
           -> { "ok": true, "documentId": "...", "url": "..." }

A question object looks like:
  {
    "quizTitle": "Quiz 1 — Nhận biết",     # optional section header (once per quiz)
    "index": 1,
    "points": 2,
    "type": "trắc nghiệm",
    "question": "Đề bài ...",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],   # optional (mc)
    "hints": ["gợi ý 1", "gợi ý 2", "gợi ý 3"],
    "answer": "B",
    "solution": "Lời giải chi tiết ...",
    "imagePath": "/abs/path/to/img.png"     # optional; inserted inline
  }

Text is appended by walking a small list of (text, style) runs and issuing a
single batchUpdate. The Docs API inserts at a fixed index (end of body), so we
always fetch the current end index first, then insert sequentially.
"""
import json
import os
import ssl
import sys
import time
import uuid
import pathlib
import urllib.request
import urllib.parse
import urllib.error

DOCS_API = 'https://docs.googleapis.com/v1/documents'
DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files'


def _ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


SSL_CTX = _ssl_context()


def token_file_path():
    home = os.environ.get('HERMES_HOME') or os.path.expanduser('~/.hermes')
    return os.environ.get('GOOGLE_OAUTH_JSON') or os.path.join(home, 'google_token.json')


def load_token(token_file):
    with open(token_file, encoding='utf-8') as f:
        return json.load(f)


def refresh_if_needed(token_file, data):
    from datetime import datetime, timezone, timedelta
    expiry = data.get('expiry')
    need = True
    if expiry:
        try:
            exp = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
            need = (exp - datetime.now(timezone.utc)).total_seconds() < 120
        except Exception:
            need = True
    if not need:
        return data.get('token') or data.get('access_token')
    refresh = data.get('refresh_token')
    if not (refresh and data.get('client_id') and data.get('client_secret')):
        return data.get('token') or data.get('access_token')
    token_uri = data.get('token_uri') or 'https://oauth2.googleapis.com/token'
    body = urllib.parse.urlencode({
        'client_id': data['client_id'],
        'client_secret': data['client_secret'],
        'refresh_token': refresh,
        'grant_type': 'refresh_token',
    }).encode()
    req = urllib.request.Request(token_uri, data=body, method='POST',
                                 headers={'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=60) as resp:
        res = json.loads(resp.read())
    new_token = res.get('access_token')
    if new_token:
        data['token'] = new_token
        if res.get('expires_in'):
            exp = datetime.now(timezone.utc) + timedelta(seconds=int(res['expires_in']))
            data['expiry'] = exp.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        try:
            with open(token_file, 'w', encoding='utf-8') as f:
                json.dump(data, f)
        except Exception:
            pass
    return new_token or data.get('token') or data.get('access_token')


def request(token, url, method='GET', payload=None, headers=None, raw_body=None):
    h = {'Authorization': f'Bearer {token}'}
    if headers:
        h.update(headers)
    body = raw_body
    if payload is not None and raw_body is None:
        body = json.dumps(payload).encode()
        h.setdefault('Content-Type', 'application/json')
    last = None
    for attempt in range(4):
        req = urllib.request.Request(url, data=body, headers=h, method=method)
        try:
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=180) as resp:
                data = resp.read()
                return json.loads(data) if data else None
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'replace')
            last = RuntimeError(f'HTTP {e.code}: {msg[:600]}')
            if e.code not in (429, 500, 502, 503, 504):
                raise last
            time.sleep(2 ** attempt)
    raise last or RuntimeError('request failed')


def doc_url(doc_id):
    return f'https://docs.google.com/document/d/{doc_id}/edit'


def create_doc(token, title, folder):
    doc = request(token, DOCS_API, 'POST', {'title': title or 'Kientre Quiz'})
    if not doc or not doc.get('documentId'):
        raise RuntimeError('Docs API did not return a documentId')
    doc_id = doc['documentId']
    if folder:
        # Move into folder via Drive files.update (addParents).
        url = f'{DRIVE_FILES}/{doc_id}?addParents={urllib.parse.quote(folder)}&fields=id,parents'
        try:
            request(token, url, 'PATCH', {})
        except Exception:
            pass  # doc still exists in My Drive if move fails
    return doc_id


def end_index(token, doc_id):
    doc = request(token, f'{DOCS_API}/{doc_id}', 'GET')
    doc = doc or {}
    content = doc.get('body', {}).get('content', [])
    end = 1
    for el in content:
        if 'endIndex' in el:
            end = el['endIndex']
    # Docs body always ends with a trailing newline segment; insert before it.
    return max(1, end - 1)


def _runs_for_question(q):
    """Return a list of (text, bold) runs building one question block."""
    runs = []
    quiz_title = q.get('quizTitle')
    if quiz_title:
        runs.append((f'\n{quiz_title}\n', True))
    head = f"CÂU {q.get('index', '')}"
    pts = q.get('points')
    typ = q.get('type')
    meta = []
    if pts is not None:
        meta.append(f'{pts} điểm')
    if typ:
        meta.append(str(typ))
    if meta:
        head += f" ({' · '.join(meta)})"
    runs.append((head + '\n', True))
    if q.get('question'):
        runs.append(('Đề bài: ', True))
        runs.append((str(q['question']) + '\n', False))
    for opt in (q.get('options') or []):
        runs.append((str(opt) + '\n', False))
    hints = q.get('hints') or []
    if hints:
        runs.append(('3 Gợi ý:\n', True))
        for h in hints:
            runs.append(('- ' + str(h) + '\n', False))
    if q.get('answer'):
        runs.append(('Đáp án: ', True))
        runs.append((str(q['answer']) + '\n', False))
    if q.get('solution'):
        runs.append(('Lời giải chi tiết:\n', True))
        runs.append((str(q['solution']) + '\n', False))
    runs.append(('\n', False))
    return runs


def append_question(token, doc_id, q):
    idx = end_index(token, doc_id)
    requests = []
    cursor = idx
    for text, bold in _runs_for_question(q):
        if not text:
            continue
        requests.append({'insertText': {'location': {'index': cursor}, 'text': text}})
        if bold:
            requests.append({
                'updateTextStyle': {
                    'range': {'startIndex': cursor, 'endIndex': cursor + len(text)},
                    'textStyle': {'bold': True},
                    'fields': 'bold',
                }
            })
        cursor += len(text)
    if requests:
        request(token, f'{DOCS_API}/{doc_id}:batchUpdate', 'POST', {'requests': requests})

    # Insert an inline image (from a public/hosted URL) after the text if given.
    img_url = q.get('imageUrl')
    if img_url:
        idx2 = end_index(token, doc_id)
        try:
            request(token, f'{DOCS_API}/{doc_id}:batchUpdate', 'POST', {
                'requests': [{
                    'insertInlineImage': {
                        'location': {'index': idx2},
                        'uri': img_url,
                    }
                }, {
                    'insertText': {'location': {'index': idx2}, 'text': '\n'}
                }],
            })
        except Exception:
            pass  # image optional; never fail the question on it
    return doc_id


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('create', 'append'):
        print(json.dumps({'ok': False, 'error': 'usage: create|append (JSON on stdin)'}))
        sys.exit(2)
    action = sys.argv[1]
    payload = json.loads(sys.stdin.read() or '{}')
    token_file = payload.get('tokenFile') or token_file_path()
    tdata = load_token(token_file)
    token = refresh_if_needed(token_file, tdata)
    try:
        if action == 'create':
            doc_id = create_doc(token, payload.get('title', ''), payload.get('folder', ''))
            print(json.dumps({'ok': True, 'documentId': doc_id, 'url': doc_url(doc_id)}))
        else:
            doc_id = payload['documentId']
            append_question(token, doc_id, payload.get('question', {}))
            print(json.dumps({'ok': True, 'documentId': doc_id, 'url': doc_url(doc_id)}))
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
