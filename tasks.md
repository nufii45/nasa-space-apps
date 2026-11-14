# Outpost Dial: remaining tasks

Checked 2026-11-15 against the code on `main` (7e1049a). Roles A to D are the owners named in
`README.md`. The original game design doc and MVP PRD are not in this repo, so this list comes
from the README, the code and its comments. `docs/PRD.md` is a PRD rebuilt from the same sources.

## Where each role stands

| Role | Area | Status |
| --- | --- | --- |
| A | Rules, balance, tests (`src/sim/`, `test/`, `scripts/balance-sim.mjs`) | Done on sample data: 17 tests pass, balance check passes |
| B | Outpost map for the plan screen | Not started: no map code exists, the plan screen is still rows of plain buttons |
| C | Console kit (`src/ui/console/`) | Kit built and shown on `/kit.html`, but the game does not use it yet (`src/main.js` imports nothing from it) |
| D | Real storm data (`public/data/sky.json`) | Not done: the file is still sample data (`"sample": true`, `"fetched": null`) |

The game is playable today from title to debrief with the debug UI. `npm test`, `npm run balance`
and `npm run build` all pass.

## Tasks, in order

- [ ] **1. Fetch the real DONKI data** (D)
  Fetched 2026-11-15 after fixing the script (DONKI now limits a request to 60 days):
  3,915 events, 2012 to 2025. Still to do: check the data and commit `sky.json` and the script.
  Run `npm run fetch:donki` on a machine with internet. Check the printed counts and samples,
  and that the September 2017 window is there. Commit the new `public/data/sky.json`.
  Done when: `"sample": false`, `"fetched"` holds a date, and the SAMPLE DATA banner is gone.
  Never edit `sky.json` by hand.

- [ ] **2. Re-check balance on the real data** (A, needs task 1)
  First result on real data: the check passes, but the best adaptive player now wins only about
  25% of runs (81% on the sample). The game is too hard as tuned and needs retuning.
  Run `npm test` and `npm run balance`. If a fixed plan wins more than 80% of runs, retune in
  `src/sim/constants.js` only, then run both again.
  Done when: both commands exit 0 with the real `sky.json`.

- [ ] **3. Split the screens out of `src/main.js`** (B and C agree first)
  B and C both have to change `src/main.js`, so they cannot work at the same time as it stands.
  Give the map its own folder (`src/ui/map/`) with one mount call in `main.js`, the same way the
  kit lives in `src/ui/console/`.
  Done when: B and C each own files the other does not touch.

- [ ] **4. Put the console kit into the game** (C)
  Replace the debug gauges, mission log and buttons in `src/main.js` with the kit components
  (`createGauge`, `createMissionLog`, `createCoverButton`, `createMuteSwitch` and the rest).
  Keep the flow: title, then plan, rescue and report for 10 sols, then debrief.
  Done when: no debug gauge or log markup is left in `main.js`, and sound can be muted.

- [ ] **5. Build the outpost map plan screen** (B)
  Replace the per-astronaut button rows with the map: place 3 astronauts on 5 jobs, one per job,
  anyone unplaced goes to the Shelter. The UI only calls `normalisePlacements()` and `step()`;
  no game rules in UI code.
  Done when: a full run can be played on the map with mouse, touch and keyboard.

- [ ] **6. Test the finished game** (QA, needs tasks 1 to 5)
  Play both modes (Cadet, Commander) and both missions (Random week, Sept 2017) to the debrief.
  Check a phone-width screen, keyboard-only play, the Commander rescue timer and the credits
  page. Add tests for any UI logic that has branches.
  Done when: reviewer approves and QA passes.

- [ ] **7. Deploy** (you, in the Cloudflare dashboard)
  Build command `npm run build`, output directory `dist`. Agents do not deploy.
  Then write the staging URL into `CLAUDE.md` under Project facts.

## Decisions needed from you

- Should `/kit.html` ship in the public build? It does today (`vite.config.js` builds both pages).
- Answer the open questions at the end of `docs/PRD.md`; tasks 4 to 6 depend on them.
- If you still have the original game design doc and PRD, add them to `docs/`.

## Not needed for the app to work

These only matter for the Grok Bot test loop: staging URL, seed demo data, demo roles and the
GitHub repo entry in `CLAUDE.md`, and the placeholders in `grok/GROK_BOT_INSTRUCTIONS.md`.
