#!/usr/bin/env python3
# Cầu nối NotebookLM (notebooklm-py CLI). Modes: list | refs <id> <query>
import sys
import json
import os
import subprocess

CANDIDATES = [
  os.path.expanduser("~/Library/Python/3.12/bin/notebooklm"),
  os.path.expanduser("~/.local/bin/notebooklm"),
  "notebooklm",
]
CLI = next((c for c in CANDIDATES if c == "notebooklm" or os.path.exists(c)), "notebooklm")


def run(args, timeout=180, stdin=None):
  return subprocess.run([CLI, "--quiet", *args], capture_output=True, text=True, timeout=timeout, input=stdin)


def do_list():
  try:
    r = run(["list", "--json", "--limit", "60"], timeout=40)
    d = json.loads(r.stdout)
    rows = d if isinstance(d, list) else (d.get("notebooks") or d.get("items") or [])
    out = []
    for x in rows:
      nid = x.get("id") or x.get("notebook_id") or x.get("uuid")
      title = x.get("title") or x.get("name") or "(không tên)"
      if nid:
        out.append({"id": nid, "title": title})
    return {"ok": True, "notebooks": out}
  except Exception as e:
    return {"ok": False, "error": (getattr(e, "stderr", "") or str(e))[:300]}


def do_refs(nid, query):
  try:
    texts = []
    for one in [x.strip() for x in str(nid).split(",") if x.strip()]:
      run(["use", one], timeout=30, stdin="y\n")
      # Không dùng --new để tránh xóa hội thoại của người dùng; tự trả lời mọi prompt bằng 'y'.
      r = run(["ask", query], timeout=200, stdin="y\n")
      txt = (r.stdout or "").strip()
      if txt:
        texts.append(f"[NotebookLM {one}]\n{txt[:7000]}")
    if not texts:
      return {"ok": False, "error": "Không có nội dung"}
    return {"ok": True, "text": "\n\n".join(texts)[:14000]}
  except Exception as e:
    return {"ok": False, "error": str(e)[:300]}


if __name__ == "__main__":
  mode = sys.argv[1] if len(sys.argv) > 1 else "list"
  if mode == "list":
    print(json.dumps(do_list()))
  elif mode == "refs":
    print(json.dumps(do_refs(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "Tóm tắt nội dung chính")))
  else:
    print(json.dumps({"ok": False, "error": "mode?"}))
