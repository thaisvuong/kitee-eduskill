#!/usr/bin/env python3
import json
import os
import pathlib
import ssl
import sys
import uuid
import urllib.request
import zipfile

TOKEN_FILE = os.path.expanduser('~/.hermes/google_token.json')
TOKEN = json.load(open(TOKEN_FILE, encoding='utf-8')).get('token') or json.load(open(TOKEN_FILE, encoding='utf-8')).get('access_token')
SSL_CTX = ssl.create_default_context()


def request(url, method='GET', data=None, headers=None):
  h = {'Authorization': f'Bearer {TOKEN}'}
  if headers:
    h.update(headers)
  req = urllib.request.Request(url, data=data, headers=h, method=method)
  with urllib.request.urlopen(req, context=SSL_CTX) as resp:
    return resp.read(), resp.headers


def create_folder(name, parent=None):
  meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
  if parent:
    meta['parents'] = [parent]
  body, _ = request(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
    'POST', json.dumps(meta).encode(), {'Content-Type': 'application/json'},
  )
  return json.loads(body)


def upload(path, parent):
  p = pathlib.Path(path)
  mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  bound = 'upload_' + uuid.uuid4().hex
  meta = json.dumps({'name': p.name, 'parents': [parent]}).encode()
  data = p.read_bytes()
  body = b''.join([
    f'--{bound}\r\n'.encode(),
    b'Content-Type: application/json; charset=UTF-8\r\n\r\n', meta, b'\r\n',
    f'--{bound}\r\n'.encode(),
    f'Content-Type: {mime}\r\n\r\n'.encode(), data, b'\r\n',
    f'--{bound}--\r\n'.encode(),
  ])
  out, _ = request(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType,webViewLink,webContentLink',
    'POST', body, {'Content-Type': f'multipart/related; boundary={bound}'},
  )
  return json.loads(out)


def download(file_id, outpath):
  body, _ = request(f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media')
  pathlib.Path(outpath).write_bytes(body)
  return len(body)


if __name__ == '__main__':
  if len(sys.argv) < 2:
    print('Usage: drive_upload_download_check.py FILE.docx [folder-name]', file=sys.stderr)
    sys.exit(2)
  src = pathlib.Path(sys.argv[1]).resolve()
  folder_name = sys.argv[2] if len(sys.argv) > 2 else 'Kientre_Smoke'
  folder = create_folder(folder_name)
  uploaded = upload(src, folder['id'])
  downloaded = src.with_name('drive_download_' + src.name)
  bytes_downloaded = download(uploaded['id'], downloaded)
  with zipfile.ZipFile(downloaded) as z:
    docx_ok = '[Content_Types].xml' in z.namelist()
  print(json.dumps({
    'folder': folder,
    'upload': uploaded,
    'downloadBytes': bytes_downloaded,
    'downloadDocxOk': docx_ok,
    'downloadPath': str(downloaded),
  }, ensure_ascii=False, indent=2))
  sys.exit(0 if docx_ok else 1)
