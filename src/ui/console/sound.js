// Tiny synthesized sound kit (Web Audio). No audio files to load, works offline.
// Every console component calls play('<name>'). Mute state is remembered per browser.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('outpost-muted') === '1'; } catch { /* storage blocked */ }

const listeners = new Set();
export const isMuted = () => muted;
export function setMuted(value) {
  muted = !!value;
  try { localStorage.setItem('outpost-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(muted));
}
export const onMuteChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq = 440, to = null, type = 'square', dur = 0.05, gain = 0.08, delay = 0 }) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.06, gain = 0.12, delay = 0, filter = 2000 }) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filter;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

const SOUNDS = {
  click: () => tone({ freq: 1800, dur: 0.02, type: 'square', gain: 0.05 }),
  clack: () => { noise({ dur: 0.04, gain: 0.15, filter: 3000 }); tone({ freq: 220, dur: 0.05, type: 'triangle', gain: 0.1 }); },
  thunk: () => { tone({ freq: 160, to: 60, dur: 0.15, type: 'sine', gain: 0.3 }); noise({ dur: 0.05, gain: 0.08, filter: 800 }); },
  cover: () => tone({ freq: 500, to: 900, dur: 0.08, type: 'triangle', gain: 0.06 }),
  beep: () => tone({ freq: 1200, dur: 0.03, type: 'sine', gain: 0.04 }),
  whirr: () => { for (let i = 0; i < 8; i++) noise({ dur: 0.05, gain: 0.05, filter: 1200, delay: i * 0.07 }); },
  alarm: () => { for (let i = 0; i < 3; i++) tone({ freq: 880, to: 440, dur: 0.25, type: 'sawtooth', gain: 0.06, delay: i * 0.3 }); },
  cheer: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.15, type: 'triangle', gain: 0.08, delay: i * 0.1 })),
};

export function play(name) {
  if (muted || !SOUNDS[name]) return;
  try { SOUNDS[name](); } catch { /* audio not available */ }
}
