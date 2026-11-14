#!/usr/bin/env python3
"""
Goal gate: a Stop hook that won't let the main session finish until the goal's
verification script passes (exit 0), or the iteration cap is hit, or the
orchestrator escalates by writing .claude/goal/BLOCKED.

"Done" is decided by running a script, never by a model reading the transcript.

State (local, gitignored), written by /goal-run after the user approves:
  .claude/goal/state.json   {"status": "active", "goal": "...", "max_iterations": 6,
                             "iteration": 0, "verify_sha256": "...", "verify_source": "..."}
  .claude/goal/verify.sh    the approved checks; agents must not edit it
  .claude/goal/BLOCKED      (optional) written by the orchestrator to escalate to the user
  .claude/goal/log.md       appended on every gate decision
"""
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

VERIFY_TIMEOUT = 840          # seconds; settings.json hook timeout must be larger
TAIL_LINES = 60


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")


def main() -> None:
    try:
        json.load(sys.stdin)                       # hook input; not needed beyond draining it
    except Exception:
        pass

    root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    gdir = os.path.join(root, ".claude", "goal")
    state_path = os.path.join(gdir, "state.json")
    verify_path = os.path.join(gdir, "verify.sh")
    log_path = os.path.join(gdir, "log.md")

    if not os.path.exists(state_path):
        sys.exit(0)                                # no goal → normal stop
    try:
        state = json.load(open(state_path))
    except Exception:
        sys.exit(0)
    if state.get("status") != "active":
        sys.exit(0)

    def save(status=None, note=""):
        if status:
            state["status"] = status
        json.dump(state, open(state_path, "w"), indent=2)
        with open(log_path, "a") as f:
            f.write(f"- {now()} · iteration {state.get('iteration')}/{state.get('max_iterations')}"
                    f" · {state['status']}{' · ' + note if note else ''}\n")

    def block(reason: str):
        print(json.dumps({"decision": "block", "reason": reason}))
        sys.exit(0)

    # 1. Human escalation: allow the stop, keep the reason for the user.
    blocked = os.path.join(gdir, "BLOCKED")
    if os.path.exists(blocked):
        save("blocked", open(blocked).read().strip()[:300])
        sys.exit(0)

    # 2. Iteration cap (counts every gate decision, including tamper restores).
    state["iteration"] = int(state.get("iteration", 0)) + 1
    if state["iteration"] > int(state.get("max_iterations", 6)):
        state["iteration"] -= 1
        save("exhausted", "iteration cap reached without passing")
        sys.exit(0)

    # 3. Tamper protection: restore the approved verify.sh if it was changed or deleted.
    src = state.get("verify_source", "")
    current = open(verify_path).read() if os.path.exists(verify_path) else None
    if current is None or hashlib.sha256(current.encode()).hexdigest() != state.get("verify_sha256"):
        with open(verify_path, "w") as f:
            f.write(src)
        save(note="verify.sh was modified or deleted; restored")
        block("The goal's verify.sh was modified or deleted. It has been restored to the approved "
              "version. Do NOT edit .claude/goal/verify.sh; change the code so the checks pass.")

    # 4. Run the checks.
    try:
        r = subprocess.run(["bash", verify_path], cwd=root, capture_output=True, text=True,
                           timeout=VERIFY_TIMEOUT)
        code, out = r.returncode, (r.stdout + r.stderr)
    except subprocess.TimeoutExpired:
        code, out = 124, f"verify.sh timed out after {VERIFY_TIMEOUT}s"

    if code == 0:
        save("met", "verify.sh exit 0")
        sys.exit(0)

    tail = "\n".join(out.strip().splitlines()[-TAIL_LINES:])
    save(note=f"verify.sh exit {code}")
    block(
        f"GOAL NOT MET (iteration {state['iteration']}/{state['max_iterations']}). "
        f"Goal: {state.get('goal', '')}\n\nverify.sh output (tail):\n{tail}\n\n"
        "Continue under CLAUDE.md rules: delegate fixes to subagents, re-run review/QA. "
        "Do not weaken, skip or delete tests, and do not edit verify.sh. If you need a human "
        "decision (escalation rule), write the question to .claude/goal/BLOCKED and stop."
    )


if __name__ == "__main__":
    main()
