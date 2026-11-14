---
description: Run an orchestration autonomously until a machine-checkable goal passes
argument-hint: <goal, stated as an end condition>
---

Run this goal autonomously: $ARGUMENTS

Follow "Autonomous goal loop" in CLAUDE.md. Two phases; the boundary between them matters.

## Phase A: define done (with me; nothing is active yet)
1. Do workflow steps 0–2 (RECALL, UNDERSTAND, PLAN) for the goal.
2. If the goal isn't checkable by commands (e.g. "make it nicer"), stop and ask me to
   restate it as an end condition.
3. Establish the baseline on the base branch: run the test/check commands from Project
   facts and record the current test count.
4. Draft `.claude/goal/verify.sh` from `.claude/templates/goal-verify.sh`. Write it with a
   Bash heredoc, because Edit/Write are denied on goal files by design: one `check` per
   acceptance criterion, plus all anti-gaming checks with the real baseline. Run it once;
   it should FAIL now (otherwise the goal is already met, or the checks are too weak).
5. Show me: the plan, the full verify.sh, the branch name, and max_iterations (default 6,
   max 10). Wait for my explicit approval. Any question I need to answer goes here.

## Phase B: autonomous (only after I approve)
6. Create the work branch. Activate the gate by writing `.claude/goal/state.json` (via Bash
   with python3 json.dump, so verify_source is escaped correctly):
   {"status": "active", "goal": "<one line>", "max_iterations": N, "iteration": 0,
    "verify_sha256": "<sha256 of verify.sh>", "verify_source": "<exact verify.sh content>"}
   Compute the hash with: `shasum -a 256 .claude/goal/verify.sh` (or `sha256sum`).
7. Execute the plan (steps 3–7) without asking me anything. When you finish a turn, the
   Stop hook runs verify.sh and sends you back with the failures until it passes.
8. Escalation rules in CLAUDE.md still apply. If one triggers, write the question to
   `.claude/goal/BLOCKED` and stop; don't guess.
9. When the gate lets you stop, write the session note (include `.claude/goal/log.md`) and
   report: met / exhausted / blocked, iterations used, and what's on the branch. Never merge
   or push.
