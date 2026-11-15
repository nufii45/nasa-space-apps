// Screen controller: title -> (plan -> [rescue]) x up to 10 sols -> debrief, plus #credits.
// Rules live in src/sim/; this file only calls them and draws the result with the console kit.
import { newGame, step, needsRescue, normalisePlacements } from './sim/sim.js';
import { buildRun } from './sim/sky.js';
import {
  JOBS, LIMITS, RESCUE_SECONDS, RESCUE_TIME_UP_MS, SCIENCE_GOAL, SOLS_PER_RUN, HEATER_COST, DRINK_PER_SOL, CME_DOSE,
  THIRSTY_SOLS_TO_GO_HOME,
} from './sim/constants.js';
import {
  createKnob, createToggle, createCoverButton, createGauge, createLamps,
  createMissionLog, createInfoDrawer, createTickerTape, createMuteSwitch, play,
} from './ui/console/index.js';
import { el } from './ui/console/util.js';
import { jobCard } from './ui/jobInfo.js';
import { createOutpostMap } from './ui/map/index.js';
import { render as solResultView } from './ui/screens/solResult.js';

// Warning thresholds for gauges and lamps, derived from the rules so retuning keeps them meaningful.
const LOW = { power: HEATER_COST, tank: DRINK_PER_SOL };
const NEAR_LIMIT = LIMITS.dose - CME_DOSE; // one more CME caught outside would send them home

const app = document.getElementById('app');
const drawer = createInfoDrawer();
document.body.append(drawer.el);
document.body.prepend(el('header', { class: 'top-bar' }, createMuteSwitch().el));

let sky = null;
let game = null; // { state, run, mode, mission, placements, log, gauges, lamps, rescueTimer, tapeLines }

