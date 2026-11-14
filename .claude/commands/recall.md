---
description: Reload decision memory from Obsidian (use after you've edited decisions mid-session)
---

Run `python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/load_decisions.py" --plain` with Bash and
treat its output as the current DECISION MEMORY, replacing any earlier version in this
session. Then tell me in at most 3 lines what changed since the last load (status
changes, new feedback, new decisions) and whether any of it affects work in progress.
