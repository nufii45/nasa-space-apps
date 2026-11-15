// Screen controller: title -> (plan -> [rescue]) x up to 10 sols -> debrief, plus #credits.
// Rules live in src/sim/; this file only calls them and draws the result with the console kit.
import { newGame, step, needsRescue, normalisePlacements } from './sim/sim.js';
import { buildRun } from './sim/sky.js';
import {
  JOBS, LIMITS, RESCUE_SECONDS, SCIENCE_GOAL, SOLS_PER_RUN, HEATER_COST, DRINK_PER_SOL, CME_DOSE,
} from './sim/constants.js';
import {
  createKnob, createToggle, createCoverButton, createGauge, createLamps,
  createMissionLog, createInfoDrawer, createTickerTape, createMuteSwitch, play,
} from './ui/console/index.js';
import { el } from './ui/console/util.js';
import { jobCard } from './ui/jobInfo.js';
import { createOutpostMap } from './ui/map/index.js';

// Warning thresholds for gauges and lamps, derived from the rules so retuning keeps them meaningful.
const LOW = { power: HEATER_COST, tank: DRINK_PER_SOL };
const NEAR_LIMIT = LIMITS.dose - CME_DOSE; // one more CME caught outside would send them home

const app = document.getElementById('app');
const drawer = createInfoDrawer();
document.body.append(drawer.el);
document.body.prepend(el('header', { class: 'top-bar' }, createMuteSwitch().el));

let sky = null;
let game = null; // { state, run, mode, placements, log, gauges, lamps, rescueTimer, tapeLines }

async function loadSky() {
  const res = await fetch('./data/sky.json');
  sky = await res.json();
  if (sky.sample) document.querySelector('.source-footer').firstChild.textContent = 'SAMPLE storm data (placeholder, not real) · ';
}

// Swap the screen and move focus to its heading so keyboard and screen-reader users land on it.
function show(...nodes) {
  clearInterval(game?.rescueTimer);
  drawer.close();
  app.replaceChildren(...nodes.filter(Boolean));
  app.querySelector('h1, h2')?.focus();
}
const heading = (tag, text) => el(tag, { tabindex: -1 }, text);
const button = (text, onclick, cls) => el('button', { type: 'button', class: cls, onclick }, text);

// Stop the old run's log and ticker tape queues; the line being typed still finishes (the kit has no abort).
function stopGame() {
  game?.log.clear();
  if (game?.tapeLines) game.tapeLines.length = 0; // the tape's for...of loop ends when its array is emptied
}

// ---------- Title ----------
function title() {
  stopGame();
  const mission = createKnob({ label: 'Mission', options: [{ value: 'random', label: 'RANDOM WEEK' }, { value: 'sept2017', label: 'SEPT 2017' }] });
  const mode = createToggle({ label: 'Commander mode', onLabel: 'COMMANDER', offLabel: 'CADET' });
  const launch = createCoverButton({
    label: 'LAUNCH',
    onPress: () => { play('cheer'); start({ mode: mode.get() ? 'commander' : 'cadet', mission: mission.get() }); },
  });
  show(el('section', { class: 'card' },
    heading('h1', 'Outpost Dial'),
    el('p', {}, `Run a base on Mars for ${SOLS_PER_RUN} sols (a sol is a Mars day). Real solar storms, recorded by NASA, are coming.`),
    el('div', { class: 'row console-row' }, mission.el, mode.el, launch.el),
    el('p', { class: 'hint' }, 'SEPT 2017 is a real giant storm. Cadet (7 to 9) has no timer. Commander (10 to 12) races a storm countdown.'),
  ));
}

function start({ mode, mission }) {
  const run = buildRun(sky, { mode, featured: mission === 'random' ? null : mission, seed: Date.now() >>> 0 });
  // The instruments live for the whole run: needles move and the log keeps every sol.
  stopGame();
  game = {
    state: newGame(), run, mode, placements: {},
    log: createMissionLog({ max: 300 }), // the kit keeps 40 lines by default; a full run logs more and must keep every sol
    gauges: {
      power: createGauge({ label: 'Power', icon: '⚡', max: LIMITS.power, low: LOW.power }),
      tank: createGauge({ label: 'Water tank', icon: '💧', max: LIMITS.tank, low: LOW.tank }),
      wall: createGauge({ label: 'Wall water', icon: '🛡', max: LIMITS.wall }),
      science: createGauge({ label: 'Science', icon: '🔬', max: SCIENCE_GOAL }),
    },
    lamps: createLamps({ lamps: [
      { id: 'power', label: 'Power', icon: '⚡' },
      { id: 'water', label: 'Water', icon: '💧' },
      { id: 'storm', label: 'Storm', icon: '☀' },
      { id: 'crew', label: 'Crew', icon: '👩‍🚀' },
    ] }),
  };
  game.log.append(`Mission start. Your sky begins on ${run.start}.`, 'info');
  plan();
}

