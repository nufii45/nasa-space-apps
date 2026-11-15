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
import { el, nextId } from './ui/console/util.js';
import { jobCard } from './ui/jobInfo.js';
import { render as solResultView } from './ui/screens/solResult.js';
import { render as reportView } from './ui/screens/report.js';
import { render as resumeView } from './ui/screens/resume.js';
import { render as titleView } from './ui/screens/title.js';
import { render as stormView } from './ui/screens/storm.js';
import { createStage } from './ui/stage/index.js';
import { createCallouts } from './ui/stage/callouts.js';

// Warning thresholds for gauges and lamps, derived from the rules so retuning keeps them meaningful.
const LOW = { power: HEATER_COST, tank: DRINK_PER_SOL };
const NEAR_LIMIT = LIMITS.dose - CME_DOSE; // one more CME caught outside would send them home
const SHELTER = Object.keys(JOBS).find((id) => JOBS[id].where === 'shelter');

const app = document.getElementById('app');
const drawer = createInfoDrawer();
document.body.append(drawer.el);
// One Sound switch per screen: the title view has its own, so title() takes the top bar off the page,
// and the plan screen moves this switch into its rail.
const sound = createMuteSwitch();
const topBar = el('header', { class: 'top-bar' }, sound.el);

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
  if (sky?.sample) document.querySelector('.source-footer').firstChild.textContent = 'SAMPLE storm data (placeholder, not real) · ';
}

// Swap the screen and move focus to its heading so keyboard and screen-reader users land on it.
// A screen with timers or a stage sets `leave` after show(); the next show() stops them.
let leave = null;
function show(...nodes) {
  leave?.();
  leave = null;
  drawer.close();
  topBar.append(sound.el);
  if (!topBar.isConnected) document.body.prepend(topBar);
  app.className = '';
  app.replaceChildren(...nodes.filter(Boolean));
  app.querySelector('h1, h2')?.focus();
}
// Same 700 px switch as the help drawer (src/ui/console/infoDrawer.js).
const phoneQuery = () => window.matchMedia?.('(max-width: 699px)');
const layoutNow = () => (phoneQuery()?.matches ? 'phone' : 'desktop');
// The stage behind the title and storm screens is a picture: never focusable, never read out.
function backdropStage(opts) {
  const stage = createStage({ jobs: JOBS, layout: layoutNow(), ...opts });
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
    { mission: last.mission ?? 'random', mode: last.mode ?? 'cadet', sample: !!sky?.sample },
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
  game.gauges.science.el.classList.add('is-goal'); // the plan screen marks the goal at the end of its bar
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
  for (const [k, g] of Object.entries(game.gauges)) {
    g.set(s[k]);
    g.el.style.setProperty('--fill', g.get() / Number(g.el.getAttribute('aria-valuemax'))); // the plan screen's bar
  }
  const l = game.lamps;
  l.set('power', s.power <= LOW.power ? 'warn' : 'ok');
  l.set('water', s.tank <= LOW.tank ? 'warn' : 'ok');
  l.set('storm', today().forecast.length ? 'storm' : 'ok');
  l.set('crew', s.crew.some((c) => c.home) ? 'storm' : s.crew.some((c) => c.dose >= NEAR_LIMIT) ? 'warn' : 'ok');
}

