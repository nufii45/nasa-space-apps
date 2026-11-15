// Title and mission select (W13). A pure view (decision 0009):
// render({ mission: 'random'|'sept2017', mode: 'cadet'|'commander', sample }, { onLaunch({ mission, mode }) })
// The integrator mounts the slowly turning stage in the empty [data-slot="backdrop"] element.
import { el, nextId } from '../console/util.js';
import { createKnob, createToggle, createCoverButton, createMuteSwitch } from '../console/index.js';

const MISSION_HINT = { random: 'A surprise week from 2012 to 2025.', sept2017: 'A real giant storm from September 2017.' };
const RANK_HINT = { cadet: 'Ages 7 to 9. No timer.', commander: 'Ages 10 to 12. Race a storm countdown.' };

const logo = () => el('div', { class: 'sc-logo', 'aria-hidden': 'true' },
  el('svg:svg', { viewBox: '0 0 24 24', width: 34, height: 34, fill: 'none', stroke: '#F9F2E5', 'stroke-width': 1.8, 'stroke-linecap': 'round', focusable: 'false' },
    el('svg:path', { d: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12l4-5' })));

export function render(model, { onLaunch } = {}) {
  const missionHint = el('p', { class: 'sc-ctl-hint' });
  const rankHint = el('p', { class: 'sc-ctl-hint' });
  const mode = () => (rank.get() ? 'commander' : 'cadet');
  const mission = createKnob({
    label: 'Mission', value: model.mission,
    options: [{ value: 'random', label: 'RANDOM WEEK' }, { value: 'sept2017', label: 'SEPT 2017' }],
    onChange: (v) => { missionHint.textContent = MISSION_HINT[v]; },
  });
  const rank = createToggle({
    label: 'Commander mode', on: model.mode === 'commander', onLabel: 'COMMANDER', offLabel: 'CADET',
    onChange: () => { rankHint.textContent = RANK_HINT[mode()]; },
  });
  const launch = createCoverButton({ label: 'LAUNCH', onPress: () => onLaunch?.({ mission: mission.get(), mode: mode() }) });
  const sound = createMuteSwitch();
  const banner = el('p', { class: 'sc-sample', role: 'status', hidden: true }, 'SAMPLE DATA · storms are placeholders until the real NASA data loads');

  const id = nextId('sc-title');
  const root = el('section', { class: 'sc-title', 'aria-labelledby': id },
    el('div', { class: 'sc-backdrop', 'data-slot': 'backdrop' }),
    el('div', { class: 'sc-title-bar' }, banner, el('div', { class: 'sc-sound' }, sound.el)),
    el('div', { class: 'sc-screen sc-title-card' },
      el('div', { class: 'sc-title-head' },
        logo(),
        el('h1', { id, class: 'sc-h', tabindex: -1 }, 'Outpost Dial'),
        el('p', { class: 'sc-tagline' }, 'Run a base on Mars for 10 sols.'),
        el('p', { class: 'sc-quiet' }, 'A sol is a Mars day. Real solar storms, recorded by NASA, are coming.')),
      el('div', { class: 'sc-controls' },
        el('div', { class: 'sc-ctl' }, mission.el, missionHint),
        el('div', { class: 'sc-ctl' }, rank.el, rankHint),
        el('div', { class: 'sc-ctl' }, launch.el, el('p', { class: 'sc-ctl-hint' }, 'Tap once to lift the cover, then press.')))),
    el('p', { class: 'sc-foot' }, 'Storm data: NASA DONKI (archived, real dates)'));

  function update(m) {
    mission.set(m.mission === 'sept2017' ? 'sept2017' : 'random');
    rank.set(m.mode === 'commander');
    missionHint.textContent = MISSION_HINT[mission.get()];
    rankHint.textContent = RANK_HINT[mode()];
    banner.hidden = m.sample !== true;
  }
  update(model);
  return { el: root, update };
}
