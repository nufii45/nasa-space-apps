// M0/M1 debug UI: fully playable with plain buttons so the team can test the rules today.
// Role B replaces the plan screen with the outpost map; role C replaces gauges/log/buttons with the console kit.
// Keep the flow: title -> (morning -> plan -> [rescue] -> report) x 10 -> debrief.
import { newGame, step, needsRescue, normalisePlacements } from './sim/sim.js';
import { buildRun } from './sim/sky.js';
import { JOBS, CREW, RESCUE_SECONDS, SCIENCE_GOAL } from './sim/constants.js';

const app = document.getElementById('app');
const h = (html) => { app.innerHTML = html; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let sky = null;
let game = null; // { state, run, mode, placements, log, rescueTimer }

async function loadSky() {
  const res = await fetch('./data/sky.json');
  sky = await res.json();
  if (sky.sample) document.querySelector('.source-footer').firstChild.textContent = 'SAMPLE storm data (placeholder, not real) · ';
}

// ---------- Title ----------
function title() {
  const settings = { mode: 'cadet', mission: 'random' };
  const render = () => h(`
    <section class="card">
      <h1>Outpost Dial</h1>
      <p>Run a base on Mars for 10 sols (Mars days). Real solar storms, recorded by NASA, are coming.</p>
      <p class="label">Mission</p>
      <div class="row">
        <button data-mission="random" aria-pressed="${settings.mission === 'random'}">Random week</button>
        <button data-mission="sept2017" aria-pressed="${settings.mission === 'sept2017'}">Featured: Sept 2017 storm</button>
      </div>
      <p class="label">Mode</p>
      <div class="row">
        <button data-mode="cadet" aria-pressed="${settings.mode === 'cadet'}">Cadet (7 to 9)</button>
        <button data-mode="commander" aria-pressed="${settings.mode === 'commander'}">Commander (10 to 12)</button>
      </div>
      <p><button class="primary" id="launch">LAUNCH</button></p>
    </section>`);
  app.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mission) settings.mission = b.dataset.mission;
    if (b.dataset.mode) settings.mode = b.dataset.mode;
    if (b.id === 'launch') return start(settings);
    render();
  };
  render();
}

function start({ mode, mission }) {
  const run = buildRun(sky, { mode, featured: mission === 'random' ? null : mission, seed: Date.now() >>> 0 });
  game = { state: newGame(), run, mode, placements: {}, log: [] };
  plan();
}

// ---------- Shared pieces ----------
function gauges(s) {
  return `<div class="gauges">
    <div class="gauge"><span class="label">Power</span><strong>${s.power}/10</strong></div>
    <div class="gauge"><span class="label">Water tank</span><strong>${s.tank}/10</strong></div>
    <div class="gauge"><span class="label">Wall water</span><strong>${s.wall}/6</strong></div>
    <div class="gauge"><span class="label">Science</span><strong>${s.science}/${SCIENCE_GOAL}</strong></div>
  </div>`;
}
function logBox() {
  return `<div class="log" aria-label="Mission log">${game.log.slice(-30).map((l) => `<div class="${l.type}">${esc(l.text)}</div>`).join('') || 'Mission log ready.'}</div>`;
}
function sampleBanner() {
  return game.run.sample ? '<div class="banner">SAMPLE DATA: storms are placeholders until the real NASA data is fetched.</div>' : '';
}
const today = () => game.run.sols[game.state.sol - 1];

