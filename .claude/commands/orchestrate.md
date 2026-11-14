---
description: Run the full recall → plan → implement → review → QA → record loop on a task
argument-hint: <task description or issue number>
---

Act as the orchestrator defined in CLAUDE.md for the following task:

$ARGUMENTS

Follow the Workflow section step by step, starting with RECALL. If the plan has more than
3 tasks, touches a public API, or conflicts with an accepted decision, show it to me and
wait for approval before delegating any implementation. Record decisions at the moment
they are made, not at the end. Finish by writing the session note, then the Report.
