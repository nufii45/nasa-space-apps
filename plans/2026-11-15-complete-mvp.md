# Plan: complete tasks.md (Outpost Dial MVP)

Written 2026-11-15. Status: approved by the user 2026-11-15 with all defaults below, including
the `jsdom` dev dependency. Source: `tasks.md`, `docs/PRD.md`. Decisions: 0002 to 0005.

## Goal

Finish tasks 1 to 6 of `tasks.md`: real storm data committed, difficulty retuned for it, console
kit and outpost map in the game, and the finished game tested. Task 7 (deploy) stays with the
user (decision 0001).

## What changed since tasks.md was written

- Task 1 is done apart from the commit: the fetch script is fixed and `sky.json` holds real data.
- Task 2 is a real retune, not a re-check. On real data the reference "sensible kid" player wins
  25% of runs in Commander and 35% in Cadet (81% on the sample). The reference plan has no slack:
  it reaches 100 science on sol 10 only if nothing interrupts it, and the real archive has a Mars
  CME on about 1 day in 10.
- Task 3 (split `main.js`) is dropped. The map gets its own folder instead (decision 0002,
  proposed), which gives the same result without a refactor.

## Defaults I will use unless you change them

1. **Difficulty target.** Reference player wins 65 to 80% in Cadet and 45 to 65% in Commander on
   real data; still no fixed plan above 80%. The balance script fails outside those bands.
   Retune through `constants.js` only; the rules in `sim.js` and the reference player stay as
   they are.
2. **Results after each sol.** No separate screen. The new lines appear in the mission log on the
   next plan screen, as now.
3. **Outpost map.** A simple top-down SVG drawn in code: six stations (five jobs and the
   Shelter) as large buttons, three astronaut tokens. Tap an astronaut, then tap a station. No
   drag and drop, no image assets.
4. **Kit placement.** As the kit test page already shows: mission on a knob, mode on a toggle,
   LAUNCH and END SOL on cover buttons, four needle gauges, warning lamps, mission log, job help
   in the info drawer, debrief on the ticker tape, mute switch on every screen.
5. **UI tests.** Add `jsdom` as a pinned dev dependency so QA can play a full run by simulated
   clicks. This is a new dependency, so it needs your yes. Without it, UI checks are by hand.
6. **`/kit.html`** stays in the build.
7. **Git.** Work on a new branch `feat/mvp-ui`, one commit per task, no push.

## Tasks

| # | Task | Agent | Files owned | Runs |
| --- | --- | --- | --- | --- |
| T0 | Branch, commit what exists (data, fetch fix, tasks.md, PRD, this plan) | Orchestrator | none (git only) | first |
| T1 | Retune difficulty on real data | implementer | `src/sim/constants.js`, `scripts/balance-sim.mjs`, `test/sim.test.js`, `docs/PRD.md` section 6 | parallel |
| T2 | Put the console kit into the game | implementer | `src/main.js`, `src/styles.css`, `index.html` | parallel |
| T3 | Build the outpost map module | implementer | `src/ui/map/**` | parallel |
| T4 | Mount the map on the plan screen | implementer | `src/main.js`, `src/styles.css` | after T2 and T3 |
| T5 | Test the finished game | qa | `test/**`, `package.json` and lockfile (jsdom, through npm only) | after T4 |

Each of T1 to T4 goes through reviewer and QA before it counts as done, with at most 2 fix
cycles. The reviewer for T1 also reviews the fetch script fix, which has had no review.

### Acceptance criteria

**T1 Retune**
- [ ] `npm run balance -- --mode cadet` and `--mode commander` both exit 0 on the real `sky.json`.
- [ ] Reference player win rate is inside the band for each mode (default 1).
- [ ] No fixed plan wins more than 80% of runs.
- [ ] The balance script exits 1 when the reference player is outside its band.
- [ ] `npm test` passes; `docs/PRD.md` section 6 matches the new numbers.

**T2 Console kit**
- [ ] `src/main.js` uses the kit for gauges, log, lamps, LAUNCH, END SOL, mission, mode and mute.
- [ ] No debug gauge or log markup is left in `main.js`.
- [ ] Flow unchanged: title, then plan and rescue for up to 10 sols, then debrief; credits page works.
- [ ] No game rules in UI code; `npm test` and `npm run build` pass.

**T3 Outpost map**
- [ ] `createOutpostMap({ jobs, crew, placements, onChange })` returns `{ el, set(placements) }`.
- [ ] One astronaut per job; anyone unplaced is shown in the Shelter; astronauts who went home
      cannot be placed.
- [ ] Every station and astronaut is a real button with a text label, reachable by keyboard.
- [ ] Imports nothing from `src/sim/sim.js`; job names and places come from the `jobs` argument.

**T4 Integration**
- [ ] The plan screen places astronauts only through the map; the old button rows are gone.
- [ ] A full run can be played to the debrief; `npm test` and `npm run build` pass.

**T5 Final QA**
- [ ] Automated full run to the debrief for Cadet and Commander, Random week and Sept 2017.
- [ ] Commander rescue countdown and the Rover walk-back are covered by a test.
- [ ] `npm test`, `npm run balance` (both modes) and `npm run build` all pass.

## Not covered

- Layout on a real phone and by touch: no agent can see the screen. I will open the page in a
  browser for a smoke check if the browser tools are available; otherwise this is yours to check.
- Deploy and the staging URL (task 7), and the Grok Bot loop that follows it.