// The run is saved after each sol so a refresh can resume it. Storage can throw (private mode, full,
// blocked); the game must play on without it. Pass null to clear.
const SAVE_KEY = 'outpost-dial.save.v1';
function save(data) {
  try {
    if (data) localStorage.setItem(SAVE_KEY, JSON.stringify(data)); else localStorage.removeItem(SAVE_KEY);
  } catch { /* storage blocked */ }
}

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
// last: { mode, mission } from "Change mission", so the knob and switch keep the previous choice.
function title(last = {}) {
  stopGame();
  const mission = createKnob({ label: 'Mission', value: last.mission, options: [{ value: 'random', label: 'RANDOM WEEK' }, { value: 'sept2017', label: 'SEPT 2017' }] });
  const mode = createToggle({ label: 'Commander mode', on: last.mode === 'commander', onLabel: 'COMMANDER', offLabel: 'CADET' });
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
  save(null);
  game = {
    state: newGame(), run, mode, mission, placements: {},
    log: createMissionLog({ max: 300 }), // the kit keeps 40 lines by default; a full run logs more and must keep every sol
    gauges: {
      power: createGauge({ label: 'Power', icon: '⚡', max: LIMITS.power, low: LOW.power }),
      tank: createGauge({ label: 'Water tank', displayLabel: 'Water', icon: '💧', max: LIMITS.tank, low: LOW.tank }),
      wall: createGauge({ label: 'Wall water', displayLabel: 'Shield', icon: '🛡', max: LIMITS.wall }),
      science: createGauge({ label: 'Science', icon: '🔬', max: SCIENCE_GOAL }),
    },
    lamps: createLamps({ lamps: [
      { id: 'power', label: 'Power', icon: '⚡' },
      { id: 'water', label: 'Drinking water', icon: '💧' },
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
    label: 'END SOL', tone: 'go', coverText: 'END SOL', autoClose: 0,
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
    el('section', { class: 'card plan-screen' },
      heading('h2', `Sol ${s.sol} of ${SOLS_PER_RUN}`),
      el('div', { class: 'plan-weather' }, el('strong', {}, 'Sun report'), el('span', {}, forecast)),
      game.run.start === sky.featured?.sept2017?.start
        ? el('p', { class: 'plan-storm-tip' }, 'Big flares give no warning. Fill the shelter walls early and take turns outside.')
        : null,
      game.lastSummary ? el('p', { class: 'plan-last-sol', role: 'status' }, game.lastSummary) : null,
      waterWarning(s),
      el('p', { class: 'plan-steps' }, 'Choose jobs for your crew'),
      el('div', { class: 'gauges' }, ...Object.values(game.gauges).map((g) => g.el)),
      map.el,
      el('div', { class: 'plan-action' },
        el('p', {}, el('strong', {}, 'Ready?'), ' Lift the cover, then press END SOL.'),
        endSol.el),
      el('details', { class: 'plan-console' },
        el('summary', {}, 'Mission console and full log'),
        game.lamps.el,
        game.log.el)),
  );
  updateInstruments();
}

// Thirst ends the whole run, so warn before it happens, not after.
function waterWarning(s) {
  const last = THIRSTY_SOLS_TO_GO_HOME - s.thirstyStreak === 1;
  if (!last && s.tank >= DRINK_PER_SOL * 2) return null;
  const text = last
    ? 'Danger! The crew were thirsty last sol. One more thirsty sol and everyone goes home. Put someone on the Recycler now!'
    : s.tank < DRINK_PER_SOL
      ? `The drinking water is almost gone (${s.tank} left). Without the Recycler today, the crew will be thirsty.`
      : `Drinking water is low (${s.tank} left, the crew drink ${DRINK_PER_SOL} each sol). Put someone on the Recycler soon.`;
  return el('p', { class: `plan-water-warning${last ? ' is-danger' : ''}`, role: 'alert' }, text);
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
  const label = sol.storm.kind === 'cme' ? 'Storm cloud from the Sun is here!' : 'Big flash from the Sun!';
  const detail = sol.storm.kind === 'cme'
    ? 'Scientists call this a CME: a huge cloud of Sun material.'
    : `Scientists call this a solar flare, class ${sol.storm.cls}. C is small, M is medium, X is the biggest.`;
  const secondsWord = (n) => `${n === 1 ? 'second' : 'seconds'} left`;

  const finish = () => {
    clearInterval(game.rescueTimer);
    resolve([...rescued]);
  };
  // Commander timer ran out: say so on screen before moving on, and remember who was caught outside.
  const timeUp = () => {
    clearInterval(game.rescueTimer);
    const caught = outside.filter((c) => !rescued.has(c.id)).map((c) => c.name);
    countdown.replaceChildren(el('strong', {}, "Time's up!"), caught.length ? ` ${caught.join(' and ')} ${caught.length > 1 ? 'were' : 'was'} still outside.` : ' Everyone made it inside.');
    done.disabled = true;
    play('beep');
    game.rescueNote = caught.length ? `Time ran out: ${caught.join(' and ')} got caught outside in the storm.` : null;
    for (const r of rows.values()) r.btn.disabled = true;
    setTimeout(() => { if (countdown.isConnected) resolve([...rescued]); }, RESCUE_TIME_UP_MS);
  };
  const done = button(timed ? 'Ready' : 'Done', finish, 'primary');
  const seconds = el('strong', {}, String(left));
  const secondsText = document.createTextNode(` ${secondsWord(left)}`);
  const countdown = el('p', { class: 'countdown', role: 'timer' }, seconds, secondsText);
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
      el('p', {}, 'Tiny, super-fast bits from the Sun are coming. This is radiation, and it is bad for the body. Get everyone outside back to the Shelter!'),
      el('p', { class: 'storm-detail' }, detail),
      timed ? countdown : null),
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
      if (left <= 0) timeUp(); else { seconds.textContent = String(left); secondsText.textContent = ` ${secondsWord(left)}`; }
    }, 1000);
  }
}

// ---------- Resolve ----------
function resolve(rescued) {
  const sol = today();
  const before = game.state;
  const { state, log } = step(before, game.placements, sol, rescued);
  const earned = state.science - game.state.science;
  const wentHome = state.crew.filter((c, i) => c.home && !game.state.crew[i].home).map((c) => c.name);
  game.lastSummary = `Last sol: ${earned ? `+${earned} science` : 'no science'}${sol.storm ? ' · a storm passed' : ''}${wentHome.length ? ` · ${wentHome.join(' and ')} went home` : ''}.${game.rescueNote ? ` ${game.rescueNote}` : ''}`;
  game.rescueNote = null;
  game.log.append(`— Sol ${game.state.sol} (${sol.date}) —`, 'info');
  for (const l of log) game.log.append(l.text, l.type);
  game.state = state;
  if (state.over) return debrief();
  save({ v: 1, state, run: game.run, mode: game.mode, mission: game.mission, placements: game.placements });
  solResult(before, sol, log);
}