// ---------- Plan (morning + placement) ----------
// Callout words and icons (24 px paths) from Scene.dc.html; station names come from JOBS.
const CALLOUTS = {
  recycler: { text: 'Cleans water so the crew can drink it again.', icon: 'M4 12a8 8 0 0 1 14-5l2-2v6h-6l2-2a5 5 0 0 0-9 3M20 12a8 8 0 0 1-14 5l-2 2v-6h6l-2 2a5 5 0 0 0 9-3' },
  shelter: { text: 'Safest place in a storm. Rest here.', icon: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z' },
  lab: { text: 'Do experiments to earn science.', icon: 'M9 3h6M10 3v6l-5 10a1 1 0 0 0 1 2h12a1 1 0 0 0 1-2l-5-10V3' },
  pump: { text: 'Moves water into the Shelter walls to block storms.', icon: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z' },
  solar: { text: 'Makes power from sunlight.', icon: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1' },
  rover: { text: 'Drive far to study rocks. Lots of science, but far from home.', icon: 'M4 14h16l-2-5H8zM4 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M14 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0' },
};
const STATIONS = Object.entries(CALLOUTS).map(([id, c]) => ({ id, title: JOBS[id].name, ...c }));
// The same colours, in crew order, as the astronauts on the stage (src/ui/stage/index.js).
const CREW_COLORS = ['#7C6BD6', '#3F86C9', '#3E9B6A', '#C76B98', '#B8862B', '#5A6178'];
// Rail and Sun report icons from Main.dc.html.
const ICONS = {
  home: 'M3 11l9-7 9 7v9h-6v-6H9v6H3z',
  book: 'M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1zM12 6v14',
  info: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 11v6M12 7.5v.5',
  sun: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
};
const icon = (d, size = 22) => el('svg:svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' }, el('svg:path', { d }));
const navButton = (label, d, onclick, attrs = {}) => el('button', { type: 'button', class: 'plan-nav', onclick, ...attrs }, icon(d), el('span', { class: 'plan-nav-text' }, label));
const howToPlay = () => ({
  title: 'How to play',
  tabs: [{ label: 'Steps', body: el('ol', {}, ...[
    'Tap an astronaut, then tap a station to give them a job.',
    'One astronaut per job. If someone already has that job, they go to rest in the Shelter.',
    'The Shelter has room for everyone. Anyone without a job rests there.',
    'Read the Sun report. When a storm is coming, fill the Shelter walls with water.',
    'Lift the cover, then press END SOL to finish the Mars day.',
    `Earn ${SCIENCE_GOAL} science in ${SOLS_PER_RUN} sols, and keep your crew safe.`,
  ].map((t) => el('li', {}, t))) }],
});

function plan() {
  const s = game.state;
  const sol = today();
  const n = s.sol;
  const active = s.crew.filter((c) => !c.home);
  game.placements = normalisePlacements(s, game.placements);
  let picked = null; // crew id
  let selected = null; // station id
  let shown; // the station the Station tab shows
  let tab = 0;
  let layout = layoutNow();
  let ended = false; // a double press on END SOL must resolve the sol once

  const help = (id) => drawer.open(jobCard(id));
  const who = () => Object.fromEntries(Object.keys(JOBS).map((id) => [id, active.filter((c) => game.placements[c.id] === id).map((c) => c.name)]));
  const stage = createStage({ jobs: JOBS, crew: s.crew, placements: game.placements, picked, selected, mode: 'plan', layout, onStation: tap, onHelp: help });
  const callouts = createCallouts({ stage, stations: STATIONS, who: who(), selected, picked, layout, onSelect: tap, onHelp: help });
  const selectedSlot = el('div', { class: 'plan-selected' }); // phone: the selected station's card, under the stage
  if (layout === 'phone') selectedSlot.append(callouts.el);
  const hint = el('p', { class: 'plan-hint', role: 'status' });

  // Tap an astronaut, then a station. The stage and callouts only draw; the placing happens here.
  function pick(c) {
    if (c.home) return draw(`${c.name} went home and can't work.`);
    picked = picked === c.id ? null : c.id;
    play('click');
    draw();
  }
  function tap(id) {
    selected = id;
    tab = 0;
    drawTabs();
    const c = active.find((x) => x.id === picked);
    if (!c) return draw();
    picked = null;
    if (game.placements[c.id] === id) return draw(`${c.name} stays at the ${JOBS[id].name}.`);
    // Decision 0012: the newcomer takes a busy job and whoever had it goes to the Shelter.
    const bumped = id === SHELTER ? [] : active.filter((x) => x !== c && game.placements[x.id] === id);
    game.placements = normalisePlacements(s, { ...game.placements, ...Object.fromEntries(bumped.map((x) => [x.id, SHELTER])), [c.id]: id });
    play('clack');
    draw(`${c.name} is at the ${JOBS[id].name}.${bumped.map((x) => ` ${x.name} went to the ${JOBS[SHELTER].name}.`).join('')}`);
  }

  const cards = s.crew.map((c, i) => {
    const status = el('span', { class: 'plan-crew-status' });
    const b = el('button', { type: 'button', class: `plan-crew-card${c.home ? ' is-home' : ''}`, 'aria-disabled': c.home && 'true', onclick: () => pick(c) },
      el('svg:svg', { class: 'plan-helmet', width: 46, height: 46, viewBox: '0 0 46 46', 'aria-hidden': 'true', focusable: 'false' },
        el('svg:circle', { cx: 23, cy: 23, r: 20, fill: c.home ? '#C9C3B6' : CREW_COLORS[i % CREW_COLORS.length], stroke: 'currentColor', 'stroke-width': 2 }),
        el('svg:ellipse', { cx: 26, cy: 22, rx: 11, ry: 8, fill: 'currentColor' })),
      el('span', { class: 'plan-crew-text' },
        el('span', { class: 'plan-crew-top' }, el('span', { class: 'plan-crew-name' }, c.name), el('span', { class: 'plan-mono' }, `radiation ${c.dose}/${LIMITS.dose}`)),
        el('span', { class: 'plan-meter', 'aria-hidden': 'true' }, el('span', { style: `width: ${Math.min(100, (100 * c.dose) / LIMITS.dose)}%` })),
        status));
    return { c, b, status };
  });

  // Right panel tabs: what the selected station does, and the run's mission log.
  const stationPanel = el('div', { class: 'plan-panel', role: 'tabpanel' });
  const logPanel = el('div', { class: 'plan-panel', role: 'tabpanel' }, game.log.el);
  const panels = [stationPanel, logPanel];
  const tabs = ['Station', 'Mission log'].map((label, i) => {
    const id = nextId('plan-tab');
    panels[i].id = nextId('plan-panel');
    panels[i].setAttribute('aria-labelledby', id);
    return el('button', { type: 'button', role: 'tab', id, class: 'plan-tab', 'aria-controls': panels[i].id, onclick: () => { tab = i; drawTabs(); } }, label);
  });
  function drawTabs() {
    tabs.forEach((b, i) => b.setAttribute('aria-selected', String(i === tab)));
    panels.forEach((p, i) => { p.hidden = i !== tab; });
  }
  function drawStation() {
    shown = selected;
    if (!selected) return stationPanel.replaceChildren(el('p', { class: 'plan-quiet' }, 'Tap a station to see what it does.'));
    const card = jobCard(selected);
    stationPanel.replaceChildren(
      el('div', { class: 'plan-station-head' }, el('h2', {}, card.title), el('span', { class: 'plan-cap' }, JOBS[selected].where === 'outside' ? 'Outside' : 'Inside')),
      el('p', {}, card.tabs[0].body),
      card.tabs[1].body,
      button('? Open help card', () => help(shown), 'plan-help'));
  }

  function draw(msg) {
    const p = active.find((c) => c.id === picked);
    stage.update({ placements: game.placements, picked, selected });
    callouts.update({ who: who(), picked, selected });
    for (const { c, b, status } of cards) {
      const at = JOBS[game.placements[c.id]]?.name;
      b.classList.toggle('is-picked', c.id === picked);
      if (!c.home) b.setAttribute('aria-pressed', String(c.id === picked));
      b.setAttribute('aria-label', `${c.name}, radiation ${c.dose}/${LIMITS.dose}, ${c.home ? 'went home' : `at ${at}`}`);
      status.textContent = c.home ? "Went home to Earth. Safe, but can't work."
        : c.id === picked ? 'Picked! Now tap a station.'
          : game.placements[c.id] === SHELTER ? `Resting in the ${JOBS[SHELTER].name}` : `At the ${at}`;
    }
    if (selected !== shown) drawStation();
    hint.textContent = msg || (!active.length ? 'Everyone went home.'
      : p ? `Now tap a station for ${p.name}. Tap ${p.name} again to cancel.` : 'Tap an astronaut, then tap a station.');
  }

  const endSol = createCoverButton({
    label: 'END SOL', tone: 'go', coverText: 'END SOL', autoClose: 0,
    onPress: () => {
      if (ended) return;
      ended = true;
      if (needsRescue(sol.storm)) rescue(); else resolve([]);
    },
  });
  // Several CMEs can arrive on the same day; say each arrival day once.
  const forecast = [...new Set(sol.forecast.map((f) => f.inSols))].map((k) => `A cloud of Sun material (CME) is coming, about ${k} sol${k > 1 ? 's' : ''} away.`).join(' ') || 'Clear skies forecast. (The Sun can still surprise you.)';
  const soundSlot = el('span');

  drawTabs();
  draw();
  show(
    sampleBanner(),
    el('div', { class: 'plan' },
      el('nav', { class: 'plan-rail', 'aria-label': 'Main menu' },
        navButton('Home', ICONS.home, () => app.querySelector('h1')?.focus(), { 'aria-current': 'page' }),
        navButton('How to play', ICONS.book, () => drawer.open(howToPlay())),
        soundSlot,
        navButton('Credits', ICONS.info, () => { location.hash = '#credits'; })),
      el('div', { class: 'plan-main' },
        el('header', { class: 'plan-head' },
          el('div', {}, heading('h1', `Sol ${n} of ${SOLS_PER_RUN}`),
            el('p', { class: 'plan-quiet' }, `A sol is a Mars day. Your sky: ${game.run.sample ? 'sample data' : 'real NASA dates'}, ${sol.date}.`)),
          el('ol', { class: 'plan-sols', 'aria-label': `Sol progress: ${n - 1} done, today is sol ${n}, ${SOLS_PER_RUN - n} to go` },
            ...Array.from({ length: SOLS_PER_RUN }, (_, i) => i + 1).map((k) =>
              el('li', { class: k < n ? 'is-done' : k === n ? 'is-today' : 'is-next', 'aria-hidden': 'true' }, k < n ? '✓' : String(k))))),
        el('section', { class: 'plan-card plan-sun', 'aria-label': 'Sun report' }, icon(ICONS.sun, 28),
          el('div', {},
            el('p', {}, el('strong', {}, 'Sun report'), ' ', forecast),
            game.run.start === sky.featured?.sept2017?.start
              ? el('p', { class: 'plan-storm-tip' }, 'Sept 2017 tip: big flares give no warning. Fill the shelter walls early and take turns going outside.')
              : null)),
        game.lastSummary ? el('p', { class: 'plan-last-sol', role: 'status' }, game.lastSummary) : null,
        waterWarning(s),
        el('div', { class: 'plan-stage' }, stage.el, callouts.toggle),
        selectedSlot,
        el('section', { class: 'plan-crew', 'aria-label': 'Your crew' },
          el('p', { class: 'plan-cap' }, 'Your crew'), hint,
          el('div', { class: 'plan-crew-row' }, ...cards.map((x) => x.b)))),
      el('aside', { class: 'plan-side', 'aria-label': 'Status and station' },
        el('section', { class: 'plan-card plan-status', 'aria-label': 'Status' },
          el('p', { class: 'plan-cap' }, 'Status'), game.lamps.el,
          el('div', { class: 'plan-gauges' }, ...Object.values(game.gauges).map((g) => g.el))),
        el('section', { class: 'plan-card plan-tabs' },
          el('div', { class: 'plan-tablist', role: 'tablist', 'aria-label': 'Panel' }, ...tabs), ...panels),
        el('section', { class: 'plan-end', 'aria-label': 'End the sol' },
          endSol.el, el('p', { class: 'plan-quiet' }, 'Lift the cover, then press END SOL.')))),
  );
  soundSlot.replaceWith(sound.el);
  topBar.remove();
  app.className = 'is-plan';
  updateInstruments();

  // Phone and desktop swap live; the phone card goes back under the stage in the same task as the update.
  const mq = phoneQuery();
  const relayout = () => {
    layout = layoutNow();
    stage.update({ layout });
    callouts.update({ layout });
    if (layout === 'phone') selectedSlot.append(callouts.el);
  };
  mq?.addEventListener?.('change', relayout);
  leave = () => { stage.destroy(); mq?.removeEventListener?.('change', relayout); };
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
  let finished = false; // a double tap on Done or Ready must resolve the sol once
  const finish = () => { if (!finished) { finished = true; resolve([...rescued]); } };
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
      if (finished || timesUp || rescued.has(id) || walking.has(id)) return;
      const far = JOBS[game.placements[id]].walkBackSeconds || 0;
      if (timed && far) walking.set(id, far);
      else rescued.add(id);
      view.update(model());
    },
    onReady: () => { if (!timesUp) finish(); },
  });
  // Commander timer ran out: say so on screen before moving on, and remember who was caught outside.
  const timeUp = () => {
    clearInterval(timer);
    timesUp = true;
    view.update(model());
    play('beep');
    const names = caught();
    game.rescueNote = names.length ? `Time ran out: ${names.join(' and ')} got caught outside in the storm.` : null;
    upTimer = setTimeout(finish, RESCUE_TIME_UP_MS);
  };

  const stage = backdropStage({ crew: s.crew, placements: game.placements, mode: 'storm' });
  show(el('div', { class: 'storm-takeover' }, el('div', { class: 'storm-stage' }, stage.el), view.el));
  // The takeover covers the footer, so its Credits link must not take focus until the storm is over.
  const footer = document.querySelector('.source-footer');
  footer?.setAttribute('inert', '');
  leave = () => { clearInterval(timer); clearTimeout(upTimer); stage.destroy(); footer?.removeAttribute('inert'); };
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
