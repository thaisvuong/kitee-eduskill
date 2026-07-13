#!/usr/bin/env python3
import json, os, pathlib, ssl, sys, time, urllib.request, urllib.parse, urllib.error
TOKEN=json.load(open(os.path.expanduser('~/.hermes/google_token.json'),encoding='utf-8')).get('token')
SSL_CTX=ssl.create_default_context()
GDOC='application/vnd.google-apps.document'; FOLDER='application/vnd.google-apps.folder'

def request(url, method='GET', data=None, headers=None):
    h={'Authorization':f'Bearer {TOKEN}'}
    if headers: h.update(headers)
    last=None
    for i in range(4):
        req=urllib.request.Request(url,data=data,headers=h,method=method)
        try:
            with urllib.request.urlopen(req,context=SSL_CTX,timeout=120) as r:
                raw=r.read(); return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            body=e.read().decode('utf-8','replace'); last=RuntimeError(f'HTTP {e.code}: {body[:500]}')
            if e.code not in (429,500,502,503,504): raise last
            time.sleep(2**i)
    raise last

def find_folder(name,parent=None):
    q=[f"mimeType='{FOLDER}'",f"name='{name}'",'trashed=false']
    if parent: q.append(f"'{parent}' in parents")
    url='https://www.googleapis.com/drive/v3/files?'+urllib.parse.urlencode({'q':' and '.join(q),'fields':'files(id,name,webViewLink)','pageSize':1})
    files=(request(url) or {}).get('files') or []
    return files[0] if files else None

def ensure_folder(name,parent=None):
    f=find_folder(name,parent)
    if f: return f
    meta={'name':name,'mimeType':FOLDER}
    if parent: meta['parents']=[parent]
    return request('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink','POST',json.dumps(meta).encode(),{'Content-Type':'application/json'})

def upload_text(name,text,parent):
    meta={'name':name,'parents':[parent],'mimeType':GDOC}
    return request('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink,parents','POST',json.dumps(meta).encode(),{'Content-Type':'application/json'}) | update_doc(name,text,parent)

def update_doc(name,text,parent):
    # Upload as text/plain with Google Docs target MIME for reliable conversion.
    import uuid
    bound='upload_'+uuid.uuid4().hex
    meta=json.dumps({'name':name,'parents':[parent],'mimeType':GDOC}).encode()
    data=text.encode('utf-8')
    body=b''.join([f'--{bound}\r\n'.encode(),b'Content-Type: application/json; charset=UTF-8\r\n\r\n',meta,b'\r\n',f'--{bound}\r\n'.encode(),b'Content-Type: text/plain; charset=UTF-8\r\n\r\n',data,b'\r\n',f'--{bound}--\r\n'.encode()])
    return request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,parents','POST',body,{'Content-Type':f'multipart/related; boundary={bound}'})

def export_text(file_id,out):
    url=f'https://www.googleapis.com/drive/v3/files/{file_id}/export?mimeType=text/plain'
    req=urllib.request.Request(url,headers={'Authorization':f'Bearer {TOKEN}'})
    with urllib.request.urlopen(req,context=SSL_CTX,timeout=120) as r: data=r.read()
    pathlib.Path(out).write_bytes(data); return len(data)

if __name__=='__main__':
    folder=sys.argv[1]; pairs=sys.argv[2:]
    kitee=ensure_folder('Kitee'); gia=ensure_folder('Gia sư',kitee['id']); sub=ensure_folder('SubHermes_GoogleDocs_Test',gia['id']); batch=ensure_folder(folder,sub['id'])
    uploaded=[]
    for md in pairs:
        p=pathlib.Path(md).resolve(); name=p.parent.name
        g=update_doc(name,p.read_text(encoding='utf-8'),batch['id'])
        out=p.parent/('gdoc_export_'+name+'.txt')
        n=export_text(g['id'],out)
        uploaded.append({'source':str(p),'gdoc':g,'exportedText':str(out),'exportedBytes':n,'exportOk':n>1000})
    print(json.dumps({'folder':batch,'uploaded':uploaded},ensure_ascii=False,indent=2))
