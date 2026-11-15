// Mission report (W3): one of three endings. A pure view (decision 0009):
// render({ ending: 'win'|'home'|'time', stars, reason, science, scienceGoal?, sky: { start, end },
//          storms: [{ label, date }], tip, sept2017 }, { onTryAgain, onChangeMission, onTitle })
import { el, nextId } from '../console/util.js';

const NAVY = '#18213D';
const STAR = 'l7 15 16 2 -12 11 3 16 -14 -8 -14 8 3 -16 -12 -11 16 -2z';
const line = { stroke: NAVY, 'stroke-width': 3, 'stroke-linejoin': 'round' };

// Each ending has its own colour, headline words and picture, so colour is never the only signal.
const ENDINGS = {
  win: {
    headline: 'Mission complete!', tone: '#1AA3A1',
    art: (stars) => [
      ['path', { d: 'M190 195 V120 M190 120 L230 132 L190 144', fill: '#1AA3A1', ...line }],
      ...[[95, 95], [150, 70], [205, 95]].map(([x, y], i) => ['path', { d: `M${x} ${y} ${STAR}`, fill: i < stars ? '#F2C14E' : '#F9F2E5', ...line, 'stroke-width': 2.5 }]),
    ],
  },
  home: {
    headline: 'The crew had to go home', tone: '#C0652D',
    art: () => [
      ['path', { d: 'M205 60 C225 80 228 110 220 135 L190 135 C182 110 185 80 205 60 Z', fill: '#FDFBF6', ...line }],
      ['path', { d: 'M192 135 L205 165 L218 135', fill: '#C0652D', ...line }],
      ['circle', { cx: 205, cy: 98, r: 9, fill: '#C0652D', ...line }],
      ['path', { d: 'M120 120 C110 100 120 85 130 85 C140 85 150 100 140 120 C150 125 150 135 140 140 L120 140 C110 135 110 125 120 120 Z', fill: '#E3EEF9', ...line, 'stroke-width': 2.5 }],
    ],
  },
  time: {
    headline: "Time's up: the supply ship is here", tone: NAVY,
    art: () => [
      ['path', { d: 'M150 50 L185 95 L170 95 L170 140 L130 140 L130 95 L115 95 Z', fill: '#FDFBF6', ...line }],
      ['path', { d: 'M130 140 L120 160 M170 140 L180 160', ...line, 'stroke-linecap': 'round' }],
      ['circle', { cx: 150, cy: 110, r: 10, fill: NAVY }],
    ],
  },
};

function picture(ending, stars) {
  return el('svg:svg', { class: 'sc-art', viewBox: '0 0 300 300', 'aria-hidden': 'true', focusable: 'false' },
    el('svg:circle', { cx: 150, cy: 150, r: 130, fill: '#F9F2E5', stroke: ending.tone, 'stroke-width': 6 }),
    el('svg:path', { d: 'M60 205 L150 160 L240 205 L150 250 Z', fill: '#EED7C0', ...line }),
    el('svg:path', { d: 'M110 200 C110 160 170 160 170 200 Z', fill: '#FDFBF6', ...line }),
    ending.art(stars).map(([tag, attrs]) => el(`svg:${tag}`, attrs)));
}

const SEPT_2017 = 'In September 2017 a big solar storm hit Mars. Curiosity, NASA\'s robot car on Mars, measured more than twice as much radiation as ever before. MAVEN, a NASA spacecraft that flies around Mars, saw the whole sky glow with aurora (colourful lights, like the northern lights on Earth). ';
const SEPT_2017_URL = 'https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/';

export function render(model, { onTryAgain, onChangeMission, onTitle } = {}) {
  const id = nextId('sc-report');
  const root = el('section', { class: 'sc-screen sc-report', 'aria-labelledby': id });
  const btn = (text, fn, cls) => el('button', { type: 'button', class: `sc-btn ${cls}`, onclick: () => fn?.() }, text);

  function update(m) {
    const key = ENDINGS[m.ending] ? m.ending : 'time';
    const ending = ENDINGS[key];
    const stars = Math.max(0, Math.min(3, m.stars ?? 0));
    const storms = m.storms ?? [];
    root.className = `sc-screen sc-report sc-${key}`;
    root.replaceChildren(
      picture(ending, stars),
      el('div', { class: 'sc-main' },
        el('div', { class: 'sc-titles' },
          el('p', { class: 'sc-h sc-kicker' }, 'Mission report'),
          el('h2', { id, class: 'sc-h sc-headline', tabindex: -1 }, ending.headline),
          key === 'win' ? el('p', { class: 'sc-stars', role: 'img', 'aria-label': `${stars} of 3 stars` }, '★'.repeat(stars) + '☆'.repeat(3 - stars)) : null,
          el('p', { class: 'sc-reason' }, m.reason)),
        el('div', { class: 'sc-receipt', role: 'group', 'aria-label': 'Mission receipt' },
          el('p', {}, `Science: ${m.science}/${m.scienceGoal ?? 100}`),
          m.sky ? el('p', {}, `Your sky: ${m.sky.start} to ${m.sky.end}`) : null,
          storms.length
            ? [el('p', {}, `${storms.length} storm${storms.length > 1 ? 's' : ''} reached the base:`),
              el('ul', {}, storms.map((s) => el('li', {}, `${s.label} · ${s.date}`)))]
            : el('p', {}, 'The Sun was quiet that week.'),
          m.tip ? el('p', {}, `Tip: ${String(m.tip).replace(/^tip:\s*/i, '')}`) : null),
        m.sept2017
          ? el('div', { class: 'sc-story' },
            el('h3', { class: 'sc-h' }, 'What really happened in Sept 2017'),
            el('p', {}, SEPT_2017, el('a', { href: SEPT_2017_URL, target: '_blank', rel: 'noopener' }, 'Read the NASA story')))
          : null,
        el('div', { class: 'sc-actions' },
          btn('Try again', onTryAgain, 'sc-pri'),
          btn('Change mission', onChangeMission, 'sc-sec'),
          btn('Title', onTitle, 'sc-sec'))),
    );
  }
  update(model);
  return { el: root, update };
}