// ---------- Sol result ----------
// Each gauge's word on the card, and the step() log types that explain its change.
const CHANGES = {
  power: { word: 'power', why: ['power'] },
  tank: { word: 'water', why: ['water', 'shield'] },
  wall: { word: 'shield', why: ['shield'] },
  science: { word: 'science', why: ['science'] },
};
// Only what changed, read from the states before and after step(); the rules are never re-run here.
function solResult(before, sol, log) {
  const after = game.state;
  const changes = Object.entries(CHANGES).filter(([k]) => after[k] !== before[k]).map(([k, c]) => {
    const d = after[k] - before[k];
    const text = `${d > 0 ? '+' : '−'}${Math.abs(d)} ${c.word}`;
    const why = log.filter((l) => c.why.includes(l.type) && l.text !== text).map((l) => `${l.text}.`).join(' ');
    return { text, why, dir: d > 0 ? 'up' : 'down' };
  });
  const doses = after.crew.map((c, i) => ({ name: c.name, before: before.crew[i].dose, after: c.dose, limit: LIMITS.dose }))
    .filter((d) => d.after > d.before);
  let moved = false; // a double click or a second Enter must not skip the next plan
  const next = () => { if (!moved) { moved = true; plan(); } };
  show(sampleBanner(), solResultView({ sol: before.sol, date: sol.date, changes, doses, isLast: false }, { onNext: next }).el);
}

// ---------- Debrief ----------
function debrief() {
  const s = game.state;
  const r = game.run;
  // A run can end early (win, or everyone home); only count the sols that were played (state.sol is the last one).
  const played = r.sols.filter((x) => x.sol <= s.sol);
  const big = played.filter((x) => x.storm && needsRescue(x.storm));
  // Say plainly why the run ended; a loss should never read like a win.
  const thirstEnd = s.thirstyStreak >= THIRSTY_SOLS_TO_GO_HOME;
  const headline = s.result === 'win'
    ? `Mission complete! ${'★'.repeat(s.stars)}${'☆'.repeat(3 - s.stars)}`
    : s.result === 'home'
      ? (thirstEnd ? 'Mission over: the water ran out, so the crew had to go home.' : 'Mission over: everyone got too much radiation and had to go home.')
      : `Time is up: the supply ship is here. You needed ${SCIENCE_GOAL - s.science} more science.`;
  const tip = s.thirstySols ? 'Tip: keep someone on the Recycler before the drinking water gets low.'
    : s.coldSols ? 'Tip: the Solar Field keeps the heaters on. No power, no science.'
    : s.crew.some((c) => c.home) ? 'Tip: take turns going outside so nobody gets too much radiation.'
    : 'Tip: pump water into the walls when a CME is in the forecast.';
  save(null);
  const tape = createTickerTape();
  const { mode, mission } = game;
  show(
    sampleBanner(),
    el('section', { class: 'card' },
      heading('h2', 'Mission report'),
      tape.el,
      r.start === sky.featured?.sept2017?.start
        ? el('p', {}, 'In September 2017 a big solar storm hit Mars. Curiosity, NASA\'s robot car on Mars, measured more than twice as much radiation as ever before. MAVEN, a NASA spacecraft that flies around Mars, saw the whole sky glow with aurora (colourful lights, like the northern lights on Earth). ',
          el('a', { href: 'https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/', target: '_blank', rel: 'noopener' }, 'Read the NASA story'))
        : null),
    el('p', { class: 'row' },
      button('Try again', () => start({ mode, mission }), 'primary'),
      button('Change mission', () => title({ mode, mission })),
      button('Title', () => title())),
    game.log.el,
  );
  if (s.result === 'win') play('cheer');
  tape.print(game.tapeLines = [
    { text: headline, strong: true },
    `Science: ${s.science}/${SCIENCE_GOAL}`,
    `Your sky: ${r.start} to ${played.at(-1).date}${r.sample ? ' (sample data)' : ', recorded by NASA'}`,
    ...(big.length
      ? [`${big.length} storm${big.length > 1 ? 's' : ''} reached the base:`,
        ...big.map((x) => (x.storm.kind === 'cme' ? `Storm cloud (CME) on ${x.date}` : `Sun flash (flare class ${x.storm.cls}) on ${x.date}`))]
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
