# Outpost Dial

A Junior Astronaut Mission Trainer for NASA Space Apps 2026. Kids aged 7 to 12 run a Mars outpost for 10 sols: each sol they place 3 astronauts on 5 jobs, and real archived solar storms from NASA DONKI test their choices.

Design: see the game design doc and the MVP PRD in the project.

## Run it

```bash
npm install
npm run dev          # local dev server
npm test             # rule tests (vitest)
npm run balance      # plays 1,000 runs per strategy, flags any fixed plan that wins > 80%
npm run fetch:donki  # downloads real DONKI data into public/data/sky.json (needs internet)
npm run build        # static site in dist/
```

## IMPORTANT: storm data is a sample until you fetch it

`public/data/sky.json` ships as **sample placeholder data** (`"sample": true`) so the game runs today. The game shows a "SAMPLE DATA" banner until it is replaced. Role D: run `npm run fetch:donki` on a machine with internet, check the printed samples and the Sept 2017 window, then commit the new `sky.json`. Then re-run `npm run balance`.

## Layout

| Path | What | Owner |
| --- | --- | --- |
| `src/sim/constants.js` | Every tuning number | A |
| `src/sim/sim.js` | Pure rules: `newGame()`, `step(state, placements, solEvents, rescued)` | A |
| `src/sim/sky.js` | Picks a real 10-day window and turns it into sols | A, D |
| `src/main.js` | Debug UI, fully playable with plain buttons. Replace screen by screen | B, C |
| `src/styles.css` | Console colour tokens | C |
| `scripts/fetch-donki.mjs` | One-time DONKI fetch | D |
| `scripts/balance-sim.mjs` | Balance simulator | A |
| `test/sim.test.js` | Rule tests | A |

## Rules of the road

- Never put game rules in UI code. UI calls `step()` and draws the result.
- Change numbers only in `constants.js`, then run `npm test` and `npm run balance`.
- Never call a NASA API from the browser. Archived data only, always labelled with its real date.

## Deploy

Hosted on Cloudflare, set up in the Cloudflare dashboard (build command `npm run build`, output directory `dist`). The GitHub Actions workflow only tests and builds; it does not deploy.
