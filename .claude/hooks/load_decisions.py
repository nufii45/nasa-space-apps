#!/usr/bin/env python3
"""
Load decision state from the Obsidian vault into the Claude Code session.

Runs as a SessionStart hook (startup, resume, clear, compact), so the
orchestrator gets its memory back automatically, including right after
the context window is compacted.

Source of truth = the frontmatter of each decision note. `_index.md` is
regenerated from it on every run, so changing `status:` in Obsidian is all
the human ever needs to do.

Usage:
  load_decisions.py            -> hook mode (JSON on stdout)
  load_decisions.py --plain    -> plain text (used by the /recall command)

Config (env, set in .claude/settings.local.json):
  OBSIDIAN_AI_DIR       absolute path to the vault's AI/ folder (required)
  OBSIDIAN_REPO_NAME    override repo folder name (default: project dir name)
"""
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

MAX_ACCEPTED_CHARS = 12_000   # full text of accepted decisions, beyond this → titles only
MAX_SESSION_CHARS = 2_500     # most recent session summary
MAX_GLOBAL_CHARS = 3_000      # _global.md


def parse_frontmatter(text: str) -> dict:
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not m:
        return {}
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith((" ", "\t", "-")):
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip().strip('"').strip("'")
    return meta


def body_of(text: str) -> str:
    text = re.sub(r"^---\s*\n.*?\n---\s*\n", "", text, count=1, flags=re.DOTALL)
    return re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL).strip()


def feedback_of(body: str) -> str:
    """Human feedback under '## Feedback' (empty if none)."""
    m = re.search(r"^##\s*Feedback\s*\n(.*?)(?=^##\s|\Z)", body, re.DOTALL | re.MULTILINE)
    return m.group(1).strip() if m else ""


def with_feedback(line: str, d: dict) -> str:
    fb = feedback_of(d["body"])
    return f"{line}\n  ↳ USER FEEDBACK: {clip(fb, 600)}" if fb else line


def clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + "\n…[truncated — read the file for the rest]"


def emit(text: str, plain: bool) -> None:
    if plain:
        print(text)
    else:
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "SessionStart",
                "additionalContext": text,
            }
        }))
    sys.exit(0)


def main() -> None:
    plain = "--plain" in sys.argv
    ai_dir = os.environ.get("OBSIDIAN_AI_DIR", "").strip()
    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    repo = os.environ.get("OBSIDIAN_REPO_NAME", "").strip() or project_dir.name

    # Fail loudly, not silently: a missing memory must be visible.
    if not ai_dir:
        emit("⚠️ DECISION VAULT NOT CONFIGURED: OBSIDIAN_AI_DIR is not set. "
             "Tell the user before doing any planning; decisions from earlier "
             "sessions are NOT loaded.", plain)
    ai = Path(os.path.expanduser(ai_dir))
    if not ai.is_dir():
        emit(f"⚠️ DECISION VAULT NOT FOUND at {ai}. Tell the user before planning; "
             "earlier decisions are NOT loaded.", plain)

    repo_dir = ai / "repos" / repo
    dec_dir = repo_dir / "decisions"
    ses_dir = repo_dir / "sessions"
    dec_dir.mkdir(parents=True, exist_ok=True)
    ses_dir.mkdir(parents=True, exist_ok=True)

    decisions = []
    for f in sorted(dec_dir.glob("*.md")):
        text = f.read_text(encoding="utf-8", errors="replace")
        meta = parse_frontmatter(text)
        decisions.append({
            "file": f,
            "id": meta.get("id", f.stem[:4]),
            "title": meta.get("title", f.stem),
            "status": meta.get("status", "proposed").lower(),
            "date": meta.get("date", ""),
            "superseded_by": meta.get("superseded_by", ""),
            "body": body_of(text),
        })

    # Regenerate the human-facing index from frontmatter.
    rows = "\n".join(
        f"| {d['id']} | [[{d['file'].stem}\\|{d['title']}]] | {d['status']} | {d['date']} |"
        for d in decisions
    ) or "| – | No decisions yet | – | – |"
    (repo_dir / "_index.md").write_text(
        f"# {repo} — decision index\n\n"
        f"_Auto-generated {date.today().isoformat()} from note frontmatter. "
        f"Do not edit; change `status:` in the note itself._\n\n"
        f"| ID | Decision | Status | Date |\n|---|---|---|---|\n{rows}\n",
        encoding="utf-8",
    )

    ids = [int(d["id"]) for d in decisions if str(d["id"]).isdigit()]
    next_id = f"{(max(ids) + 1) if ids else 1:04d}"

    by_status = lambda s: [d for d in decisions if d["status"] == s]
    accepted, proposed, rejected = by_status("accepted"), by_status("proposed"), by_status("rejected")

    out = [f"# DECISION MEMORY — repo `{repo}` (from Obsidian)",
           f"Vault folder: {repo_dir}",
           f"Next decision ID: {next_id}", ""]

    g = ai / "_global.md"
    if g.exists():
        out += ["## Global rules (all repos)", clip(body_of(g.read_text(encoding='utf-8')), MAX_GLOBAL_CHARS), ""]

    out.append("## ACCEPTED — binding. Do not contradict; propose a superseding decision instead.")
    used = 0
    for d in accepted:
        block = f"### {d['id']} — {d['title']}\n{d['body']}"
        if used + len(block) <= MAX_ACCEPTED_CHARS:
            out.append(block)
            used += len(block)
        else:
            out.append(f"- {d['id']} — {d['title']} (full text: {d['file']})")
    if not accepted:
        out.append("- none")

    out += ["", "## PROPOSED — provisional, awaiting the user's review. Follow, but flag if you hit trouble."]
    out += [with_feedback(f"- {d['id']} — {d['title']} ({d['file']})", d) for d in proposed] or ["- none"]

    out += ["", "## REJECTED — do not re-propose without new evidence."]
    out += [with_feedback(f"- {d['id']} — {d['title']}", d) for d in rejected] or ["- none"]

    sessions = sorted(ses_dir.glob("*.md"))
    if sessions:
        last = sessions[-1]
        out += ["", f"## Last session summary ({last.name})",
                clip(body_of(last.read_text(encoding='utf-8')), MAX_SESSION_CHARS)]

    emit("\n".join(out), plain)


if __name__ == "__main__":
    main()