// ---------- Plan (morning + placement) ----------
function plan() {
  const s = game.state;
  const sol = today();
  const forecast = sol.forecast.map((f) => `A cloud of Sun material (CME) is coming, about ${f.inSols} sol${f.inSols > 1 ? 's' : ''} away.`).join(' ') || 'Clear skies forecast. (The Sun can still surprise you.)';
  const active = s.crew.filter((c) => !c.home);
  game.placements = normalisePlacements(s, game.placements);
  const render = () => h(`
    ${sampleBanner()}
    <section class="card">
      <h2>Sol ${s.sol} of 10</h2>
      <p>${esc(forecast)}</p>
    </section>
    ${gauges(s)}
    <section class="card">
      <p class="label">Place your crew (one per job; anyone left goes to the Shelter)</p>
      ${active.map((c) => `
        <div class="row" style="margin-bottom:8px">
          <strong style="min-width:56px">${esc(c.name)}</strong>
          <span class="crew-dose">sunburn ${c.dose}/100</span>
          ${Object.entries(JOBS).map(([id, j]) => `<button data-crew="${c.id}" data-job="${id}" aria-pressed="${game.placements[c.id] === id}">${esc(j.name)}</button>`).join('')}
        </div>`).join('')}
      ${s.crew.filter((c) => c.home).map((c) => `<p class="crew-dose">${esc(c.name)} went home.</p>`).join('')}
      <p><button class="primary" id="end-sol">END SOL</button></p>
    </section>
    ${logBox()}`);
  app.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.crew) {
      const { crew, job } = b.dataset;
      // Taking a job someone else has bumps them to the Shelter.
      for (const [other, j] of Object.entries(game.placements)) if (j === job && job !== 'shelter') game.placements[other] = 'shelter';
      game.placements[crew] = job;
      render();
    }
    if (b.id === 'end-sol') {
      if (needsRescue(sol.storm)) rescue();
      else resolve([]);
    }
  };
  render();
}

// ---------- Rescue ----------
function rescue() {
  const s = game.state;
  const sol = today();
  const outside = s.crew.filter((c) => !c.home && JOBS[game.placements[c.id]]?.where === 'outside');
  const rescued = new Set();
  const walking = new Map(); // crew id -> ms remaining
  const timed = game.mode === 'commander';
  let left = RESCUE_SECONDS;
  const label = sol.storm.kind === 'cme' ? 'CME storm' : `X-ray flash! Flare class ${esc(sol.storm.cls)}`;

  const finish = () => {
    clearInterval(game.rescueTimer);
    resolve([...rescued]);
  };
  const render = () => h(`
    <section class="card storm-alert">
      <h2>${label}</h2>
      <p>Fast particles are on the way. Get everyone outside back to the Shelter!</p>
      ${timed ? `<p style="font-size:40px;font-weight:800">${left}</p>` : ''}
    </section>
    <section class="card">
      ${outside.length ? outside.map((c) => {
        const status = rescued.has(c.id) ? 'Safe in the Shelter' : walking.has(c.id) ? 'Walking back...' : `Outside at the ${JOBS[game.placements[c.id]].name}`;
        return `<div class="row"><strong>${esc(c.name)}</strong> <span>${status}</span>
          ${!rescued.has(c.id) && !walking.has(c.id) ? `<button class="danger" data-rescue="${c.id}">Bring ${esc(c.name)} inside</button>` : ''}</div>`;
      }).join('') : '<p>Everyone is already inside. Phew!</p>'}
      <p><button class="primary" id="done">${timed ? 'Ready' : 'Done'}</button></p>
    </section>`);
  app.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.rescue) {
      const id = b.dataset.rescue;
      const far = JOBS[game.placements[id]].walkBackSeconds || 0;
      if (timed && far) {
        walking.set(id, far);
      } else rescued.add(id);
      render();
    }
    if (b.id === 'done') finish();
  };
  if (timed) {
    game.rescueTimer = setInterval(() => {
      left -= 1;
      for (const [id, t] of walking) {
        if (t <= 1) { walking.delete(id); rescued.add(id); } else walking.set(id, t - 1);
      }
      if (left <= 0) finish(); else render();
    }, 1000);
  }
  render();
}

// ---------- Resolve + report ----------
function resolve(rescued) {
  const sol = today();
  const { state, log } = step(game.state, game.placements, sol, rescued);
  game.log.push({ type: 'info', text: `— Sol ${game.state.sol} (${sol.date}) —` }, ...log);
  game.state = state;
  if (state.over) return debrief();
  plan();
}

