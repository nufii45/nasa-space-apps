# Prompt: build the wireframes with 7 parallel subagents

Paste everything below the line into Claude Code, opened in the NASA repo.

---

You are the orchestrator for this repo (see `CLAUDE.md`). Complete the tasks in
`wireframe_tasks.md` using **7 subagents in parallel lanes**, quickly and without any two agents
ever editing the same file. Read `CLAUDE.md`, `wireframe_tasks.md` and `docs/wireframes/README.md`
first. The wireframe boards are in `docs/wireframes/source/*.dc.html`: read them for copy, sizes and
states. They are references, never code to import.

## 0. Preflight (stop if any check fails)

1. `git status` must be clean. If it isn't, stop and ask me to commit first. Never stash or
   discard my changes.
2. `npm test` and `npm run build` must pass on the current `HEAD`. Write down the test count as the
   baseline. Known flake: in `test/ui/map.test.js`, "starting from RAW placements" can time out
   under heavy parallel load but passes alone. If it is the only failure, re-run that file alone
   before calling it a regression.
3. Create the integration branch `feat/wireframes` from `HEAD`. **Never push to `main`, never
   deploy, never merge into `main`.** Every push to `main` goes live on Cloudflare.
4. Read the decisions D1 to D4 in `wireframe_tasks.md`. If one is not ticked, ask me now, in one
   message, before starting the lanes that depend on it:
   - D1 blocks lane 4.
   - D2 blocks the lamp words in lane 6.
   - D3 blocks lanes 2 and 3.
   - D4 blocks lane 1.

   Record D3, and decision X below, as `proposed` in Obsidian when we settle them.

## 1. Phase gate

- **Phase 1 (now, before the 11:30 PM freeze):** Tier 1 only (W1 to W4). Lane 6 does W1 and the
  W4 storage logic. Lane 5 builds the Sol result, ending and resume-prompt views (W2, W3 and the
  W4 prompt). Lane 7 verifies. Lanes 1 to 4 do not start.
- **Phase 2 (Tier 2, W5 to W16):** start only when I type `GO TIER 2` in this session. Until
  then, do not start lanes 1 to 4, even if Phase 1 finishes early.

## 2. How collisions are prevented (all binding)

1. **One owner per file.** The ownership table below is exhaustive. An agent may create or edit
   only its own files. If it needs a change elsewhere, it writes a `REQUEST:` line in its report
   and the owner makes the change. `package.json`, `package-lock.json`, `vite.config.js`,
   `src/sim/**`, `public/data/**`, `.github/**` and `CLAUDE.md` belong to nobody. No lane touches
   them; escalate to me instead.
2. **Separate worktrees.** Spawn every implementer with `isolation: "worktree"`, each on its own
   branch `feat/wf-<lane>` cut from `feat/wireframes`. Lanes never share a working directory, so
   they cannot overwrite each other or break each other's test runs.
3. **Contracts first, code second.** Lanes code against the interfaces in section 4, not against
   each other's unfinished code. Stage, callouts and screens use stub data in their own tests.
4. **Only the orchestrator merges,** into `feat/wireframes`, in the order in section 5, after
   lane 7 approves. Use `git merge --no-ff`. A conflict means the ownership rules were broken:
   stop and report it to me. Never resolve it by deleting someone's work.
5. **New CSS goes in new files** owned by its lane. Only lane 6 edits `src/styles.css`, and only
   to `@import` the lane files.
6. **No new dependencies.** Fonts are self-hosted files if D4 says so.

## 3. Lanes and owned files

| Lane | Agent | Tasks | Owns (may create or edit only these) |
| --- | --- | --- | --- |
| 1 Theme | implementer | W5 | `src/ui/theme.css`, `public/fonts/**`, `index.html` |
| 2 Stage | implementer | W6, W8, stage part of W14 | `src/ui/stage/index.js`, `src/ui/stage/geometry.js`, `src/ui/stage/toolbar.js`, `src/ui/stage/stage.css`, `test/ui/stage.test.js` |
| 3 Callouts | implementer | W7 | `src/ui/stage/callouts.js`, `src/ui/stage/callouts.css`, `test/ui/callouts.test.js` |
| 4 Drawer | implementer | W12 | `src/ui/console/infoDrawer.js`, `src/ui/console/console.css`, `src/ui/jobInfo.js`, `kit.html`, `src/kit.js`, `test/ui/drawer.test.js` |
| 5 Screens | implementer | Views for W2, W3, W4 prompt, W11, W13 | `src/ui/screens/*.js`, `src/ui/screens/screens.css`, `test/ui/screens.test.js` |
| 6 Integrator | implementer | W1, W4 logic, W9, W10, W15, the lamp words, and wiring everything in | `src/main.js`, `src/styles.css`, `test/ui/game.test.js`, `test/ui/resume.test.js` |
| 7 Verifier | reviewer, then qa | Reviews every lane; W16 | `test/ui/a11y.test.js` only; otherwise read-only |

Lane 4 is the only lane allowed to change the console kit (`CLAUDE.md` says the kit is changed
only as its own task; this is that task).

