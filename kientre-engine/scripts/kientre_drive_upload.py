#!/usr/bin/env python3
"""Kientre Drive uploader.

Upload .docx files into a chosen Drive folder, also create a Google Docs copy,
keep BOTH (docx + gdoc), return JSON links. Auto-refreshes OAuth token.

Usage:
  kientre_drive_upload.py --token TOKEN.json --folder FOLDER_ID FILE1.docx [FILE2.docx ...]

Only .docx files are uploaded; other extensions are skipped.
Prints JSON: { ok, folderId, uploaded:[{name, docxId, docxLink, gdocId, gdocLink}], skipped:[...] }
"""
import json
import os
import pathlib
import ssl
import sys
import uuid
import time
import argparse
import urllib.request
import urllib.parse
import urllib.error

DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
GDOC_MIME = 'application/vnd.google-apps.document'


def _ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


SSL_CTX = _ssl_context()


def load_token(token_file):
    with open(token_file, encoding='utf-8') as f:
        return json.load(f)


def refresh_if_needed(token_file, data):
    """Refresh access token using refresh_token when expired/near expiry."""
    from datetime import datetime, timezone
    client = data.get('installed') or data.get('web') or {}
    client_id = data.get('client_id') or client.get('client_id')
    client_secret = data.get('client_secret') or client.get('client_secret')
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
    if not (refresh and client_id and client_secret):
        # no way to refresh; use whatever token we have
        return data.get('token') or data.get('access_token')
    token_uri = data.get('token_uri') or client.get('token_uri') or 'https://oauth2.googleapis.com/token'
    body = urllib.parse.urlencode({
        'client_id': client_id,
        'client_secret': client_secret,
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
        # persist refreshed token + expiry
        if res.get('expires_in'):
            from datetime import timedelta
            exp = datetime.now(timezone.utc) + timedelta(seconds=int(res['expires_in']))
            data['expiry'] = exp.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        try:
            with open(token_file, 'w', encoding='utf-8') as f:
                json.dump(data, f)
        except Exception:
            pass
    return new_token or data.get('token') or data.get('access_token')


def request(token, url, method='GET', payload=None, headers=None):
    h = {'Authorization': f'Bearer {token}'}
    if headers:
        h.update(headers)
    last = None
    for attempt in range(4):
        req = urllib.request.Request(url, data=payload, headers=h, method=method)
        try:
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=180) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            last = RuntimeError(f'HTTP {e.code}: {body[:600]}')
            if e.code not in (429, 500, 502, 503, 504):
                raise last
            time.sleep(2 ** attempt)
    raise last or RuntimeError('request failed')


def slim_docx(src, dest):
    """Drop embedded media so large docx still converts to Google Docs."""
    import zipfile
    with zipfile.ZipFile(src, 'r') as zin, zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename.startswith('word/media/'):
                continue
            zout.writestr(item, zin.read(item.filename))


def upload_raw_docx(token, path, parent):
    """Upload the .docx as-is (keeps original file on Drive)."""
    p = pathlib.Path(path)
    meta = json.dumps({'name': p.name, 'parents': [parent]}).encode()
    data = p.read_bytes()
    bound = 'up_' + uuid.uuid4().hex
    body = b''.join([
        f'--{bound}\r\n'.encode(),
        b'Content-Type: application/json; charset=UTF-8\r\n\r\n', meta, b'\r\n',
        f'--{bound}\r\n'.encode(),
        f'Content-Type: {DOCX_MIME}\r\n\r\n'.encode(), data, b'\r\n',
        f'--{bound}--\r\n'.encode(),
    ])
    return request(token,
                   'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
                   'POST', body, {'Content-Type': f'multipart/related; boundary={bound}'})


def upload_as_gdoc(token, path, parent, force_slim=False):
    """Upload converting to Google Docs (separate copy)."""
    p = pathlib.Path(path)
    upload_path = p
    tmp = None
    if force_slim or p.stat().st_size > 1_500_000:
        tmp = p.with_name(p.stem + '_slim.docx')
        slim_docx(p, tmp)
        upload_path = tmp
    meta = json.dumps({'name': p.stem, 'parents': [parent], 'mimeType': GDOC_MIME}).encode()
    data = upload_path.read_bytes()
    bound = 'gd_' + uuid.uuid4().hex
    body = b''.join([
        f'--{bound}\r\n'.encode(),
        b'Content-Type: application/json; charset=UTF-8\r\n\r\n', meta, b'\r\n',
        f'--{bound}\r\n'.encode(),
        f'Content-Type: {DOCX_MIME}\r\n\r\n'.encode(), data, b'\r\n',
        f'--{bound}--\r\n'.encode(),
    ])
    try:
        return request(token,
                       'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
                       'POST', body, {'Content-Type': f'multipart/related; boundary={bound}'})
    finally:
        if tmp:
            try:
                tmp.unlink()
            except Exception:
                pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--token', required=True)
    ap.add_argument('--folder', required=True, help='Drive folder ID')
    ap.add_argument('--delete-local', action='store_true')
    ap.add_argument('files', nargs='+')
    args = ap.parse_args()

    tdata = load_token(args.token)
    token = refresh_if_needed(args.token, tdata)

    uploaded, skipped = [], []
    for raw in args.files:
        f = pathlib.Path(raw).resolve()
        if f.suffix.lower() != '.docx':
            skipped.append({'file': str(f), 'reason': 'not-docx'})
            continue
        if not f.exists():
            skipped.append({'file': str(f), 'reason': 'missing'})
            continue
        docx = upload_raw_docx(token, f, args.folder)
        gdoc, gdoc_error = None, ''
        try:
            gdoc = upload_as_gdoc(token, f, args.folder)
        except Exception as e:
            try:
                gdoc = upload_as_gdoc(token, f, args.folder, force_slim=True)
            except Exception as e2:
                gdoc_error = str(e2 or e)
        uploaded.append({
            'name': f.name,
            'docxId': (docx or {}).get('id'),
            'docxLink': (docx or {}).get('webViewLink'),
            'gdocId': (gdoc or {}).get('id'),
            'gdocLink': (gdoc or {}).get('webViewLink'),
            'gdocError': gdoc_error,
        })
        if args.delete_local and gdoc:
            try:
                f.unlink()
            except Exception:
                pass

    print(json.dumps({'ok': True, 'folderId': args.folder,
                      'uploaded': uploaded, 'skipped': skipped}, ensure_ascii=False))


if __name__ == '__main__':
    main()
