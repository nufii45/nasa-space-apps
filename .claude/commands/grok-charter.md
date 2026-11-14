---
description: Write a test charter for Grok Bot and post it as a GitHub issue
argument-hint: <what is now on staging, e.g. PR #42, issue #17>
---

Write a test charter for the external tester (Grok Bot) covering: $ARGUMENTS

Follow "External tester: Grok Bot" in CLAUDE.md.

1. Confirm the included changes passed QA. Ask me to confirm they are deployed to staging
   (unless Project facts gives you a command to check).
2. Draft the charter with `.github/ISSUE_TEMPLATE/grok-charter.md`:
   user-visible changes, acceptance criteria to verify, risky areas to explore, demo roles
   to use (names only), stop conditions, out of scope, time box (default 30 minutes).
   Pull acceptance criteria from the Task Briefs, and add accepted decisions that define
   intended behavior, so Grok doesn't report them as bugs.
3. Show me the draft and wait for approval.
4. On approval: write the body to a temp file and run
   `gh issue create --repo <GitHub repo from Project facts> --label grok-charter --title "<title>" --body-file <file>`.

Never include credentials, tokens, source code, internal hostnames, or non-staging URLs.