// ---------- Shared pieces ----------
function sampleBanner() {
  return game.run.sample ? el('div', { class: 'banner' }, 'SAMPLE DATA: storms are placeholders until the real NASA data is fetched.') : null;
}
const today = () => game.run.sols[game.state.sol - 1];

function updateInstruments(storming = false) {
  const s = game.state;
  for (const [k, g] of Object.entries(game.gauges)) g.set(s[k]);
  const l = game.lamps;
  l.set('power', s.power <= LOW.power ? 'warn' : 'ok');
  l.set('water', s.tank <= LOW.tank ? 'warn' : 'ok');
  l.set('storm', storming || today().forecast.length ? 'storm' : 'ok');
  l.set('crew', s.crew.some((c) => c.home) ? 'storm' : s.crew.some((c) => c.dose >= NEAR_LIMIT) ? 'warn' : 'ok');
}

// ---------- Plan (morning + placement) ----------
function plan() {
  const s = game.state;
  const sol = today();
  // Several CMEs can arrive on the same day; say each arrival day once.
  const forecast = [...new Set(sol.forecast.map((f) => f.inSols))].map((n) => `A cloud of Sun material (CME) is coming, about ${n} sol${n > 1 ? 's' : ''} away.`).join(' ') || 'Clear skies forecast. (The Sun can still surprise you.)';
  game.placements = normalisePlacements(s, game.placements);
  const endSol = createCoverButton({
    label: 'END SOL', tone: 'storm', autoClose: 0,
    onPress: () => (needsRescue(sol.storm) ? rescue() : resolve([])),
  });
  // A new map per plan screen: it reads each astronaut's dose and home flag only once.
  const map = createOutpostMap({
    jobs: JOBS, crew: s.crew, placements: game.placements, doseLimit: LIMITS.dose,
    onChange: (p) => { game.placements = normalisePlacements(s, p); },
    onInfo: (id) => drawer.open(jobCard(id)),
  });
  show(
    sampleBanner(),
    el('section', { class: 'card' }, heading('h2', `Sol ${s.sol} of ${SOLS_PER_RUN}`), el('p', {}, forecast),
      // The featured week's big flares are never forecast, so say what a player needs to know to win it.
      ...(game.run.start === sky.featured?.sept2017?.start ? [el('p', {}, 'This was a stormy week on the Sun. Big flares give no warning: fill the shelter walls early and take turns going outside.')] : [])),
    game.lamps.el,
    el('div', { class: 'gauges' }, ...Object.values(game.gauges).map((g) => g.el)),
    map.el,
    el('div', { class: 'row console-row' }, endSol.el),
    game.log.el,
  );
  updateInstruments();
}

// ---------- Rescue ----------
function rescue() {
  const s = game.state;
  const sol = today();
  const outside = s.crew.filter((c) => !c.home && JOBS[game.placements[c.id]]?.where === 'outside');
  const rescued = new Set();
  const walking = new Map(); // crew id -> seconds remaining
  const timed = game.mode === 'commander';
  let left = RESCUE_SECONDS;
  const label = sol.storm.kind === 'cme' ? 'CME storm' : `X-ray flash! Flare class ${sol.storm.cls}`;

  const finish = () => {
    clearInterval(game.rescueTimer);
    resolve([...rescued]);
  };
  const done = button(timed ? 'Ready' : 'Done', finish, 'primary');
  const seconds = el('strong', {}, String(left));
  // Rows update in place so the countdown never rebuilds the screen or drops focus.
  const rows = new Map(outside.map((c) => [c.id, {
    status: el('span', {}, `Outside at the ${JOBS[game.placements[c.id]].name}`),
    btn: button(`Bring ${c.name} inside`, () => bring(c.id), 'danger'),
  }]));
  const refresh = (id) => {
    const r = rows.get(id);
    r.status.textContent = rescued.has(id) ? 'Safe in the Shelter' : 'Walking back...';
    if (r.btn.isConnected) {
      const hadFocus = document.activeElement === r.btn;
      r.btn.remove();
      if (hadFocus) ([...rows.values()].find((x) => x.btn.isConnected)?.btn ?? done).focus();
    }
  };
  function bring(id) {
    const far = JOBS[game.placements[id]].walkBackSeconds || 0;
    if (timed && far) walking.set(id, far);
    else rescued.add(id);
    refresh(id);
  }

  show(
    el('section', { class: 'card storm-alert' },
      heading('h2', label),
      el('p', {}, 'Fast particles are on the way. Get everyone outside back to the Shelter!'),
      timed ? el('p', { class: 'countdown', role: 'timer' }, seconds, ' seconds left') : null),
    game.lamps.el,
    el('section', { class: 'card', 'aria-live': 'polite' },
      ...(outside.length
        ? outside.map((c) => el('div', { class: 'row' }, el('strong', {}, c.name), rows.get(c.id).status, rows.get(c.id).btn))
        : [el('p', {}, 'Everyone is already inside. Phew!')]),
      el('p', {}, done)),
  );
  updateInstruments(true);
  game.lamps.sweep();

  if (timed) {
    game.rescueTimer = setInterval(() => {
      left -= 1;
      for (const [id, t] of walking) {
        if (t <= 1) { walking.delete(id); rescued.add(id); refresh(id); } else walking.set(id, t - 1);
      }
      if (left <= 0) finish(); else seconds.textContent = String(left);
    }, 1000);
  }
}

