---
description: Cancel the active autonomous goal loop
---

Cancel the active goal: set `"status": "cancelled"` in `.claude/goal/state.json` (leave
verify.sh and log.md in place for the record), then summarize what is on the branch and
what remains, and write the session note.