// ---------- Debrief ----------
function debrief() {
  const s = game.state;
  const r = game.run;
  const big = r.sols.filter((x) => x.storm && needsRescue(x.storm));
  const headline = s.result === 'win'
    ? `Mission complete! ${'★'.repeat(s.stars)}${'☆'.repeat(3 - s.stars)}`
    : s.result === 'home' ? 'The crew caught the next ride home.' : 'Time is up: the supply ship is here.';
  const tip = s.thirstySols ? 'Tip: keep someone on the Recycler before the tank gets low.'
    : s.coldSols ? 'Tip: the Solar Field keeps the heaters on. No power, no science.'
    : s.crew.some((c) => c.home) ? 'Tip: take turns going outside so nobody gets too much radiation.'
    : 'Tip: pump water into the walls when a CME is in the forecast.';
  h(`
    ${sampleBanner()}
    <section class="card">
      <h2>${headline}</h2>
      <p>Science: ${s.science}/${SCIENCE_GOAL}</p>
      <p>${esc(tip)}</p>
    </section>
    <section class="card">
      <p class="label">Your sky was real</p>
      <p>You played ${r.start} to ${r.end}${r.sample ? ' (sample data)' : ', recorded by NASA'}.
      ${big.length ? `${big.length} storm${big.length > 1 ? 's' : ''} reached you: ${big.map((x) => x.storm.kind === 'cme' ? `CME on ${x.date}` : `class ${esc(x.storm.cls)} flare on ${x.date}`).join(', ')}.` : 'The Sun was quiet that week.'}</p>
      ${r.start === '2017-09-04' ? '<p>In September 2017 a big solar storm hit Mars. NASA\'s Curiosity rover measured radiation more than double its highest reading since landing, and the MAVEN orbiter saw aurora glow over the whole planet. <a href="https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/" target="_blank" rel="noopener">Read the NASA story</a></p>' : ''}
    </section>
    <p class="row"><button class="primary" id="again">Try again</button> <button id="home">Title</button></p>
    ${logBox()}`);
  app.onclick = (e) => {
    const b = e.target.closest('button');
    if (b?.id === 'again') start({ mode: game.mode, mission: 'random' });
    if (b?.id === 'home') title();
  };
}

// ---------- Credits ----------
function credits() {
  h(`<section class="card">
    <h2>Credits and data sources</h2>
    <ul>
      <li>Solar flares, particle events and CMEs: <a href="https://ccmc.gsfc.nasa.gov/tools/DONKI" target="_blank" rel="noopener">NASA CCMC DONKI</a>, archived snapshot${sky?.fetched ? ` fetched ${sky.fetched}` : ' (sample placeholder)'}. One sol in the game = one real calendar day.</li>
      <li>Mars surface radiation (about 0.67 mSv per day): Curiosity RAD, <a href="https://www.swri.org/press-release/swri-scientists-publish-first-radiation-measurements-surface-mars" target="_blank" rel="noopener">SwRI</a>.</li>
      <li>September 2017 storm at Mars: <a href="https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/" target="_blank" rel="noopener">NASA JPL</a>.</li>
      <li>Water as both life support and shielding: <a href="https://www.nasa.gov/general/water-walls-highly-reliable-and-massively-redundant-life-support-architecture" target="_blank" rel="noopener">NASA Water Walls</a>.</li>
    </ul>
    <p><button id="back">Back</button></p>
  </section>`);
  app.onclick = (e) => { if (e.target.closest('#back')) { location.hash = ''; title(); } };
}

window.addEventListener('hashchange', () => { if (location.hash === '#credits') credits(); });

loadSky().then(() => {
  if (location.hash === '#credits') credits(); else title();
}).catch(() => h('<section class="card"><h2>Could not load the storm data.</h2><p>Please reload the page.</p></section>'));
