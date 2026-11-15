# Outpost Dial

A Junior Astronaut Mission Trainer for NASA Space Apps 2026. Kids aged 7 to 12 run a Mars outpost for 10 sols: each sol they place 3 astronauts on 5 jobs, and real archived solar storms from NASA DONKI test their choices.

Design: see the game design doc and the MVP PRD in the project.

## Run it

```bash
npm install
npm run dev          # local dev server
npm test             # rule tests (vitest)
npm run balance      # 1,000 real runs per mode: reference player in its win band, forecast pays, no fixed plan > 80%
npm run fetch:donki  # downloads real DONKI data into public/data/sky.json (needs internet)
npm run build        # static site in dist/
```

## Storm data

`public/data/sky.json` holds real NASA DONKI data for 2012 to 2025, fetched 2026-11-15. To refresh it, run `npm run fetch:donki` on a machine with internet, check the printed samples and the Sept 2017 window, commit the new `sky.json`, then run `npm test` and `npm run balance`: new data can move the balance. If the file is ever sample data again (`"sample": true`), the game shows a "SAMPLE DATA" banner.

## Layout

| Path | What | Owner |
| --- | --- | --- |
| `src/sim/constants.js` | Every tuning number | A |
| `src/sim/sim.js` | Pure rules: `newGame()`, `step(state, placements, solEvents, rescued)` | A |
| `src/sim/sky.js` | Picks a real 10-day window and turns it into sols | A, D |
| `src/main.js` | The game: owns every screen and the flow between them | B, C |
| `src/ui/console/` | Console kit: knob, toggle, gauges, lamps, log, drawer, ticker tape, sound (demo at `/kit.html`) | C |
| `src/ui/map/` | Outpost map for placing astronauts | B |
| `src/ui/jobInfo.js` | Help card text for each job | B, C |
| `src/styles.css` | Console colour tokens | C |
| `scripts/fetch-donki.mjs` | DONKI fetch | D |
| `scripts/balance-sim.mjs` | Balance simulator | A |
| `test/` | Rule tests, balance and fetch script tests, and `test/ui/` click-through tests (jsdom) | A |
| `docs/PRD.md`, `tasks.md`, `plans/` | Product requirements, task list, plans | |

## Rules of the road

- Never put game rules in UI code. UI calls `step()` and draws the result.
- Change numbers only in `constants.js`, then run `npm test` and `npm run balance`.
- Never call a NASA API from the browser. Archived data only, always labelled with its real date.

## Deploy

Hosted on Cloudflare, set up in the Cloudflare dashboard (build command `npm run build`, output directory `dist`). The GitHub Actions workflow only tests and builds; it does not deploy.
