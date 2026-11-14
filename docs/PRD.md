# Outpost Dial: MVP PRD

**Status:** Draft, written 2026-11-15. The original PRD named in `README.md` was not found on
this machine, so this one is rebuilt from the code on `main` (7e1049a), the README and the code
comments. Rules and numbers below match the code. Sections marked *(assumed)* are not backed by
code and need your confirmation.

## 1. Summary

Outpost Dial is a Junior Astronaut Mission Trainer for NASA Space Apps 2026. A child aged 7 to 12
runs a Mars outpost for 10 sols (Mars days). Each sol they place 3 astronauts on 5 jobs, and real
archived solar storms from NASA DONKI test their choices. The lesson: space weather is real, it
can be forecast only in part, and water, power and shelter are how a crew lives through it.

## 2. Players

| Mode | Ages | Difference |
| --- | --- | --- |
| Cadet | 7 to 9 | Rescue is untimed. A big storm is placed in half of random runs. |
| Commander | 10 to 12 | Rescue has a 10 second countdown and crew far from base take time to walk back. A big storm is placed in 80% of random runs. |

## 3. Goals

- A child can finish a full run in one sitting without an adult explaining the rules.
- Every storm in the game is a real recorded event, shown with its real date.
- No single fixed plan wins: the player has to react to the forecast and the gauges.

## 4. Not in the MVP

- Accounts, saved progress, leaderboards, multiplayer.
- Live calls to any NASA API from the browser. Archived data only.
- Languages other than English *(assumed)*.

## 5. Game loop

Title, then for each of 10 sols: plan, rescue (only if a harmful storm hits), results. Then
debrief.

1. **Title.** Pick a mission (Random week, or Featured: Sept 2017 storm) and a mode. Launch.
2. **Plan.** See the sol number, the forecast, the four gauges and each astronaut's radiation.
   Place each astronaut on one job. One astronaut per job; anyone unplaced goes to the Shelter.
   Press END SOL.
3. **Rescue.** If the sol's storm can hurt the crew, the player may bring astronauts who are
   outside back to the Shelter before it hits.
4. **Results.** The mission log lists what happened in the sol.
5. **Debrief.** Result, stars, science total, one tip, and the real dates and storms of the week
   played.

## 6. Rules

All numbers live in `src/sim/constants.js`. The rules live in `src/sim/sim.js` and are covered by
`test/sim.test.js`.

**Start:** power 6, water tank 8, wall water 0, science 0. Crew: Ana, Ben, Cai, each at 0
radiation. **Limits:** power 10, tank 10, wall 6, science 100, radiation 100.

| Job | Where | Power cost | Effect |
| --- | --- | --- | --- |
| Solar Field | Outside | 0 | +5 power |
| Recycler | Inside | 2 | +3 water in the tank |
| Water Wall pump | Inside | 1 | Moves 2 water from the tank into the shelter walls |
| Lab | Inside | 1 | +5 science |
| Rover trip | Outside | 2 | +10 science; 4 second walk back in a Commander rescue |
| Shelter | Shelter | 0 | Nothing; the safest place |

**Each sol runs in this order:**

1. The Solar Field adds power.
2. Heaters take 2 power. If there is not enough, the sol is cold: power drops to 0 and no
   science is earned.
3. Jobs run in the order Recycler, pump, Lab, Rover. A job without enough power is skipped.
4. The crew drink 2 water. If there is not enough, the sol is thirsty: the tank drops to 0 and
   no science is earned.
5. Background radiation: +2 for everyone, +1 more for anyone outside.
6. Storm radiation, if a harmful storm hits (see below).
7. Science earned this sol is added, unless the sol was cold or thirsty.
8. An astronaut at 100 radiation goes home; the run goes on with the rest. Two thirsty sols in a
   row send the whole crew home.

**Storms.** Base dose: flare with particles, class C 10, class M 25, class X 50; CME 20. A flare
without particles does no harm. The dose each astronaut takes is the base dose times where they
are: outside 1.0, inside 0.6, Shelter 0.6 × (1 − 0.1 × wall water). With full walls (6) the
Shelter factor is 0.24. An astronaut rescued in time takes the Shelter dose, and their job still
counts for that sol.

**Ending.** Win at 100 science. Lose if the whole crew has gone home, or if sol 10 ends first.
Stars on a win: 1 for winning, +1 if nobody went home, +1 if no sol was cold or thirsty.

## 7. Storm data

- Source: NASA CCMC DONKI (flares, particle events, CMEs that reach Mars), fetched once by
  `npm run fetch:donki` into `public/data/sky.json`. Default range 2012 to 2025.
- One sol is one real calendar day. If a day has several events, the strongest one is used.
- **Random week:** a 10-day window from the archive. In "big storm" runs, a class M or X flare
  with particles is placed on sol 3 to 8.
- **Featured: Sept 2017:** a fixed run starting 2017-09-04. The debrief links the NASA JPL story
  about that storm at Mars.
- **Forecast:** CMEs are announced up to 3 sols ahead. Flares are never forecast.
- Until the real data is fetched, the game shows a SAMPLE DATA banner and says so in the footer
  and credits.

## 8. Screens and interface

- **Plan screen:** an outpost map where the player places astronauts on jobs. Not built yet;
  today it is rows of buttons.
- **Console kit** (`src/ui/console/`): knob, toggle, cover button, gauge, lamps, mission log,
  info drawer, ticker tape, mute switch and sounds. Built, not yet used by the game.
- **Credits page** (`#credits`) lists every data source with a link. The footer names the sky
  data source on every screen.
- Works on a phone-width screen, by touch, mouse and keyboard. Sound can be muted. *(assumed)*
- Words a 7-year-old can read: short sentences, "sunburn" for radiation dose, "sol" explained on
  the title screen.

## 9. Technical rules

- Plain JavaScript (ES modules), Vite static site, no UI framework, no backend.
- Game rules never live in UI code. The UI calls `step()` and draws the result.
- Tuning numbers change only in `constants.js`, followed by `npm test` and `npm run balance`.
- Hosted on Cloudflare as a static site (decision 0001). Agents do not deploy.

## 10. The MVP is done when

- [ ] `sky.json` holds real DONKI data and the SAMPLE DATA banner is gone.
- [ ] `npm test` passes and `npm run balance` passes on the real data (no fixed plan wins more
      than 80% of 1,000 runs).
- [ ] The plan screen is the outpost map and the game uses the console kit.
- [ ] A full run can be played in both modes and both missions, to the debrief, on a phone and
      on a laptop, with keyboard only.
- [ ] The site is live on Cloudflare.

Task breakdown: see `tasks.md`.

## 11. Open questions

1. Is there a separate results screen after each sol? A code comment names a "report" step, but
   today the log just appears on the next plan screen.
2. What does the outpost map look like, and is there a design for it?
3. Which console kit part goes where in the game (for example, is END SOL the cover button)?
4. Should `/kit.html` be in the public build?
5. What are the Space Apps submission deadline and judging criteria this must meet?
6. Does the September 2017 run need its own script or teaching text beyond the debrief note?
