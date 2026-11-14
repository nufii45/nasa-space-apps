// Help-card text for each job, shown in the info drawer. Words are for a 7-year-old;
// every number is read from JOBS so retuning constants.js keeps the cards right.
import { JOBS } from '../sim/constants.js';
import { el } from './console/util.js';

const WHAT = {
  solar: 'Go outside and clean the solar panels. Clean panels make power for the base.',
  recycler: 'Clean used water so the crew can drink it again. It fills up the water tank.',
  pump: 'Move water from the tank into the Shelter walls. Water in the walls blocks the fast bits from the Sun.',
  lab: 'Do experiments in the Lab to earn science.',
  rover: 'Drive the rover far away to study rocks. You earn lots of science, but you are far from home.',
  shelter: 'Rest in the Shelter. No work gets done.',
};
const WHERE = {
  outside: 'This job is outside. You get more sunburn out there, and storms hit hardest.',
  inside: 'This job is inside the base.',
  shelter: 'The Shelter is the safest place in a storm.',
};
const WORD = { power: 'power', tank: 'water in the tank', wall: 'water in the walls', science: 'science' };
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

// -> the argument for drawer.open()
export function jobCard(id) {
  const j = JOBS[id];
  // The pump moves less when the walls are nearly full or the tank is low, so say "up to".
  const effects = j.effect.wall
    ? [`Moves up to ${-j.effect.tank} water from the tank into the walls.`, 'Leave some in the tank: the crew still need water to drink.']
    : Object.entries(j.effect).map(([k, v]) => `${signed(v)} ${WORD[k] ?? k}`);
  const numbers = [
    j.power ? `Costs ${j.power} power.` : 'Costs no power.',
    ...(effects.length ? effects : ['Makes nothing.']),
    ...(j.walkBackSeconds ? [`Commander mode: in a storm it takes ${j.walkBackSeconds} seconds to come back.`] : []),
  ];
  return {
    title: j.name,
    tabs: [
      { label: 'What it does', body: `${WHAT[id] ?? ''} ${WHERE[j.where] ?? ''}`.trim() },
      { label: 'Numbers', body: el('ul', {}, ...numbers.map((t) => el('li', {}, t))) },
    ],
    source: id === 'pump'
      ? { label: 'NASA Water Walls', url: 'https://www.nasa.gov/general/water-walls-highly-reliable-and-massively-redundant-life-support-architecture' }
      : null,
  };
}
