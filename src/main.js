// Screen controller: title -> (plan -> [rescue] -> sol result) x up to 10 sols -> report, plus #credits.
// Rules live in src/sim/; this file only calls them and draws the result with the console kit.
import { newGame, step, needsRescue, normalisePlacements } from './sim/sim.js';
import { buildRun } from './sim/sky.js';
import {
  JOBS, LIMITS, RESCUE_SECONDS, RESCUE_TIME_UP_MS, SCIENCE_GOAL, SOLS_PER_RUN, HEATER_COST, DRINK_PER_SOL, CME_DOSE,
  THIRSTY_SOLS_TO_GO_HOME, CREW,
} from './sim/constants.js';
import {
  createCoverButton, createGauge, createLamps, createMissionLog, createInfoDrawer, createMuteSwitch, play,
} from './ui/console/index.js';
import { el } from './ui/console/util.js';
import { jobCard } from './ui/jobInfo.js';
import { createOutpostMap } from './ui/map/index.js';
import { render as solResultView } from './ui/screens/solResult.js';
import { render as reportView } from './ui/screens/report.js';
import { render as resumeView } from './ui/screens/resume.js';
import { render as titleView } from './ui/screens/title.js';
import { render as stormView } from './ui/screens/storm.js';
import { createStage } from './ui/stage/index.js';

// Warning thresholds for gauges and lamps, derived from the rules so retuning keeps them meaningful.
const LOW = { power: HEATER_COST, tank: DRINK_PER_SOL };
const NEAR_LIMIT = LIMITS.dose - CME_DOSE; // one more CME caught outside would send them home

const app = document.getElementById('app');
const drawer = createInfoDrawer();
document.body.append(drawer.el);
// The title view has its own Sound switch, so title() takes this one off the page.
const topBar = el('header', { class: 'top-bar' }, createMuteSwitch().el);

let sky = null;
let game = null; // { state, run, mode, mission, placements, log, gauges, lamps, lastSummary, rescueNote }

// The run is saved after each sol so a refresh can resume it. Storage can throw (private mode, full,
// blocked); the game must play on without it. Pass null to clear.
const SAVE_KEY = 'outpost-dial.save.v1';
function save(data) {
  try {
    if (data) localStorage.setItem(SAVE_KEY, JSON.stringify(data)); else localStorage.removeItem(SAVE_KEY);
  } catch { /* storage blocked */ }
}
const MISSIONS = { random: 'Random week', sept2017: 'Sept 2017' };
const MODES = { cadet: 'Cadet', commander: 'Commander' };
// The save is untrusted input: anything broken, old or from another version is cleared, never half-loaded.
function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    const s = d?.state;
    const ok = d?.v === 1 && Object.hasOwn(MODES, d.mode) && Object.hasOwn(MISSIONS, d.mission) && s && !s.over
      && ['sol', 'power', 'tank', 'wall', 'science', 'thirstyStreak', 'coldSols', 'thirstySols'].every((k) => Number.isFinite(s[k]))
      && Array.isArray(s.crew) && s.crew.length === CREW.length
      && s.crew.every((c, i) => c?.id === CREW[i].id && typeof c.name === 'string' && Number.isFinite(c.dose))
      && typeof d.run?.start === 'string' && Array.isArray(d.run.sols) && d.run.sols.length === SOLS_PER_RUN
      && d.run.sols.every((x, i) => x?.sol === i + 1 && typeof x.date === 'string' && typeof x.storm === 'object'
        && Array.isArray(x.forecast) && x.forecast.every((f) => Number.isFinite(f?.inSols)))
      && Number.isInteger(s.sol) && s.sol >= 1 && s.sol <= SOLS_PER_RUN;
    if (ok) return d;
  } catch { /* storage blocked, or not JSON */ }
  save(null);
  return null;
}

async function loadSky() {
  const res = await fetch('./data/sky.json');
  sky = await res.json();
  if (sky.sample) document.querySelector('.source-footer').firstChild.textContent = 'SAMPLE storm data (placeholder, not real) · ';
}

// Swap the screen and move focus to its heading so keyboard and screen-reader users land on it.
// A screen with timers or a stage sets `leave` after show(); the next show() stops them.
let leave = null;
function show(...nodes) {
  leave?.();
  leave = null;
  drawer.close();
  if (!topBar.isConnected) document.body.prepend(topBar);
  app.replaceChildren(...nodes.filter(Boolean));
  app.querySelector('h1, h2')?.focus();
}
// The stage behind the title and storm screens is a picture: never focusable, never read out.
function backdropStage(opts) {
  const layout = window.matchMedia?.('(max-width: 699px)')?.matches ? 'phone' : 'desktop';
  const stage = createStage({ jobs: JOBS, layout, ...opts });
  stage.el.setAttribute('inert', '');
  stage.el.setAttribute('aria-hidden', 'true');
  return stage;
}
const heading = (tag, text) => el(tag, { tabindex: -1 }, text);
const button = (text, onclick, cls) => el('button', { type: 'button', class: cls, onclick }, text);

