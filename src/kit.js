// Test page for the console kit: every component, wired to fake events. Open /kit.html.
import {
  createKnob, createToggle, createCoverButton, createGauge, createLamps,
  createMissionLog, createInfoDrawer, createTickerTape, createMuteSwitch, play,
} from './ui/console/index.js';

const root = document.getElementById('kit');
const section = (title, ...nodes) => {
  const s = document.createElement('section');
  s.className = 'card kit-section';
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row kit-row';
  row.append(...nodes);
  s.append(h, row);
  return s;
};
const button = (label, onclick) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.onclick = onclick;
  return b;
};

const log = createMissionLog();
const say = (t, type) => log.append(t, type);

// Knobs
const site = createKnob({ label: 'Site', options: [{ value: 'mars', label: 'MARS' }, { value: 'moon', label: 'MOON', disabled: true }], onChange: (v) => say(`Site: ${v}`) });
const mission = createKnob({ label: 'Mission', options: [{ value: 'random', label: 'RANDOM' }, { value: 'sept2017', label: 'SEPT 2017' }], onChange: (v) => say(`Mission: ${v}`) });
const speed = createKnob({ label: 'Speed', size: 120, options: [{ value: 0, label: 'PAUSE' }, { value: 1, label: '1x' }, { value: 2, label: '2x' }], value: 1, onChange: (v) => say(`Speed: ${v}x`) });

// Toggles
const mode = createToggle({ label: 'Commander mode', onLabel: 'CMDR', offLabel: 'CADET', onChange: (on) => say(`Mode: ${on ? 'Commander' : 'Cadet'}`) });
const mute = createMuteSwitch();

// Cover buttons
const launch = createCoverButton({ label: 'LAUNCH', onPress: () => { say('LAUNCH pressed. Mission start!', 'science'); play('cheer'); } });
const endSol = createCoverButton({ label: 'END SOL', tone: 'storm', autoClose: 0, onPress: () => say('Sol ended.') });

// Gauges
const gauges = {
  power: createGauge({ label: 'Power', icon: '⚡', max: 10, value: 6, low: 2 }),
  tank: createGauge({ label: 'Water', icon: '💧', max: 10, value: 8, low: 3 }),
  wall: createGauge({ label: 'Wall', icon: '🛡', max: 6, value: 0 }),
  science: createGauge({ label: 'Science', icon: '🔬', max: 100, value: 0 }),
};
const nudge = (k, d) => () => gauges[k].set(gauges[k].get() + d);

// Lamps
const lamps = createLamps({ lamps: [
  { id: 'power', label: 'Power', icon: '⚡' },
  { id: 'water', label: 'Water', icon: '💧' },
  { id: 'storm', label: 'Storm', icon: '☀' },
  { id: 'crew', label: 'Crew', icon: '👩‍🚀' },
] });
lamps.set('crew', 'ok');

// Drawer
const drawer = createInfoDrawer();
document.body.append(drawer.el);

// Ticker tape
const tape = createTickerTape();

root.append(
  section('Rotary knobs', site.el, mission.el, speed.el),
  section('Toggle switches', mode.el, mute.el),
  section('Covered buttons', launch.el, endSol.el),
  section('Needle gauges', ...Object.values(gauges).map((g) => g.el)),
  section('Gauge test controls',
    button('Power −2', nudge('power', -2)), button('Power +2', nudge('power', 2)),
    button('Water −2', nudge('tank', -2)), button('Wall +2', nudge('wall', 2)), button('Science +15', nudge('science', 15))),
  section('Warning lamps', lamps.el,
    button('Low water', () => lamps.set('water', 'warn')),
    button('Storm!', () => { lamps.sweep(); lamps.set('storm', 'storm'); say('X-ray flash! Flare class X8.2', 'storm'); }),
    button('Clear', () => { lamps.clear(); lamps.set('crew', 'ok'); })),
  section('Mission log', log.el,
    button('Add line', () => say('Sol 3 · Ana cleaned the solar panels · +5 power', 'power'))),
  section('Info drawer', button('Open "Water Wall" card', () => drawer.open({
    title: 'Water Wall pump',
    tabs: [
      { label: 'Overview', body: 'Moves water from the drinking tank into the shelter walls. Water blocks radiation.' },
      { label: 'How it works', body: 'Radiation is tiny fast particles. Water is full of hydrogen, which is good at slowing them down. More water in the walls means less radiation reaches the crew.' },
      { label: 'Real data', body: 'NASA has studied "water walls": the same water-filled cells clean air and water and also shield the crew.' },
    ],
    source: { label: 'NASA Water Walls', url: 'https://www.nasa.gov/general/water-walls-highly-reliable-and-massively-redundant-life-support-architecture' },
  }))),
  section('Ticker tape', tape.el, button('Print debrief', () => tape.print([
    { text: 'MISSION REPORT', strong: true },
    'Science: 100/100  ★★★',
    'Your sky: 4–13 Sept 2017',
    'Class X8.2 flare on sol 7',
    'Tip: fill the walls before a CME.',
  ]))),
);
