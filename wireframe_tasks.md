# Outpost Dial: wireframe tasks

Written 2026-11-15. These tasks turn the wireframes in `docs/wireframes/` into the game. The live,
clickable canvas is linked in [`docs/wireframes/README.md`](docs/wireframes/README.md). Each task
below is written to drop into a Task Brief (`CLAUDE.md`): goal, acceptance criteria, owned files
and the wireframe board to match.

## Rules for the agent

- **Never push to `main`.** Cloudflare deploys every push to `main` to the live site. Work on the
  branch `feat/wireframes`, one commit per task, conventional commit subjects, no AI attribution.
- **Before the 11:30 PM code freeze on 15 Nov, do Tier 1 only.** Tier 2 waits until after the
  Space Apps submission.
- After every task, `npm test` and `npm run build` must pass. Run `npm run balance` only if a
  task touches `src/sim/` (none should).
- Never put game rules in UI code. UI calls `step()` and draws the result. `src/ui/map/` and the
  new `src/ui/stage/` import nothing from `src/sim/`.
- **No new dependencies.** Fonts, 3D or animation libraries need the user's approval first.
- `src/ui/console/` is a finished kit: change it only in a task that says so.
- Kid words: one sentence per idea, "radiation" everywhere (never "sunburn"), a sol is "a Mars
  day", a CME is "a cloud of Sun material", a flare is "a flash from the Sun".
- Every control is at least 44 px, has a visible focus ring, and never uses colour as its only
  signal.
- Any write to `localStorage` is wrapped in try/catch, and the game must still work when storage
  is blocked.

## Decisions needed from the user before starting

- [ ] **D1. Help tab name.** The wireframes say "Numbers". The live game says "How much" (changed
  tonight after the Grok test). Pick one.
- [ ] **D2. Storm lamp word.** The wireframes say COMING (storm forecast) and ALERT (storm now).
  The live game says WATCH OUT. Pick one.
- [ ] **D3. Isometric SVG, not WebGL** (record as a proposed decision in Obsidian). Reason: same
  look as the reference, works on school Chromebooks, no new dependency, every hotspot stays a
  real button.
- [ ] **D4. Fonts.** Barlow, Barlow Semi Condensed and JetBrains Mono need either a Google Fonts
  link (a network request on every load) or self-hosted files in `public/fonts/` (no
  dependency, about 200 KB). Recommended: self-host.

## Tier 1: small, safe, existing UI (OK before the freeze)

- [ ] **W1. Try again keeps the mission and rank.**
  Today "Try again" always starts a random week, even after the Sept 2017 mission.
  - Acceptance: Try again restarts with the same mission and mode. A new "Change mission"
    button returns to the title with the previous choices still set. A UI test covers both.
  - Owns: `src/main.js`, `test/ui/game.test.js`.
  - Board: `Report.dc.html` (buttons row).

- [ ] **W2. Sol result card between sols.**
  After END SOL (and after a rescue), show a short card of what changed, then the next plan.
  - Acceptance: lists only the changes, each with a word: "+5 power", "−2 water", "+6 science",
    and one line for each astronaut whose radiation went up ("Ana +20 radiation", with the meter
    before → after). NEXT SOL is the only button; Enter works; focus lands on the heading. The
    last sol goes straight to the report. Update the tests that expect the plan screen right
    after a sol.
  - Owns: `src/main.js`, `src/styles.css`, `test/ui/game.test.js`.
  - Board: `SolResult.dc.html`, `SolResultPhone.dc.html`.

- [ ] **W3. Three clearly different endings.**
  - Acceptance: win (teal), crew went home (orange) and out of time (navy) each get their own
    colour and picture. The reason is the big line under the headline. For a crew going home,
    say why: "The water ran out 2 sols in a row" or "Ana got too much radiation". A UI test
    checks the headline and reason text for each ending.
  - Owns: `src/main.js`, `src/styles.css`, `test/ui/game.test.js`.
  - Board: `Report.dc.html`, `ReportHome.dc.html`, `ReportTime.dc.html`.

- [ ] **W4. Resume after a refresh.**
  - Acceptance: after each sol, save the run in `localStorage` (state, run window, mode, mission,
    placements). On load, if a run is saved, show "Resume your mission? Sol 4 of 10 · Sept 2017 ·
    Commander" with Resume and Start over. Finishing a run clears the save. The game still
    starts normally if storage throws. Tests cover saving, resuming, starting over and blocked
    storage.
  - Owns: `src/main.js`, `test/ui/game.test.js` (or a new `test/ui/resume.test.js`).
  - Board: `States.dc.html` panel D, `StatesPhone.dc.html`.

## Tier 2: the 3D console (after the submission)

- [ ] **W5. Design tokens and fonts.** Needs D4.
  - Acceptance: the colours, type and spacing from `docs/wireframes/README.md` are CSS custom
    properties in `src/styles.css`. Fonts load per D4. Paper background with the 32 px grid.
    `kit.html` still renders.
  - Owns: `src/styles.css`, `index.html`, `kit.html`, `public/fonts/` (if self-hosted).

