# Outpost Dial: remaining tasks

Updated 2026-11-15 after the MVP build on branch `feat/mvp-ui` (not pushed, not merged). Roles A
to D are the owners named in `README.md`. Requirements: `docs/PRD.md`. Plan that was followed:
`plans/2026-11-15-complete-mvp.md`.

## Where things stand

| Role | Area | Status |
| --- | --- | --- |
| A | Rules, balance, tests | Done: retuned for real data, `npm run balance` passes in both modes |
| B | Outpost map for the plan screen | Done: `src/ui/map/`, mounted in the game |
| C | Console kit | Done: the game uses it on every screen |
| D | Real storm data | Done: 3,915 real DONKI events, 2012 to 2025 |

`npm test` (146 tests), `npm run balance` and `npm run build` all pass on the branch.

## Done

- [x] **1. Fetch the real DONKI data.** The fetch script was fixed first (DONKI now limits a
  request to 60 days) and hardened against bad input and failed requests.
- [x] **2. Retune on the real data.** Nine numbers changed in `src/sim/constants.js`. The balance
  check now enforces win-rate bands for a sensible player, that it never pumps itself thirsty,
  and that following the CME forecast beats ignoring it (decision 0007).
- [x] **3. Split the screens out of `src/main.js`.** Dropped: the map got its own folder
  instead (decision 0002).
- [x] **4. Put the console kit into the game.**
- [x] **5. Build the outpost map plan screen.**
- [x] **6. Test the finished game.** 89 click-through tests play the real screens, including four
  full runs. Two full games were also played in headless Chrome at phone and laptop size with no
  errors.

## Still to do

- [x] **7. Deploy.** Live at https://nasa-space-apps.bufiimman45.workers.dev. Cloudflare builds
  and deploys on every push to `main`. Checked 2026-11-15: the page, the game bundle and the
  real storm data all load.
- [x] **8. Merge.** Merged into `main` and pushed 2026-11-15; CI and the Cloudflare build passed.
- [ ] **9. Play it on a real phone and with a keyboard only.** No agent has done either. Check
  that the map and END SOL are easy to reach on a small screen: the four gauges fill most of
  the first screen.
- [ ] **10. Playtest with children.** The numbers were tuned against a scripted player, not real
  ones. Watch how often an astronaut is sent home: it happens in about 4 runs in 10 in Cadet.
- [x] **11. Update `CLAUDE.md` Project facts.** Done 2026-11-15, commands re-verified.

## Decisions needed from you

See the open questions at the end of `docs/PRD.md`. The two that affect how the game teaches:

- Should a storm rescue also bring inside crew into the Shelter? Today only outside crew can be
  rescued, so with walls built an astronaut working inside takes the most radiation.
- Is the one-line hint on the September 2017 mission enough? A player who only follows the
  in-game tips still loses it.

Decisions 0002, 0004, 0005 and 0006 are recorded as proposed in Obsidian and wait for your
review. Decision 0007 is accepted.

## Not needed for the app to work

These only matter for the Grok Bot test loop: staging URL, seed demo data, demo roles and the
GitHub repo entry in `CLAUDE.md`, and the placeholders in `grok/GROK_BOT_INSTRUCTIONS.md`.