// ---------- Resolve ----------
function resolve(rescued) {
  const sol = today();
  const { state, log } = step(game.state, game.placements, sol, rescued);
  game.log.append(`— Sol ${game.state.sol} (${sol.date}) —`, 'info');
  for (const l of log) game.log.append(l.text, l.type);
  game.state = state;
  if (state.over) return debrief();
  plan();
}

// ---------- Debrief ----------
function debrief() {
  const s = game.state;
  const r = game.run;
  // A run can end early (win, or everyone home); only count the sols that were played (state.sol is the last one).
  const played = r.sols.filter((x) => x.sol <= s.sol);
  const big = played.filter((x) => x.storm && needsRescue(x.storm));
  const headline = s.result === 'win'
    ? `Mission complete! ${'★'.repeat(s.stars)}${'☆'.repeat(3 - s.stars)}`
    : s.result === 'home' ? 'The crew caught the next ride home.' : 'Time is up: the supply ship is here.';
  const tip = s.thirstySols ? 'Tip: keep someone on the Recycler before the tank gets low.'
    : s.coldSols ? 'Tip: the Solar Field keeps the heaters on. No power, no science.'
    : s.crew.some((c) => c.home) ? 'Tip: take turns going outside so nobody gets too much radiation.'
    : 'Tip: pump water into the walls when a CME is in the forecast.';
  const tape = createTickerTape();
  const mode = game.mode;
  show(
    sampleBanner(),
    el('section', { class: 'card' },
      heading('h2', 'Mission report'),
      tape.el,
      r.start === sky.featured?.sept2017?.start
        ? el('p', {}, 'In September 2017 a big solar storm hit Mars. NASA\'s Curiosity rover measured radiation more than double its highest reading since landing, and the MAVEN orbiter saw aurora glow over the whole planet. ',
          el('a', { href: 'https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/', target: '_blank', rel: 'noopener' }, 'Read the NASA story'))
        : null),
    el('p', { class: 'row' }, button('Try again', () => start({ mode, mission: 'random' }), 'primary'), button('Title', title)),
    game.log.el,
  );
  if (s.result === 'win') play('cheer');
  tape.print(game.tapeLines = [
    { text: headline, strong: true },
    `Science: ${s.science}/${SCIENCE_GOAL}`,
    `Your sky: ${r.start} to ${played.at(-1).date}${r.sample ? ' (sample data)' : ', recorded by NASA'}`,
    ...(big.length
      ? [`${big.length} storm${big.length > 1 ? 's' : ''} reached the base:`,
        ...big.map((x) => (x.storm.kind === 'cme' ? `CME on ${x.date}` : `Class ${x.storm.cls} flare on ${x.date}`))]
      : ['The Sun was quiet that week.']),
    tip,
  ]);
}

// ---------- Credits ----------
function credits() {
  const card = el('section', { class: 'card' });
  card.innerHTML = `
    <h2 tabindex="-1">Credits and data sources</h2>
    <ul>
      <li>Solar flares, particle events and CMEs: <a href="https://ccmc.gsfc.nasa.gov/tools/DONKI" target="_blank" rel="noopener">NASA CCMC DONKI</a>, archived snapshot <span class="fetched"></span>. One sol in the game = one real calendar day.</li>
      <li>Mars surface radiation (about 0.67 mSv per day): Curiosity RAD, <a href="https://www.swri.org/press-release/swri-scientists-publish-first-radiation-measurements-surface-mars" target="_blank" rel="noopener">SwRI</a>.</li>
      <li>September 2017 storm at Mars: <a href="https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/" target="_blank" rel="noopener">NASA JPL</a>.</li>
      <li>Water as both life support and shielding: <a href="https://www.nasa.gov/general/water-walls-highly-reliable-and-massively-redundant-life-support-architecture" target="_blank" rel="noopener">NASA Water Walls</a>.</li>
    </ul>`;
  card.querySelector('.fetched').textContent = sky?.fetched ? `fetched ${sky.fetched}` : '(sample placeholder)';
  card.append(el('p', {}, button('Back', () => { location.hash = ''; title(); })));
  show(card);
}

window.addEventListener('hashchange', () => { if (location.hash === '#credits') credits(); });

loadSky().then(() => {
  if (location.hash === '#credits') credits(); else title();
}).catch(() => show(el('section', { class: 'card' }, heading('h2', 'Could not load the storm data.'), el('p', {}, 'Please reload the page.'))));