- [ ] **W6. Isometric stage component.** Needs D3.
  - Acceptance: a new `src/ui/stage/` draws the outpost as SVG: ground plate, base floor,
    Shelter dome with its water-wall ring, Recycler, pump and tank, battery, Lab, four solar
    panels, rover, and the power and water pipes. The geometry can be ported from
    `docs/wireframes/source/Scene.dc.html` (`P(x, y, z)` projection, `box`, cylinder and dome
    helpers). The 6 hotspots are `<button>`s with labels like "Solar Field: Ana is here".
    Astronauts stand at their station. API: `createStage({ jobs, crew, placements, picked,
    onStation, onHelp, mode })` → `{ el, update(state) }`. jsdom tests check 6 hotspots,
    their labels, and that a click calls `onStation(id)`.
  - Owns: `src/ui/stage/*`, `test/ui/stage.test.js`.
  - Board: `Scene.dc.html`.

- [ ] **W7. Callouts, leader lines and the Labels toggle.**
  - Acceptance: each hotspot has a callout card (icon, UPPERCASE title, one sentence, who is
    there, a 44 px "?" that calls `onHelp`). Dashed leader lines go from card to dot. Labels on
    and off works; the phone layout has no callouts and shows the selected station's card under
    the stage instead.
  - Owns: `src/ui/stage/*`, `test/ui/stage.test.js`.
  - Board: `Main.dc.html`, `PhonePlan.dc.html`.

- [ ] **W8. Stage toolbar: rotate, zoom, pan.**
  - Acceptance: rotate left/right steps through 4 pre-drawn 90° views; zoom 75% to 150%; drag
    pans; the info button explains the controls; keyboard works for every control.
  - Owns: `src/ui/stage/*`, `test/ui/stage.test.js`.

- [ ] **W9. Plan screen layout.** Needs W6 and W7.
  - Acceptance: desktop has the left rail (Home, How to play, Sound, Credits), a sol track in
    the header, the Sun report card, the stage, a crew strip at the bottom, and a right panel
    with status (4 lamps, 4 gauges with the science goal marker), Station/Mission log tabs and
    the END SOL cover. Phone has one column, a swipeable crew carousel, sideways-scrolling
    tabs, a sticky END SOL bar and a bottom nav. Placing works as today: tap an astronaut, then
    a station; one per job; the Shelter takes everyone; unplaced crew rest in the Shelter. A
    taken job says "Pick another station". Existing plan-screen tests still pass or are
    updated to the new layout.
  - Owns: `src/main.js`, `src/styles.css`, `test/ui/game.test.js`.
  - Board: `Main.dc.html`, `PhonePlan.dc.html`.

- [ ] **W10. Flat map fallback.**
  - Acceptance: the current `src/ui/map/` stays as the fallback when SVG fails or the player
    turns 3D off, with the notice "Simple map: your device can't show the 3D view." Both paths
    are covered by tests.
  - Owns: `src/main.js`, `src/ui/map/*` (only if needed), tests.
  - Board: `States.dc.html` panel C.

- [ ] **W11. Storm takeover.**
  - Acceptance: orange full-screen takeover over the dimmed stage. Title in kid words; the real
    flare class in small text with a "?" explainer. Each outside astronaut goes Outside →
    Walking back… → Safe in the Shelter. Commander shows a countdown ring from 10, with "1
    second left" in the singular. Time's up stays on screen about 2 seconds before moving on.
    Cadet shows Done and no timer.
  - Owns: `src/main.js`, `src/styles.css`, `test/ui/game.test.js`.
  - Board: `Storm.dc.html`, `StormTimesUp.dc.html`, `StormPhone*.dc.html`.

- [ ] **W12. Help drawer as side drawer and bottom sheet.** Console kit task.
  - Acceptance: side drawer 400 px wide on desktop; bottom sheet (at most 85% tall, drag
    handle) on phone. The header and ✕ never scroll; only the panel scrolls. It fits a
    1024×572 window. Esc and the backdrop close it, and focus goes back to the "?" that opened
    it. Tab names per D1.
  - Owns: `src/ui/console/infoDrawer.js`, `src/ui/console/console.css`, `src/ui/jobInfo.js`,
    `kit.html`, tests.
  - Board: `Drawer.dc.html`, `DrawerPhone.dc.html`.

- [ ] **W13. Title screen.**
  - Acceptance: the logo, the tagline "Run a base on Mars for 10 sols.", the Mission knob, the
    Cadet/Commander switch, LAUNCH under its cover, and the Sound switch, with the idle stage
    turning slowly behind them. The footer says "Storm data: NASA DONKI (archived, real dates)"
    and never "live". The SAMPLE DATA banner shows only with sample data.
  - Owns: `src/main.js`, `src/styles.css`, tests.
  - Board: `Title.dc.html`, `TitlePhone.dc.html`.

- [ ] **W14. Motion and Reduced motion.**
  - Acceptance: cards lift on hover or tap, tab underlines slide, the stage turns slowly when
    idle and stops on input, and dots flow along the pipes while a job runs. A Reduced motion
    setting (on by default when `prefers-reduced-motion` is set) turns all of that off.
  - Owns: `src/styles.css`, `src/ui/stage/*`, `src/main.js`.
  - Board: `Components.dc.html` (Motion).

- [ ] **W15. Keyboard and focus.**
  - Acceptance: tab order matches `States.dc.html` panel F, arrow keys move between hotspots,
    every new screen moves focus to its heading, and every control has the 3 px teal focus ring.
    Add a keyboard-only test of a whole sol.
  - Owns: `src/main.js`, `src/ui/stage/*`, tests.

- [ ] **W16. Check in a real browser.**
  - Acceptance: screenshots at 1280×800, 1024×572 and 390×844 for every screen, compared with
    the boards, plus no console errors in a full run. Then a Grok charter for the new UI
    (staging only).
  - Owns: nothing in `src/`; report only.

## Done

(Move tasks here with the date and commit when finished.)
