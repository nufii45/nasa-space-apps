// All tuning numbers live here. Tuned on the real DONKI archive (2012 to 2025); retune with `npm run balance`.

export const SOLS_PER_RUN = 10;
export const SCIENCE_GOAL = 100;

export const START = { power: 6, tank: 8, wall: 0, science: 0 };
export const LIMITS = { power: 10, tank: 10, wall: 6, science: 100, dose: 100 };

export const HEATER_COST = 2; // power per sol, paid before jobs
export const DRINK_PER_SOL = 2; // water per sol
export const THIRSTY_SOLS_TO_GO_HOME = 2; // in a row

export const BACKGROUND_DOSE = 1; // every crew, every sol, inside the base
// Outside work is what fills a dose budget: share it, and shelter it with walls. The outside total
// (background + extra) stands for the open surface (Curiosity RAD: ~0.67 mSv/day); 6x inside is a game simplification.
export const OUTSIDE_EXTRA_DOSE = 5;

// Job ids are used everywhere (sim, UI, content). Order of JOB_RUN_ORDER = order jobs are paid for.
export const JOBS = {
  solar: { name: 'Solar Field', where: 'outside', power: 0, effect: { power: 5 } },
  recycler: { name: 'Recycler', where: 'inside', power: 2, effect: { tank: 4 } },
  pump: { name: 'Water Wall pump', where: 'inside', power: 1, effect: { tank: -4, wall: 4 } }, // one pump after a forecast makes a useful shelter
  lab: { name: 'Lab', where: 'inside', power: 1, effect: { science: 6 } }, // 60 over a run: the goal needs 4 rover trips
  rover: { name: 'Rover trip', where: 'outside', power: 2, effect: { science: 10 }, walkBackSeconds: 4 },
  shelter: { name: 'Shelter', where: 'shelter', power: 0, effect: {} },
};
export const JOB_RUN_ORDER = ['recycler', 'pump', 'lab', 'rover'];

// Storm base dose by flare class letter (only when the flare is linked to a particle event).
// CMEs are forecast and hit hardest, so reading the forecast and pumping the walls pays.
export const FLARE_DOSE = { C: 10, M: 20, X: 40 };
export const CME_DOSE = 50;

// Location factors for storm dose.
export const FACTOR_OUTSIDE = 1.0;
export const FACTOR_INSIDE = 0.6;
export const WALL_BLOCK_PER_UNIT = 0.15; // Shelter factor = 0.6 * (1 - 0.15 * wall); keep it <= 1 / LIMITS.wall

export const RESCUE_SECONDS = 10; // Commander mode countdown

export const CREW = [
  { id: 'ana', name: 'Ana' },
  { id: 'ben', name: 'Ben' },
  { id: 'cai', name: 'Cai' },
];