// Stop the old run's log queue; the line being typed still finishes (the kit has no abort).
function stopGame() {
  game?.log.clear();
}

// ---------- Title ----------
// last: { mode, mission } from "Change mission", so the knob and switch keep the previous choice.
function title(last = {}) {
  stopGame();
  const view = titleView(
    { mission: last.mission ?? 'random', mode: last.mode ?? 'cadet', sample: sky?.sample === true },
    { onLaunch: ({ mission, mode }) => { play('cheer'); start({ mode, mission }); } },
  );
  const stage = backdropStage({ crew: newGame().crew, placements: {} });
  view.el.querySelector('[data-slot="backdrop"]').append(stage.el);
  show(view.el);
  topBar.remove();
  leave = () => stage.destroy();
}

// A new run, or with a save { state, run, placements } the run it holds (its placements are normalised again in plan()).
function start({ mode, mission, state, run, placements }) {
  if (!run) {
    run = buildRun(sky, { mode, featured: mission === 'random' ? null : mission, seed: Date.now() >>> 0 });
    save(null);
  }
  // The instruments live for the whole run: needles move and the log keeps every sol.
  stopGame();
  game = {
    state: state ?? newGame(), run, mode, mission, placements: { ...placements },
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
  game.log.append(state ? `Mission resumed on sol ${state.sol}. Your sky began on ${run.start}.` : `Mission start. Your sky begins on ${run.start}.`, 'info');
  plan();
}

// ---------- Resume (after a refresh mid-run) ----------
function resumePrompt(saved) {
  show(resumeView(
    { sol: saved.state.sol, totalSols: SOLS_PER_RUN, missionLabel: MISSIONS[saved.mission], modeLabel: MODES[saved.mode] },
    {
      // A save the checks missed must not leave a dead Resume button: drop it and start fresh.
      onResume: () => { try { start(saved); } catch { save(null); title(); } },
      onStartOver: () => { save(null); title(); },
    },
  ).el);
}

// ---------- Shared pieces ----------
function sampleBanner() {
  return game.run.sample ? el('div', { class: 'banner' }, 'SAMPLE DATA: storms are placeholders until the real NASA data is fetched.') : null;
}
const today = () => game.run.sols[game.state.sol - 1];

function updateInstruments() {
  const s = game.state;
  for (const [k, g] of Object.entries(game.gauges)) g.set(s[k]);
  const l = game.lamps;
  l.set('power', s.power <= LOW.power ? 'warn' : 'ok');
  l.set('water', s.tank <= LOW.tank ? 'warn' : 'ok');
  l.set('storm', today().forecast.length ? 'storm' : 'ok');
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
  const cme = sol.storm.kind === 'cme';
  let left = RESCUE_SECONDS;
  let timesUp = false;
  let timer = null;
  let upTimer = null;
  const caught = () => outside.filter((c) => !rescued.has(c.id)).map((c) => c.name);
  const model = () => ({
    title: cme ? 'Storm cloud from the Sun is here!' : 'Big flash from the Sun!',
    classText: cme ? 'Scientists call this a CME: a huge cloud of Sun material.' : `Scientists call this a solar flare, class ${sol.storm.cls}.`,
    timed, left, total: RESCUE_SECONDS, timesUp,
    caughtText: caught().length ? `${caught().join(' and ')} ${caught().length > 1 ? 'were' : 'was'} still outside.` : 'Everyone made it inside.',
    rows: outside.map((c) => ({
      id: c.id, name: c.name, where: JOBS[game.placements[c.id]].name,
      status: rescued.has(c.id) ? 'safe' : walking.has(c.id) ? 'walk' : 'out', walkLeft: walking.get(c.id) ?? 0,
    })),
  });

  const view = stormView(model(), {
    onBring(id) {
      if (timesUp || rescued.has(id) || walking.has(id)) return;
      const far = JOBS[game.placements[id]].walkBackSeconds || 0;
      if (timed && far) walking.set(id, far);
      else rescued.add(id);
      view.update(model());
    },
    onReady: () => { if (!timesUp) resolve([...rescued]); },
  });
  // Commander timer ran out: say so on screen before moving on, and remember who was caught outside.
  const timeUp = () => {
    clearInterval(timer);
    timesUp = true;
    view.update(model());
    play('beep');
    const names = caught();
    game.rescueNote = names.length ? `Time ran out: ${names.join(' and ')} got caught outside in the storm.` : null;
    upTimer = setTimeout(() => resolve([...rescued]), RESCUE_TIME_UP_MS);
  };

  const stage = backdropStage({ crew: s.crew, placements: game.placements, mode: 'storm' });
  show(el('div', { class: 'storm-takeover' }, el('div', { class: 'storm-stage' }, stage.el), view.el));
  leave = () => { clearInterval(timer); clearTimeout(upTimer); stage.destroy(); };
  play('alarm');

  if (timed) {
    timer = setInterval(() => {
      left -= 1;
      for (const [id, t] of walking) {
        if (t <= 1) { walking.delete(id); rescued.add(id); } else walking.set(id, t - 1);
      }
      if (left <= 0) timeUp(); else view.update(model());
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
  solResult(before, sol);
}

// ---------- Sol result ----------
// Each gauge's word on the card, and a why for each direction. The card shows net changes and step()'s log
// gives gross amounts, so a why never quotes a number: it is a fixed sentence true whenever its line shows.
// A rise can only come from a job, and the caps only throw gain away, so "made more than used" holds. A fall
// can be the cap clipping a gain, so the down sentences make no comparison (cold and thirsty sols included).
// Empty when that direction cannot happen (walls and science never go down).
const CHANGES = {
  power: { word: 'power', up: 'The Solar Field made more power than the base used.', down: 'The base used power.' },
  tank: { word: 'water', up: 'The Recycler made more water than the base used.', down: 'The base used water.' },
  wall: { word: 'shield', up: 'Water was pumped into the shelter walls.', down: '' },
  science: { word: 'science', up: 'The crew did science.', down: '' },
};
// Only what changed, read from the states before and after step(); the rules are never re-run here.
function solResult(before, sol) {
  const after = game.state;
  const changes = Object.entries(CHANGES).filter(([k]) => after[k] !== before[k]).map(([k, c]) => {
    const d = after[k] - before[k];
    const dir = d > 0 ? 'up' : 'down';
    return { text: `${d > 0 ? '+' : '−'}${Math.abs(d)} ${c.word}`, why: c[dir], dir };
  });
  const doses = after.crew.map((c, i) => ({ name: c.name, before: before.crew[i].dose, after: c.dose, limit: LIMITS.dose }))
    .filter((d) => d.after > d.before);
  let moved = false; // a double click or a second Enter must not skip the next plan
  const next = () => { if (!moved) { moved = true; plan(); } };
  show(sampleBanner(), solResultView({ sol: before.sol, date: sol.date, changes, doses, isLast: false }, { onNext: next }).el);
}

// ---------- Debrief ----------
const andList = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);

function debrief() {
  save(null);
  const s = game.state;
  const r = game.run;
  // A run can end early (win, or everyone home); only count the sols that were played (state.sol is the last one).
  const played = r.sols.filter((x) => x.sol <= s.sol);
  // Say plainly why the run ended; a loss should never read like a win.
  const reason = s.result === 'win'
    ? `Well done! You got ${s.science} science${s.crew.every((c) => !c.home) ? ' and the whole crew stayed safe' : ''}.`
    : s.result === 'home'
      ? (s.thirstyStreak >= THIRSTY_SOLS_TO_GO_HOME
        ? `The water ran out ${THIRSTY_SOLS_TO_GO_HOME} sols in a row.`
        : `${andList(s.crew.filter((c) => c.home).map((c) => c.name))} got too much radiation.`)
      : `You needed ${SCIENCE_GOAL - s.science} more science.`;
  const tip = s.thirstySols ? 'Keep someone on the Recycler before the drinking water gets low.'
    : s.coldSols ? 'The Solar Field keeps the heaters on. No power, no science.'
    : s.crew.some((c) => c.home) ? 'Take turns going outside so nobody gets too much radiation.'
    : 'Pump water into the walls when a CME is in the forecast.';
  const { mode, mission } = game;
  const view = reportView({
    ending: s.result, stars: s.stars, reason, science: s.science, scienceGoal: SCIENCE_GOAL,
    sky: { start: r.start, end: played.at(-1).date, sample: !!r.sample },
    storms: played.filter((x) => needsRescue(x.storm)).map((x) => ({
      label: x.storm.kind === 'cme' ? 'Storm cloud (CME)' : `Sun flash (flare class ${x.storm.cls})`, date: x.date,
    })),
    tip, sept2017: r.start === sky.featured?.sept2017?.start,
  }, {
    onTryAgain: () => start({ mode, mission }),
    onChangeMission: () => title({ mode, mission }),
    onTitle: () => title(),
  });
  show(sampleBanner(), view.el, game.log.el);
  if (s.result === 'win') play('cheer');
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
  if (location.hash === '#credits') return credits();
  const saved = loadSave();
  if (saved) resumePrompt(saved); else title();
}).catch(() => show(el('section', { class: 'card' }, heading('h2', 'Could not load the storm data.'), el('p', {}, 'Please reload the page.'))));
