#!/usr/bin/env python3
import json
import os
import pathlib
import ssl
import sys
import uuid
import time
import urllib.request
import urllib.parse
import urllib.error

TOKEN_FILE = os.path.expanduser('~/.hermes/google_token.json')
with open(TOKEN_FILE, encoding='utf-8') as f:
    token_data = json.load(f)
TOKEN = token_data.get('token') or token_data.get('access_token')
SSL_CTX = ssl.create_default_context()
DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
GDOC_MIME = 'application/vnd.google-apps.document'
FOLDER_MIME = 'application/vnd.google-apps.folder'


def request(url, method='GET', data=None, headers=None):
    h = {'Authorization': f'Bearer {TOKEN}'}
    if headers:
        h.update(headers)
    last_error = None
    for attempt in range(4):
        req = urllib.request.Request(url, data=data, headers=h, method=method)
        try:
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=120) as resp:
                raw = resp.read()
                if not raw:
                    return None
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            last_error = RuntimeError(f'HTTP {e.code}: {body[:1000]}')
            if e.code not in (429, 500, 502, 503, 504):
                raise last_error
            time.sleep(2 ** attempt)
    raise last_error


def find_folder(name, parent=None):
    q = ["mimeType='{}'".format(FOLDER_MIME), "name='{}'".format(name.replace("'", "\\'")), 'trashed=false']
    if parent:
        q.append("'{}' in parents".format(parent))
    params = urllib.parse.urlencode({'q': ' and '.join(q), 'fields': 'files(id,name,webViewLink)', 'pageSize': 1})
    res = request('https://www.googleapis.com/drive/v3/files?' + params)
    files = (res or {}).get('files') or []
    return files[0] if files else None


def ensure_folder(name, parent=None):
    found = find_folder(name, parent)
    if found:
        return found
    meta = {'name': name, 'mimeType': FOLDER_MIME}
    if parent:
        meta['parents'] = [parent]
    return request('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', 'POST', json.dumps(meta).encode(), {'Content-Type': 'application/json'})




def slim_docx(src, dest):
    import zipfile
    # Google Docs conversion can fail on very large embedded media; keep document text/styles and drop images.
    with zipfile.ZipFile(src, 'r') as zin, zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename.startswith('word/media/'):
                continue
            zout.writestr(item, zin.read(item.filename))

def upload_as_gdoc(path, parent):
    p = pathlib.Path(path)
    name = p.stem
    upload_path = p
    if p.stat().st_size > 1_500_000:
        upload_path = p.with_name(p.stem + '_for_gdoc.docx')
        slim_docx(p, upload_path)
    bound = 'upload_' + uuid.uuid4().hex
    meta = json.dumps({'name': name, 'parents': [parent], 'mimeType': GDOC_MIME}).encode()
    data = upload_path.read_bytes()
    body = b''.join([
        f'--{bound}\r\n'.encode(),
        b'Content-Type: application/json; charset=UTF-8\r\n\r\n', meta, b'\r\n',
        f'--{bound}\r\n'.encode(),
        f'Content-Type: {DOCX_MIME}\r\n\r\n'.encode(), data, b'\r\n',
        f'--{bound}--\r\n'.encode(),
    ])
    return request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,parents',
        'POST', body, {'Content-Type': f'multipart/related; boundary={bound}'},
    )


def export_docx(file_id, out_path):
    url = 'https://www.googleapis.com/drive/v3/files/{}/export?mimeType={}'.format(file_id, urllib.parse.quote(DOCX_MIME, safe=''))
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'}, method='GET')
    with urllib.request.urlopen(req, context=SSL_CTX) as resp:
        data = resp.read()
    pathlib.Path(out_path).write_bytes(data)
    return len(data)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: upload_as_google_docs.py FOLDER_NAME FILE1.docx [FILE2.docx ...]', file=sys.stderr)
        sys.exit(2)
    folder_name = sys.argv[1]
    files = [pathlib.Path(x).resolve() for x in sys.argv[2:]]

    kitee = ensure_folder('Kitee')
    gia_su = ensure_folder('Gia sư', kitee['id'])
    subhermes = ensure_folder('SubHermes_GoogleDocs_Test', gia_su['id'])
    batch = ensure_folder(folder_name, subhermes['id'])

    uploaded = []
    for f in files:
        gdoc = upload_as_gdoc(f, batch['id'])
        exported = f.with_name('gdoc_export_' + f.name)
        bytes_exported = export_docx(gdoc['id'], exported)
        uploaded.append({
            'source': str(f),
            'gdoc': gdoc,
            'exportedDocx': str(exported),
            'exportedBytes': bytes_exported,
            'exportOk': bytes_exported > 10000,
        })
    print(json.dumps({'folder': batch, 'uploaded': uploaded}, ensure_ascii=False, indent=2))