**Decision X (record as proposed):** screens become pure view builders in `src/ui/screens/`.
`src/main.js` still owns the flow and all state. View files import nothing from `src/sim/`. They
take a plain model object and handlers, and return DOM. This lets lane 5 work in parallel
without touching `main.js`. If decision 0002 was accepted in a way that forbids this, stop and
ask me.

## 4. Contracts (do not change them without asking me)

```js
// Lane 2: src/ui/stage/index.js
createStage({ jobs, crew, placements, picked, selected,
              mode /* 'plan'|'storm' */, layout /* 'desktop'|'phone' */,
              onStation(id), onHelp(id) })
  → { el, update(partial), hotspots() /* [{ id, x, y }] in stage px */, overlay /* HTMLElement for callouts */, destroy() }
// 6 hotspots: solar, rover, recycler, pump, lab, shelter. Each one is a <button> with an aria-label
// like "Solar Field: Ana is here". No imports from src/sim/; jobs and crew come in as data.

// Lane 3: src/ui/stage/callouts.js
createCallouts({ stage, stations /* [{ id, title, text, icon }] */, who /* { jobId: [names] } */,
                 selected, picked, layout, onSelect(id), onHelp(id) })
  → { el, update(partial), setVisible(bool) }
// Mounts into stage.overlay. Card slots come from Scene.dc.html (desktop); none on phone.

// Lane 4: src/ui/console/infoDrawer.js. The existing API stays compatible:
createInfoDrawer() → { el, open({ title, tabs, source }), close }
// Side drawer at >= 700 px wide, bottom sheet below that. Focus returns to the opener on close.

// Lane 5: src/ui/screens/*.js. Each view: render(model, handlers) → { el, update(model) }
solResult: { sol, date, changes: [{ text: '+5 power', why, dir: 'up'|'down' }],
             doses: [{ name, before, after }], isLast }                  handlers { onNext }
report:    { ending: 'win'|'home'|'time', stars, reason, science, sky: { start, end },
             storms: [{ label, date }], tip, sept2017 }                   handlers { onTryAgain, onChangeMission, onTitle }
storm:     { title, classText, timed, left, timesUp, caughtText,
             rows: [{ id, name, where, status: 'out'|'walk'|'safe', walkLeft }] }  handlers { onBring(id), onReady }
title:     { mission: 'random'|'sept2017', mode: 'cadet'|'commander', sample }    handlers { onLaunch({ mission, mode }) }
resume:    { sol, missionLabel, modeLabel }                               handlers { onResume, onStartOver }
// The views may use the console kit (src/ui/console/index.js). Use the singular "1 second left".
```

Lane 6 builds these models from the simulator state and passes them in. Wording rules are in
`wireframe_tasks.md` ("Rules for the agent"). "Radiation" everywhere, never "sunburn".

## 5. Order of work and merge order

**Phase 1:**
- Start lanes 5 and 6 together. Lane 6 does W1, then the W4 storage logic. Lane 5 does
  `solResult`, `report` and `resume`.
- Merge lane 5 first, then lane 6.
- Lane 6 then wires W2, W3 and W4 into `main.js` and updates `game.test.js`. That makes a second
  lane-6 merge.

**Phase 2:**
- Start lanes 1, 2, 3, 4 and 5 (`storm`, `title`) together.
- Merge order: 1 Theme → 4 Drawer → 2 Stage → 3 Callouts → 5 Screens.
- Lane 6 starts its wiring after each merge it depends on. It rebases its branch on
  `feat/wireframes` before every merge and is always merged last.

After every merge into `feat/wireframes`:
- run `npm test` (count ≥ baseline, 0 failed) and `npm run build`;
- run `npm run balance` only if `src/sim/` changed. It must not have.

## 6. Done for each task

Done means lane 7 gives reviewer APPROVE and QA PASS against that task's acceptance criteria in
`wireframe_tasks.md`. The implementer's own word does not count.

- Give lane 7 the spec, the diff and the relevant decisions. Never give it the implementer's
  self-assessment.
- Cap fix loops at 2 per task, then escalate to me.
- Tick the task in `wireframe_tasks.md` and move it to "Done" with the date and merge commit.
  Only the orchestrator edits that file.

## 7. Briefs

Every spawn uses the Task Brief format from `CLAUDE.md`. Fill it in like this:
- **Files you own:** copy the lane's row from section 3 exactly.
- **Contract:** paste that lane's interface from section 4.
- **Acceptance criteria:** copy them from `wireframe_tasks.md`.
- **Boards to match:** name them.
- **Constraints:** no new dependencies; nothing from `src/sim/` in view, stage or callout code;
  44 px touch targets; visible focus ring; Reduced motion respected; `localStorage` wrapped in
  try/catch.
- **Out of scope:** every file not listed as owned.

Keep briefs short. Subagents start blank, so put in everything they need and nothing else.

## 8. Report to me

When Phase 1 is merged, send the CLAUDE.md report with the test counts. Wait there until I say
`GO TIER 2`. When Phase 2 is merged, send the report again, plus the branch name and the list of
any `REQUEST:` lines you could not satisfy.

Never open a pull request into `main` and never push `main` yourself. I review
`feat/wireframes` and decide when it ships.
