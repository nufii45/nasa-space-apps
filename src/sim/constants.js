// All tuning numbers live here. Starting values from the PRD; tune with `npm run balance`.

export const SOLS_PER_RUN = 10;
export const SCIENCE_GOAL = 100;

export const START = { power: 6, tank: 8, wall: 0, science: 0 };
export const LIMITS = { power: 10, tank: 10, wall: 6, science: 100, dose: 100 };

export const HEATER_COST = 2; // power per sol, paid before jobs
export const DRINK_PER_SOL = 2; // water per sol
export const THIRSTY_SOLS_TO_GO_HOME = 2; // in a row

export const BACKGROUND_DOSE = 2; // every crew, every sol (Curiosity RAD: ~0.67 mSv/day on the surface, scaled)
export const OUTSIDE_EXTRA_DOSE = 1;

// Job ids are used everywhere (sim, UI, content). Order of JOB_RUN_ORDER = order jobs are paid for.
export const JOBS = {
  solar: { name: 'Solar Field', where: 'outside', power: 0, effect: { power: 5 } },
  recycler: { name: 'Recycler', where: 'inside', power: 2, effect: { tank: 3 } },
  pump: { name: 'Water Wall pump', where: 'inside', power: 1, effect: { tank: -2, wall: 2 } },
  lab: { name: 'Lab', where: 'inside', power: 1, effect: { science: 5 } },
  rover: { name: 'Rover trip', where: 'outside', power: 2, effect: { science: 10 }, walkBackSeconds: 4 },
  shelter: { name: 'Shelter', where: 'shelter', power: 0, effect: {} },
};
export const JOB_RUN_ORDER = ['recycler', 'pump', 'lab', 'rover'];

// Storm base dose by flare class letter (only when the flare is linked to a particle event).
export const FLARE_DOSE = { C: 10, M: 25, X: 50 };
export const CME_DOSE = 20;

// Location factors for storm dose.
export const FACTOR_OUTSIDE = 1.0;
export const FACTOR_INSIDE = 0.6;
export const WALL_BLOCK_PER_UNIT = 0.1; // Shelter factor = 0.6 * (1 - 0.1 * wall)

export const RESCUE_SECONDS = 10; // Commander mode countdown

export const CREW = [
  { id: 'ana', name: 'Ana' },
  { id: 'ben', name: 'Ben' },
  { id: 'cai', name: 'Cai' },
];
