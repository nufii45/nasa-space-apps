// Pure game rules. No DOM, no timers, no randomness: same input, same output.
// Used by the game (src/main.js) and by the balance simulator (scripts/balance-sim.mjs).
import {
  START, LIMITS, HEATER_COST, DRINK_PER_SOL, THIRSTY_SOLS_TO_GO_HOME,
  BACKGROUND_DOSE, OUTSIDE_EXTRA_DOSE, JOBS, JOB_RUN_ORDER, FLARE_DOSE, CME_DOSE,
  FACTOR_OUTSIDE, FACTOR_INSIDE, WALL_BLOCK_PER_UNIT, SOLS_PER_RUN, SCIENCE_GOAL, CREW,
} from './constants.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function newGame(crew = CREW) {
  return {
    sol: 1,
    ...START,
    crew: crew.map((c) => ({ ...c, dose: 0, home: false })),
    thirstyStreak: 0,
    coldSols: 0,
    thirstySols: 0,
    over: false,
    result: null, // 'win' | 'home' | 'time'
    stars: 0,
  };
}

// Base storm dose for one sol's storm, or 0 if the storm can't hurt anyone.
export function stormBaseDose(storm) {
  if (!storm) return 0;
  if (storm.kind === 'cme') return CME_DOSE;
  if (storm.kind === 'flare') {
    if (!storm.particles) return 0;
    return FLARE_DOSE[String(storm.cls || 'C')[0].toUpperCase()] ?? FLARE_DOSE.C;
  }
  return 0;
}

// Does this storm trigger the rescue countdown?
export function needsRescue(storm) {
  return stormBaseDose(storm) > 0;
}

export function locationFactor(where, wall) {
  if (where === 'outside') return FACTOR_OUTSIDE;
  if (where === 'inside') return FACTOR_INSIDE;
  return FACTOR_INSIDE * (1 - WALL_BLOCK_PER_UNIT * clamp(wall, 0, LIMITS.wall));
}

// Normalise placements: active crew only, unknown/missing -> shelter, at most one crew per job (shelter unlimited).
export function normalisePlacements(state, placements = {}) {
  const taken = new Set();
  const out = {};
  for (const c of state.crew) {
    if (c.home) continue;
    let job = placements[c.id];
    if (!JOBS[job] || (job !== 'shelter' && taken.has(job))) job = 'shelter';
    if (job !== 'shelter') taken.add(job);
    out[c.id] = job;
  }
  return out;
}

/**
 * Run one sol.
 * @param state      current state (not mutated)
 * @param placements { crewId: jobId }
 * @param solEvents  { storm: null | {kind:'flare', cls:'X8.2', particles:true} | {kind:'cme'} }
 * @param rescued    array of crew ids moved to the Shelter during the rescue countdown
 * @returns { state, log } where log is a list of { type, text } lines for the mission log
 */
export function step(state, placements, solEvents = {}, rescued = []) {
  if (state.over) return { state, log: [] };
  const s = structuredClone(state);
  const log = [];
  const say = (type, text) => log.push({ type, text });
  const place = normalisePlacements(s, placements);
  const active = s.crew.filter((c) => !c.home);
  const at = (job) => active.filter((c) => place[c.id] === job);

  // 1. Solar first.
  const solarCrew = at('solar');
  if (solarCrew.length) {
    s.power = clamp(s.power + JOBS.solar.effect.power * solarCrew.length, 0, LIMITS.power);
    say('power', `${solarCrew[0].name} ran the Solar Field: +${JOBS.solar.effect.power} power`);
  }

  // 2. Heaters.
  let cold = false;
  if (s.power >= HEATER_COST) {
    s.power -= HEATER_COST;
  } else {
    cold = true;
    s.power = 0;
    s.coldSols += 1;
    say('warn', 'Not enough power for the heaters. Too cold to do science today.');
  }

  // 3. Jobs in fixed order.
  let pendingScience = 0;
  for (const job of JOB_RUN_ORDER) {
    for (const c of at(job)) {
      const j = JOBS[job];
      if (s.power < j.power) {
        say('warn', `${c.name} couldn't run the ${j.name}: not enough power`);
        continue;
      }
      if (job === 'pump' && s.tank < 1) {
        say('warn', `${c.name} couldn't pump: the tank is empty`);
        continue;
      }
      s.power -= j.power;
      if (job === 'recycler') {
        s.tank = clamp(s.tank + j.effect.tank, 0, LIMITS.tank);
        say('water', `${c.name} ran the Recycler: +${j.effect.tank} water`);
      } else if (job === 'pump') {
        const moved = Math.min(-j.effect.tank, s.tank, LIMITS.wall - s.wall);
        s.tank -= moved;
        s.wall += moved;
        say('shield', `${c.name} pumped ${moved} water into the shelter walls`);
      } else {
        pendingScience += j.effect.science;
        say('science', `${c.name} worked on the ${j.name}`);
      }
    }
  }

  // 4. Drinking water.
  let thirsty = false;
  if (s.tank >= DRINK_PER_SOL) {
    s.tank -= DRINK_PER_SOL;
    s.thirstyStreak = 0;
  } else {
    thirsty = true;
    s.tank = 0;
    s.thirstyStreak += 1;
    s.thirstySols += 1;
    say('warn', 'The tank ran dry. The crew are thirsty and too tired for science.');
  }

  // 5. Background radiation.
  for (const c of active) {
    const outside = JOBS[place[c.id]].where === 'outside';
    c.dose += BACKGROUND_DOSE + (outside ? OUTSIDE_EXTRA_DOSE : 0);
  }

  // 6. Storm.
  const storm = solEvents.storm || null;
  const base = stormBaseDose(storm);
  if (storm) {
    say('storm', storm.kind === 'cme'
      ? 'A cloud of Sun material (CME) hit the base!'
      : `Solar flare, class ${storm.cls}${storm.particles ? '. Fast particles arrived!' : '. No particle storm this time.'}`);
  }
  if (base > 0) {
    const rescuedSet = new Set(rescued);
    for (const c of active) {
      let where = JOBS[place[c.id]].where;
      if (rescuedSet.has(c.id)) where = 'shelter';
      const dose = Math.round(base * locationFactor(where, s.wall));
      c.dose += dose;
      say('dose', `${c.name} got ${dose} radiation (${where})`);
    }
  }

  // 7. Science.
  if (!cold && !thirsty && pendingScience) {
    s.science = clamp(s.science + pendingScience, 0, LIMITS.science);
    say('science', `+${pendingScience} science`);
  }

  // 8. Crew going home.
  for (const c of active) {
    c.dose = clamp(c.dose, 0, LIMITS.dose);
    if (c.dose >= LIMITS.dose) {
      c.home = true;
      say('home', `${c.name} has had enough radiation and takes the next ride home.`);
    }
  }
  if (s.thirstyStreak >= THIRSTY_SOLS_TO_GO_HOME) {
    for (const c of s.crew) c.home = true;
    say('home', 'Two thirsty sols in a row. The whole crew heads home.');
  }

  // 9. End of run?
  if (s.science >= SCIENCE_GOAL) end(s, 'win');
  else if (s.crew.every((c) => c.home)) end(s, 'home');
  else if (s.sol >= SOLS_PER_RUN) end(s, 'time');
  else s.sol += 1;

  return { state: s, log };
}

function end(s, result) {
  s.over = true;
  s.result = result;
  s.stars = result === 'win'
    ? 1 + (s.crew.every((c) => !c.home) ? 1 : 0) + (s.coldSols === 0 && s.thirstySols === 0 ? 1 : 0)
    : 0;
}
