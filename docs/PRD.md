# Outpost Dial: MVP PRD

**Status:** Draft, written 2026-11-15 and updated the same day after the MVP build. The original
PRD named in `README.md` was not found on this machine, so this one was rebuilt from the code,
the README and the code comments. Rules and numbers below match the code on `feat/mvp-ui`.
Sections marked *(assumed)* are not backed by a decision and need your confirmation.

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
| Recycler | Inside | 2 | +4 water in the tank |
| Water Wall pump | Inside | 1 | Moves 4 water from the tank into the shelter walls |
| Lab | Inside | 1 | +6 science |
| Rover trip | Outside | 2 | +10 science; 4 second walk back in a Commander rescue |
| Shelter | Shelter | 0 | Nothing; the safest place |

**Each sol runs in this order:**

1. The Solar Field adds power.
2. Heaters take 2 power. If there is not enough, the sol is cold: power drops to 0 and no
   science is earned.
3. Jobs run in the order Recycler, pump, Lab, Rover. A job without enough power is skipped.
4. The crew drink 2 water. If there is not enough, the sol is thirsty: the tank drops to 0 and
   no science is earned.
5. Background radiation: +1 for everyone, +5 more for anyone outside.
6. Storm radiation, if a harmful storm hits (see below).
7. Science earned this sol is added, unless the sol was cold or thirsty.
8. An astronaut at 100 radiation goes home; the run goes on with the rest. Two thirsty sols in a
   row send the whole crew home.

**Storms.** Base dose: flare with particles, class C 10, class M 20, class X 40; CME 50. A flare
without particles does no harm. CMEs hit hardest and are the storms that are forecast, so pumping
the walls after a warning pays. The dose each astronaut takes is the base dose times where they
are: outside 1.0, inside 0.6, Shelter 0.6 × (1 − 0.15 × wall water). With full walls (6) the
Shelter factor is 0.06; one pump (4 wall water) makes it 0.24. Only astronauts outside can be
rescued. One rescued in time takes the Shelter dose, and their job still counts for that sol.

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

- **Plan screen:** an outpost map (`src/ui/map/`) where the player places astronauts on jobs:
  tap an astronaut, then tap a station. Stations are buttons with a picture each, laid over a
  drawn Mars ground and habitat (decisions 0005, 0006). Each station has a "?" help card.
- **Console kit** (`src/ui/console/`): mission knob, mode toggle, covered LAUNCH and END SOL
  buttons, four needle gauges, warning lamps, mission log, help cards in the info drawer, the
  debrief on ticker tape, a mute switch on every screen, and sounds.
- **No results screen per sol:** the sol's lines appear in the mission log on the next plan
  screen (decision 0005).
- **Sept 2017 mission:** the plan screen adds one line saying big flares give no warning.
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

- [x] `sky.json` holds real DONKI data and the SAMPLE DATA banner is gone.
- [x] `npm test` passes and `npm run balance` passes on the real data, in both modes, over 1,000
      runs (decision 0007): the reference player, rescuing everyone outside, wins 65% to 80% in
      Cadet and 45% to 65% in Commander; it never makes a sol thirsty by pumping; following the
      CME forecast wins at least 3 points more than ignoring it; no plan that repeats the same
      jobs every sol wins more than 80%. The best schedule written in advance is reported only.
- [x] The plan screen is the outpost map and the game uses the console kit.
- [ ] A full run can be played in both modes and both missions, to the debrief, on a phone and
      on a laptop, with keyboard only. Checked so far: automated click-through tests for all
      four runs, and headless Chrome runs at phone and laptop size. Not yet checked: a real
      phone by touch, and keyboard-only play by a person.
- [ ] The site is live on Cloudflare.

Task breakdown: see `tasks.md`.

## 11. Open questions

Answered during the build: no results screen per sol, the map look and the kit placement
(decisions 0005 and 0006), and `/kit.html` stays in the build (0005). Still open:

1. What are the Space Apps submission deadline and judging criteria this must meet?
2. In a storm the rescue screen only offers astronauts who are outside. With walls built, an
   astronaut working inside takes more radiation than one rescued into the Shelter. Should a
   rescue also bring inside crew into the Shelter? It changes the rules and the balance.
3. A win counts even if the whole crew reaches the radiation limit on the winning sol, because
   the rules check for the win first. Keep or change?
4. The reference player still loses the September 2017 mission by following the in-game tips;
   the mission is winnable. Is the one-line hint enough, or does it need its own teaching text?
5. A plan written in advance still wins a little more often than the reacting reference player
   (decision 0007 reports this and accepts it for the MVP). Revisit after a playtest?
6. "Try again" always starts a random week, even after the September 2017 mission. Intended?
