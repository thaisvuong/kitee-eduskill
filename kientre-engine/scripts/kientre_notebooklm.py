#!/usr/bin/env python3
"""Safe NotebookLM CLI bridge for KientreAAA.

Thin wrapper over `python -m notebooklm` so web stays aligned with notebooklm-py.
Prints JSON only.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from typing import Any


def out(x: dict[str, Any], code: int = 0) -> None:
    print(json.dumps(x, ensure_ascii=False, indent=2))
    raise SystemExit(code)


def run_cli(args: list[str], timeout: int = 1800) -> dict[str, Any]:
    cmd = [sys.executable, "-m", "notebooklm", *args, "--json"]
    p = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout)
    raw = (p.stdout or "").strip()
    try:
        data = json.loads(raw) if raw else {}
    except Exception:
        data = {"raw": raw}
    if p.returncode != 0:
        return {"ok": False, "error": (p.stderr or raw or f"notebooklm exited {p.returncode}")[:2000], "data": data, "cmd": cmd}
    if isinstance(data, dict):
        data = dict(data)
        if "ok" not in data:
            data["ok"] = True
        return data
    return {"ok": True, "data": data}


def many(name: str, xs: list[str]) -> list[str]:
    out: list[str] = []
    for x in xs:
        if x:
            out += [name, x]
    return out


GEN_TYPES = {
    "audio": ["generate", "audio"],
    "video": ["generate", "video"],
    "cinematic-video": ["generate", "cinematic-video"],
    "slide-deck": ["generate", "slide-deck"],
    "infographic": ["generate", "infographic"],
    "quiz": ["generate", "quiz"],
    "flashcards": ["generate", "flashcards"],
    "report": ["generate", "report"],
    "data-table": ["generate", "data-table"],
    "mind-map": ["generate", "mind-map"],
}
DOWNLOAD_TYPES = {k: ["download", k] for k in GEN_TYPES}
DOWNLOAD_TYPES["cinematic-video"] = ["download", "cinematic-video"]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("action")
    p.add_argument("--notebook-id", default="")
    p.add_argument("--source-id", default="")
    p.add_argument("--artifact-id", default="")
    p.add_argument("--note-id", default="")
    p.add_argument("--title", default="")
    p.add_argument("--content", default="")
    p.add_argument("--prompt", default="")
    p.add_argument("--description", default="")
    p.add_argument("--format", default="")
    p.add_argument("--type", default="")
    p.add_argument("--kind", default="")
    p.add_argument("--quantity", default="")
    p.add_argument("--difficulty", default="")
    p.add_argument("--length", default="")
    p.add_argument("--language", default="vi")
    p.add_argument("--style", default="")
    p.add_argument("--style-prompt", default="")
    p.add_argument("--orientation", default="")
    p.add_argument("--detail", default="")
    p.add_argument("--append", default="")
    p.add_argument("--instructions", default="")
    p.add_argument("--output", default="")
    p.add_argument("--sources", default="")
    p.add_argument("--wait", action="store_true")
    p.add_argument("--no-wait", dest="wait", action="store_false")
    p.set_defaults(wait=False)
    p.add_argument("--timeout", type=int, default=1800)
    args = p.parse_args()

    nb = ["-n", args.notebook_id] if args.notebook_id else []
    sources = many("-s", [s.strip() for s in args.sources.split(",") if s.strip()])

    a = args.action
    if a == "list": out(run_cli(["list"], 120))
    if a == "create": out(run_cli(["create", args.title], 120))
    if a == "delete": out(run_cli(["delete", *nb, "--yes"], 120))
    if a == "rename": out(run_cli(["rename", *nb, args.title], 120))
    if a == "summary": out(run_cli(["summary", *nb, "--topics"], 180))
    if a == "metadata": out(run_cli(["metadata", *nb], 120))
    if a == "ask": out(run_cli(["ask", *nb, args.prompt], args.timeout))

    if a == "sources": out(run_cli(["source", "list", *nb], 180))
    if a == "source-add":
        cli = ["source", "add", args.content, *nb]
        if args.type: cli += ["--type", args.type]
        if args.title: cli += ["--title", args.title]
        out(run_cli(cli, args.timeout))
    if a == "source-refresh": out(run_cli(["source", "refresh", *nb, args.source_id], args.timeout))
    if a == "source-fulltext":
        cli = ["source", "fulltext", *nb, args.source_id, "--format", args.format or "markdown"]
        if args.output: cli += ["--output", args.output, "--force"]
        out(run_cli(cli, args.timeout))

    if a.startswith("generate-"):
        typ = a.removeprefix("generate-")
        if typ not in GEN_TYPES: out({"ok": False, "error": f"unknown generate type: {typ}"}, 2)
        cli = [*GEN_TYPES[typ], args.description, *nb, *sources]
        if args.format: cli += ["--format", args.format]
        if args.quantity: cli += ["--quantity", args.quantity]
        if args.difficulty: cli += ["--difficulty", args.difficulty]
        if args.length: cli += ["--length", args.length]
        if args.language and typ not in {"quiz", "flashcards"}: cli += ["--language", args.language]
        if args.style: cli += ["--style", args.style]
        if args.style_prompt: cli += ["--style-prompt", args.style_prompt]
        if args.orientation: cli += ["--orientation", args.orientation]
        if args.detail: cli += ["--detail", args.detail]
        if args.append: cli += ["--append", args.append]
        if args.instructions: cli += ["--instructions", args.instructions]
        if args.kind: cli += ["--kind", args.kind]
        cli += ["--wait"] if args.wait else ["--no-wait"]
        out(run_cli(cli, args.timeout))

    if a.startswith("download-"):
        typ = a.removeprefix("download-")
        if typ not in DOWNLOAD_TYPES: out({"ok": False, "error": f"unknown download type: {typ}"}, 2)
        cli = [*DOWNLOAD_TYPES[typ], *nb]
        if args.artifact_id: cli += [args.artifact_id]
        if args.format: cli += ["--format", args.format]
        if args.output: cli += ["--output", args.output, "--force"]
        out(run_cli(cli, args.timeout))

    if a == "artifact-list": out(run_cli(["artifact", "list", *nb, *( ["--type", args.type] if args.type else [] )], 180))
    if a == "artifact-get": out(run_cli(["artifact", "get", *nb, args.artifact_id], 180))
    if a == "artifact-export": out(run_cli(["artifact", "export", *nb, args.artifact_id, "--title", args.title, "--type", args.type or "docs"], args.timeout))

    if a == "note-create": out(run_cli(["note", "create", *nb, args.content, "--title", args.title], 180))
    if a == "note-list": out(run_cli(["note", "list", *nb], 180))
    if a == "note-get": out(run_cli(["note", "get", *nb, args.note_id], 180))
    if a == "note-save": out(run_cli(["note", "save", *nb, args.note_id, "--title", args.title, "--content", args.content], 180))

    if a == "research-status": out(run_cli(["research", "status", *nb], 180))
    if a == "research-wait": out(run_cli(["research", "wait", *nb, "--timeout", str(args.timeout), "--import-all"], args.timeout + 30))
    if a == "share-status": out(run_cli(["share", "status", *nb], 180))

    out({"ok": False, "error": f"unknown action: {a}"}, 2)


if __name__ == "__main__":
    main()
