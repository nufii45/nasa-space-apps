import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing,
  staticFile, delayRender, continueRender,
} from 'remotion';

// ---------- tokens (from the wireframes) ----------
const C = {
  paper: '#F6EDDD', grid: '#EDE2CE', card: '#F9F2E5', border: '#CEC0AD', ink: '#18213D', ink2: '#3B4460',
  teal: '#1AA3A1', tealText: '#0E5F5E', orange: '#C0652D', power: '#E2B23F', water: '#6E9FD0',
};
const HEAD = "'Barlow Semi Condensed', sans-serif";
const BODY = "'Barlow', sans-serif";
const MONO = "'JetBrains Mono', monospace";
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

// ---------- fonts ----------
const FONTS = [
  ['Barlow', '400', 'Barlow-400.woff2'], ['Barlow', '600', 'Barlow-600.woff2'],
  ['Barlow Semi Condensed', '700', 'BarlowSemiCondensed-700.woff2'],
  ['JetBrains Mono', '500', 'JetBrainsMono-500.woff2'], ['JetBrains Mono', '700', 'JetBrainsMono-700.woff2'],
];
const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    Promise.all(FONTS.map(([f, w, file]) => new FontFace(f, `url(${staticFile('fonts/' + file)})`, { weight: w }).load()
      .then((ff) => document.fonts.add(ff)))).then(() => continueRender(handle)).catch(() => continueRender(handle));
  }, [handle]);
};

// ---------- isometric geometry (ported from Scene.dc.html) ----------
const U = 34, OX = 872, OY = 300;
const r1 = (n) => Math.round(n * 10) / 10;
const P = (x, y, z = 0) => [r1(OX + (x - y) * 0.866 * U), r1(OY + (x + y) * 0.5 * U - z * U)];
const poly = (a) => 'M' + a.map((q) => q[0] + ',' + q[1]).join(' L') + ' Z';
const line = (a) => 'M' + a.map((q) => q[0] + ',' + q[1]).join(' L');
const ell = (c, rx, ry) => `M${r1(c[0] - rx)},${c[1]} a${r1(rx)},${r1(ry)} 0 1 0 ${r1(2 * rx)},0 a${r1(rx)},${r1(ry)} 0 1 0 ${r1(-2 * rx)},0 Z`;
const K = 1.2247, Q = 0.7071;
const METAL = ['#FBF7EF', '#E6DCCB', '#D2C5AF'];

const boxPaths = (x, y, z, w, d, h, c) => [
  [poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)]), c[2]],
  [poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)]), c[1]],
  [poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)]), c[0]],
];
const sidePath = (x, y, z, r, h) => {
  const B = P(x, y, z), T = P(x, y, z + h), rx = r1(r * U * K), ry = r1(r * U * Q);
  return `M${r1(B[0] - rx)},${T[1]} L${r1(B[0] - rx)},${B[1]} A${rx},${ry} 0 0 0 ${r1(B[0] + rx)},${B[1]} L${r1(B[0] + rx)},${T[1]} Z`;
};
const topPath = (x, y, z, r) => ell(P(x, y, z), r * U * K, r * U * Q);
const bandPath = (x, y, z0, z1, r) => {
  const A = P(x, y, z1), B = P(x, y, z0), rx = r1(r * U * K), ry = r1(r * U * Q);
  return `M${r1(A[0] - rx)},${A[1]} A${rx},${ry} 0 0 0 ${r1(A[0] + rx)},${A[1]} L${r1(B[0] + rx)},${B[1]} A${rx},${ry} 0 0 1 ${r1(B[0] - rx)},${B[1]} Z`;
};
const domePath = (x, y, z, r) => {
  const B = P(x, y, z), rx = r1(r * U * K), ry = r1(r * U * Q), H = r * U * 1.05;
  return `M${r1(B[0] - rx)},${B[1]} C${r1(B[0] - rx)},${r1(B[1] - H * 1.33)} ${r1(B[0] + rx)},${r1(B[1] - H * 1.33)} ${r1(B[0] + rx)},${B[1]} A${rx},${ry} 0 0 1 ${r1(B[0] - rx)},${B[1]} Z`;
};

// Pieces of the outpost, each drops in on its own beat.
const Piece = ({ delay, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 120 } });
  return <g style={{ opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * -60}px)` }}>{children}</g>;
};
const Paths = ({ list, sw = 2 }) => list.map(([d, fill], i) => <path key={i} d={d} fill={fill} stroke={C.ink} strokeWidth={sw} strokeLinejoin="round" />);

const PIPES = [
  { pts: [P(12.5, 4.6, 0.3), P(11.4, 4.6, 0.3), P(11.4, 13.0, 0.3), P(2.6, 13.0, 0.3), P(2.6, 12.4, 0.6)], color: C.power },
  { pts: [P(4.0, 2.6, 0.6), P(6.3, 2.6, 0.6)], color: C.water },
  { pts: [P(7.8, 2.75, 0.5), P(7.8, 3.4, 0.5), P(5.6, 3.4, 0.5), P(5.6, 4.3, 0.5)], color: C.water },
];
const pointAlong = (pts, t) => {
  const segs = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
  let d = (t % 1) * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i]) { const k = d / segs[i]; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; }
    d -= segs[i];
  }
  return pts[pts.length - 1];
};

export const STATIONS = {
  solar: { at: [13.95, 1.75, 0.99], title: 'Solar Field', text: 'Makes power from sunlight.' },
  pump: { at: [7.8, 1.6, 2.75], title: 'Water Wall pump', text: 'Moves water into the walls to block storms.' },
  shelter: { at: [5.6, 7, 3.77], title: 'Shelter', text: 'Safest place in a storm.' },
  lab: { at: [9, 11.6, 2.35], title: 'Lab', text: 'Do experiments to earn science.' },
  rover: { at: [15.4, 10.5, 1.5], title: 'Rover trip', text: 'Lots of science, far from home.' },
  recycler: { at: [3, 2.6, 1.95], title: 'Recycler', text: 'Cleans water to drink again.' },
};

const Astronaut = ({ pos, color, label, warn }) => {
  const B = P(...pos), s = U / 16;
  return (
    <g>
      <path d={ell(B, 7 * s, 3 * s)} fill={C.ink} opacity={0.2} />
      <path d={`M${B[0] - 5 * s},${B[1]} L${B[0] - 5 * s},${B[1] - 10 * s} Q${B[0] - 5 * s},${B[1] - 15 * s} ${B[0]},${B[1] - 15 * s} Q${B[0] + 5 * s},${B[1] - 15 * s} ${B[0] + 5 * s},${B[1] - 10 * s} L${B[0] + 5 * s},${B[1]} Z`} fill="#FDFBF6" stroke={C.ink} strokeWidth={2} />
      <path d={ell([B[0], B[1] - 19 * s], 6 * s, 6 * s)} fill={color} stroke={C.ink} strokeWidth={2} />
      <path d={ell([B[0] + 1.5 * s, B[1] - 19.5 * s], 3.4 * s, 2.4 * s)} fill={C.ink} />
      {label && (
        <g>
          <rect x={B[0] - 34} y={B[1] + 6} width={68} height={24} rx={6} fill={warn ? C.orange : C.ink} />
          <text x={B[0]} y={B[1] + 23} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={14} fill="#F9F2E5">{label}</text>
        </g>
      )}
    </g>
  );
};

// The outpost scene. `build` = frame offset for the build-in; `crew` = [{pos,color,label,warn}].
const Outpost = ({ build = -1000, storm = 0, wall = 0, flows = false, crew = [], hotspots = 0, selected = null }) => {
  const frame = useCurrentFrame();
  const b = (i) => build + i * 6;
  const wallFill = `rgb(${Math.round(238 - wall * 70)},${Math.round(243 - wall * 45)},${Math.round(248 - wall * 20)})`;
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
      <Piece delay={b(0)}><Paths list={boxPaths(0, 0, -0.8, 20, 14, 0.8, ['#EED7C0', '#DDBB9C', '#C99F7E'])} />
        <path d={topPath(17.6, 8.2, 0, 0.9)} fill="#E3C4A6" stroke={C.ink} strokeWidth={1.4} />
        <path d={topPath(13, 12.4, 0, 0.55)} fill="#E3C4A6" stroke={C.ink} strokeWidth={1.4} />
        {storm > 0 && <path d={poly([P(11.4, 0.2, 0.01), P(19.8, 0.2, 0.01), P(19.8, 13.8, 0.01), P(11.4, 13.8, 0.01)])} fill={C.orange} opacity={0.3 * storm} />}
        <Paths list={boxPaths(0.6, 0.6, 0, 10.4, 12.8, 0.25, ['#F7F1E6', '#E2D8C6', '#D0C4AE'])} />
        <Paths list={boxPaths(11, 6.2, 0, 1.3, 1.6, 0.25, ['#F7F1E6', '#E2D8C6', '#D0C4AE'])} />
      </Piece>
      <Piece delay={b(2)}>
        {PIPES.map((p, i) => <g key={i}><path d={line(p.pts)} fill="none" stroke={C.ink} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" /><path d={line(p.pts)} fill="none" stroke={p.color} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" /></g>)}
        {flows && PIPES.map((p, i) => [0, 0.5].map((o) => { const q = pointAlong(p.pts, frame / (i === 0 ? 120 : 70) + o); return <circle key={i + '-' + o} cx={q[0]} cy={q[1]} r={5} fill="#FFFFFF" stroke={C.ink} strokeWidth={1.5} />; }))}
      </Piece>
      <Piece delay={b(3)}><Paths list={boxPaths(2, 1.6, 0.25, 2, 2, 1.4, METAL)} /><path d={topPath(3, 2.6, 1.65, 0.55)} fill="#CFE0F2" stroke={C.ink} strokeWidth={1.4} /></Piece>
      <Piece delay={b(4)}>
        <Paths list={boxPaths(6.3, 1.0, 0.25, 0.8, 0.8, 0.9, METAL)} />
        <path d={sidePath(7.8, 1.6, 0.25, 1.1, 2.2)} fill="#F3F6FA" stroke={C.ink} strokeWidth={2} />
        <path d={bandPath(7.8, 1.6, 0.25, 0.25 + 2.2 * (0.7 - wall * 0.4), 1.1)} fill={C.water} opacity={0.8} />
        <path d={topPath(7.8, 1.6, 2.45, 1.1)} fill="#E6EEF7" stroke={C.ink} strokeWidth={2} />
      </Piece>
      <Piece delay={b(5)}>
        <path d={sidePath(5.6, 7, 0.25, 2.7, 0.8)} fill={wallFill} stroke={C.ink} strokeWidth={2} />
        <path d={topPath(5.6, 7, 1.05, 2.7)} fill={wallFill} stroke={C.ink} strokeWidth={2} />
        <path d={domePath(5.6, 7, 1.05, 2.3)} fill="#FDFBF6" stroke={C.ink} strokeWidth={2} />
        <path d={ell([P(5.6, 7, 1.05)[0] - 30, P(5.6, 7, 1.05)[1] - 55], 16, 9)} fill="#FFFFFF" opacity={0.9} />
      </Piece>
      <Piece delay={b(6)}>
        <Paths list={boxPaths(1.8, 10.8, 0.25, 1.6, 1.6, 1.0, METAL)} />
        {[0, 1, 2].map((i) => <path key={i} d={poly([P(2.0 + i * 0.42, 12.4, 0.45), P(2.3 + i * 0.42, 12.4, 0.45), P(2.3 + i * 0.42, 12.4, 0.95), P(2.0 + i * 0.42, 12.4, 0.95)])} fill={i < 2 ? C.power : '#FFFFFF'} stroke={C.ink} strokeWidth={1.4} />)}
      </Piece>
      {[[12.6, 0.8], [15.8, 0.8], [12.6, 3.2], [15.8, 3.2]].map(([x, y], i) => (
        <Piece key={i} delay={b(7 + i)}>
          <Paths list={boxPaths(x + 1.2, y + 0.8, 0, 0.25, 0.25, 0.55, METAL)} />
          <Paths list={boxPaths(x, y, 0.55, 2.7, 1.9, 0.14, ['#DCE4F0', '#B7C3D8', '#A3B1CA'])} />
          {[[x + 0.9, y, x + 0.9, y + 1.9], [x + 1.8, y, x + 1.8, y + 1.9], [x, y + 0.95, x + 2.7, y + 0.95]].map((l, k) => <path key={k} d={line([P(l[0], l[1], 0.69), P(l[2], l[3], 0.69)])} stroke="#7F8DAA" strokeWidth={1.4} />)}
        </Piece>
      ))}
      <Piece delay={b(11)}>
        <Paths list={boxPaths(7.8, 10.6, 0.25, 2.4, 2, 1.8, METAL)} />
        <path d={poly([P(8.2, 12.6, 0.8), P(8.9, 12.6, 0.8), P(8.9, 12.6, 1.6), P(8.2, 12.6, 1.6)])} fill="#CFE0F2" stroke={C.ink} strokeWidth={1.4} />
        <path d={poly([P(9.2, 12.6, 0.8), P(9.9, 12.6, 0.8), P(9.9, 12.6, 1.6), P(9.2, 12.6, 1.6)])} fill="#CFE0F2" stroke={C.ink} strokeWidth={1.4} />
        <path d={topPath(9.4, 11.2, 2.6, 0.5)} fill="#FBF7EF" stroke={C.ink} strokeWidth={2} />
      </Piece>
      <Piece delay={b(12)}>
        <Paths list={boxPaths(14, 9.6, 0.4, 2.8, 1.8, 0.8, ['#F4E8CF', '#E3D2AE', '#CDB98F'])} />
        {[14.6, 16.2].map((wx) => { const c = P(wx, 11.4, 0.4); return <g key={wx}><path d={ell(c, U * 0.42, U * 0.42)} fill={C.ink} /><path d={ell(c, U * 0.16, U * 0.16)} fill="#D2C5AF" /></g>; })}
        <Paths list={boxPaths(16.2, 10, 1.2, 0.22, 0.22, 0.9, METAL)} />
        <Paths list={boxPaths(16, 9.85, 2.1, 0.6, 0.5, 0.32, METAL)} />
      </Piece>
      {crew.map((c, i) => <Astronaut key={i} {...c} />)}
      {Object.entries(STATIONS).map(([id, s], i) => {
        const h = P(...s.at);
        const k = interpolate(hotspots - i * 4, [0, 10], [0, 1], clamp);
        if (k <= 0) return null;
        const pulse = 1 + 0.15 * Math.sin(frame / 6 + i);
        const out = storm > 0 && (id === 'solar' || id === 'rover');
        const fill = out ? C.orange : selected === id ? C.ink : C.teal;
        return (
          <g key={id} transform={`translate(${h[0]},${h[1]}) scale(${k * pulse})`}>
            <circle r={22} fill={fill} opacity={0.25} />
            <circle r={10} fill={fill} stroke="#F9F2E5" strokeWidth={4} />
            <circle r={13} fill="none" stroke={C.ink} strokeWidth={2} />
          </g>
        );
      })}
    </svg>
  );
};

// ---------- shared UI ----------
const Paper = ({ children }) => (
  <AbsoluteFill style={{ backgroundColor: C.paper, backgroundImage: `linear-gradient(${C.grid} 2px, transparent 2px), linear-gradient(90deg, ${C.grid} 2px, transparent 2px)`, backgroundSize: '48px 48px', fontFamily: BODY, color: C.ink }}>
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      <path d="M60 180 H180 L220 140 H520 M1500 60 H1640 L1690 110 V230 M80 960 H220 L260 1000 H460 M1460 1020 H1720 L1770 970" fill="none" stroke="#E0D2BB" strokeWidth={3} />
      {[[520, 140], [1690, 230], [460, 1000], [1770, 970]].map(([x, y]) => <circle key={x} cx={x} cy={y} r={6} fill="none" stroke="#E0D2BB" strokeWidth={3} />)}
    </svg>
    {children}
  </AbsoluteFill>
);
const Caption = ({ children, start = 0 }) => {
  const frame = useCurrentFrame();
  const k = interpolate(frame - start, [0, 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: 'absolute', left: 72, top: 64, maxWidth: 760, opacity: k, transform: `translateY(${(1 - k) * 20}px)` }}>
      {children}
    </div>
  );
};
const H = ({ size = 64, color = C.ink, children, style }) => <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: size, lineHeight: 1.02, letterSpacing: '0.04em', textTransform: 'uppercase', color, ...style }}>{children}</div>;
const Sub = ({ children, style }) => <div style={{ fontSize: 34, lineHeight: 1.3, color: C.ink2, marginTop: 14, ...style }}>{children}</div>;
const Tag = () => null;

const Callout = ({ id, x, y, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14 } });
  const st = STATIONS[id], h = P(...st.at);
  const w = 330, ax = h[0] > x + w ? x + w : x, ay = y + 40;
  return (
    <>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: s }}>
        <line x1={ax} y1={ay} x2={h[0]} y2={h[1]} stroke="#5A6178" strokeWidth={2.5} strokeDasharray="5 7" />
        <circle cx={ax} cy={ay} r={7} fill={C.card} stroke="#5A6178" strokeWidth={3} />
      </svg>
      <div style={{ position: 'absolute', left: x, top: y, width: w, padding: '16px 20px', background: C.card, border: `2px solid ${C.border}`, borderRadius: 16, boxShadow: '0 8px 22px rgba(24,33,61,.12)', opacity: s, transform: `translateY(${(1 - s) * 24}px)` }}>
        <H size={28}>{st.title}</H>
        <div style={{ fontSize: 24, lineHeight: 1.3, color: C.ink2, marginTop: 6 }}>{st.text}</div>
      </div>
    </>
  );
};

// ---------- scenes ----------
const TitleScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 13 } });
  const turn = interpolate(frame, [38, 52], [-45, 45], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const out = interpolate(frame, [78, 90], [1, 0], clamp);
  const sept = frame > 46;
  return (
    <Paper>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out }}>
        <div style={{ transform: `scale(${0.9 + pop * 0.1})`, opacity: pop, textAlign: 'center' }}>
          <H size={150} style={{ letterSpacing: '0.1em' }}>Outpost Dial</H>
          <Sub style={{ fontSize: 44 }}>Run a base on Mars for 10 sols.</Sub>
          <div style={{ display: 'flex', gap: 60, justifyContent: 'center', alignItems: 'center', marginTop: 56 }}>
            <div style={{ width: 150, height: 150, borderRadius: '50%', border: `4px solid ${C.ink}`, background: '#FFFDF8', boxShadow: '0 8px 0 #D8CBB6', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 69, top: 14, width: 12, height: 52, borderRadius: 6, background: C.ink, transformOrigin: '6px 61px', transform: `rotate(${turn}deg)` }} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 30, letterSpacing: '0.1em', color: sept ? '#9AA0B2' : C.ink }}>RANDOM WEEK</div>
              <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 30, letterSpacing: '0.1em', color: sept ? '#F9F2E5' : '#9AA0B2', background: sept ? C.ink : 'transparent', padding: '2px 10px', borderRadius: 8, marginTop: 8 }}>SEPT 2017 · A REAL GIANT STORM</div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Paper>
  );
};

const BuildScene = () => {
  const frame = useCurrentFrame();
  return (
    <Paper>
      <Outpost build={4} hotspots={frame - 95} />
      <Caption start={6}><H size={64}>Your Mars base</H><Sub>Every job costs power, water or safety.</Sub></Caption>
      <Callout id="pump" x={1390} y={170} delay={108} />
      <Callout id="solar" x={1440} y={420} delay={118} />
      <Callout id="shelter" x={200} y={420} delay={128} />
      <Callout id="rover" x={1390} y={720} delay={138} />
      <Tag />
    </Paper>
  );
};

const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const TRAY = { ana: [11.6, 16.5, 0], ben: [8.6, 18.5, 0], cai: [5.6, 20.5, 0] };
const SPOT = { solar: [14.3, 5.5, 0], lab: [8.6, 13.1, 0.25], shelter: [4.8, 10.1, 0.25] };

const PlanScene = () => {
  const frame = useCurrentFrame();
  const mv = (start) => interpolate(frame, [start, start + 22], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const crew = [
    { pos: lerp3(TRAY.ana, SPOT.solar, mv(20)), color: '#7C6BD6', label: 'ANA' },
    { pos: lerp3(TRAY.ben, SPOT.lab, mv(52)), color: '#3F86C9', label: 'BEN' },
    { pos: lerp3(TRAY.cai, SPOT.shelter, mv(84)), color: '#3E9B6A', label: 'CAI' },
  ];
  const power = Math.round(interpolate(frame, [110, 160], [6, 9], clamp));
  const sci = Math.round(interpolate(frame, [120, 170], [36, 42], clamp));
  const sel = frame < 50 ? 'solar' : frame < 82 ? 'lab' : 'shelter';
  return (
    <Paper>
      <Outpost flows={frame > 100} crew={crew} hotspots={100} selected={sel} />
      <Caption><H size={64}>Tap an astronaut, then a job</H><Sub>One astronaut per job. Everyone fits in the Shelter.</Sub></Caption>
      <div style={{ position: 'absolute', right: 72, top: 64, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[['POWER', power + '/10', C.power, power * 10], ['WATER', '6/10', C.water, 60], ['SCIENCE', sci + '/100', C.teal, sci]].map(([l, v, col, pct]) => (
          <div key={l} style={{ width: 340, padding: '12px 16px', background: '#FFFDF8', border: `2px solid ${C.border}`, borderRadius: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: HEAD, fontWeight: 700, fontSize: 24, letterSpacing: '0.08em' }}><span>{l}</span><span style={{ fontFamily: MONO }}>{v}</span></div>
            <div style={{ height: 12, borderRadius: 6, background: '#E6DCCB', marginTop: 8 }}><div style={{ width: pct + '%', height: '100%', borderRadius: 6, background: col }} /></div>
          </div>
        ))}
      </div>
      <Tag />
    </Paper>
  );
};

const StormScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flash = interpolate(frame, [0, 4, 16], [0, 0.85, 0], clamp);
  const take = interpolate(frame, [6, 18], [0, 1], clamp);
  const left = Math.max(0, 3 - Math.floor(Math.max(0, frame - 40) / 40));
  const press = spring({ frame: frame - 92, fps, config: { damping: 10 } });
  const walk = interpolate(frame, [96, 150], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const safe = frame > 150;
  const wall = interpolate(frame, [20, 70], [0, 1], clamp);
  const crew = [
    { pos: lerp3(SPOT.solar, [6.4, 10.3, 0.25], walk), color: '#7C6BD6', label: safe ? 'SAFE' : 'ANA', warn: !safe },
    { pos: SPOT.lab, color: '#3F86C9', label: 'BEN' },
    { pos: SPOT.shelter, color: '#3E9B6A', label: 'CAI' },
  ];
  const ring = (left / 3) * 2 * Math.PI * 70;
  return (
    <Paper>
      <Outpost storm={take} wall={wall} crew={crew} hotspots={100} />
      <AbsoluteFill style={{ background: C.orange, opacity: 0.18 * take }} />
      <div style={{ position: 'absolute', left: 72, top: 56, width: 840, padding: '28px 32px', background: C.card, border: `5px solid ${C.ink}`, borderRadius: 24, boxShadow: '0 20px 50px rgba(0,0,0,.25)', opacity: take, transform: `translateY(${(1 - take) * -30}px)` }}>
        <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <H size={26} color="#9A4A1C">Storm alert · real NASA record</H>
            <H size={58} style={{ marginTop: 6 }}>Sun storm! A big flash is coming.</H>
            <div style={{ fontSize: 26, color: C.ink2, marginTop: 10 }}>6 Sep 2017 · flare class <b style={{ fontFamily: MONO }}>X9.3</b> (X is the biggest)</div>
          </div>
          <div style={{ position: 'relative', width: 170, height: 170, flex: 'none' }}>
            <svg width={170} height={170} viewBox="0 0 170 170" style={{ position: 'absolute', inset: 0 }}>
              <circle cx={85} cy={85} r={70} fill="#FFFDF8" stroke="#EAD9C6" strokeWidth={14} />
              <circle cx={85} cy={85} r={70} fill="none" stroke={left <= 1 ? C.orange : C.ink} strokeWidth={14} strokeLinecap="round" strokeDasharray={`${ring} 999`} transform="rotate(-90 85 85)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 64, lineHeight: 1 }}>{safe ? '✓' : left}</div>
              <div style={{ fontSize: 20 }}>{safe ? 'all safe' : left === 1 ? 'second left' : 'seconds left'}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 20, padding: '14px 18px', border: `2px solid ${C.border}`, borderRadius: 16, background: '#FFFDF8' }}>
          <H size={32}>Ana</H>
          <div style={{ fontSize: 26, color: safe ? '#1F6B47' : walk > 0 ? '#8A4A12' : C.ink2, fontWeight: 600 }}>{safe ? 'Safe in the Shelter' : walk > 0 ? 'Walking back…' : 'Outside at the Solar Field'}</div>
          {!safe && walk === 0 && <div style={{ marginLeft: 'auto', padding: '14px 24px', borderRadius: 14, background: C.orange, color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 28, letterSpacing: '0.06em', boxShadow: `0 ${6 - press * 4}px 0 #7C3A14`, transform: `translateY(${press * 4}px)` }}>BRING ANA INSIDE</div>}
        </div>
      </div>
      <AbsoluteFill style={{ background: '#FFF6DA', opacity: flash }} />
      <Tag />
    </Paper>
  );
};

const ReportScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14 } });
  const lines = ['SCIENCE ......... 82/100', 'CREW ............ all safe', 'YOUR SKY ........ 4–13 Sep 2017', '                  recorded by NASA', 'STORMS THAT HIT:', '· Sun flash, class X9.3 · 6 Sep', '· Sun flash, class X8.2 · 10 Sep'];
  const shown = Math.floor(interpolate(frame, [18, 120], [0, lines.length], clamp));
  return (
    <Paper>
      <AbsoluteFill style={{ background: '#E4F3F1' }} />
      <div style={{ position: 'absolute', left: 140, top: 150, width: 760, opacity: pop, transform: `translateY(${(1 - pop) * 30}px)` }}>
        <H size={30} color={C.tealText}>Mission report</H>
        <H size={96} color={C.tealText} style={{ marginTop: 10 }}>Mission complete!</H>
        <div style={{ fontSize: 90, color: '#E0A82E', letterSpacing: 10, marginTop: 6 }}>★★<span style={{ color: '#C9C3B6' }}>★</span></div>
        <Sub>Space weather is real, and only partly predictable. Water, power and shelter kept the crew safe.</Sub>
      </div>
      <div style={{ position: 'absolute', right: 140, top: 190, width: 660, padding: '28px 32px', background: '#FFFDF8', border: `2px solid ${C.border}`, borderRadius: 6, boxShadow: '0 6px 0 #E6DCCB', fontFamily: MONO, fontSize: 28, lineHeight: 1.75, whiteSpace: 'pre', opacity: pop }}>
        {lines.slice(0, shown).join('\n')}{shown < lines.length && frame % 16 < 8 ? '▍' : ''}
      </div>
      <Tag />
    </Paper>
  );
};

const EndScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14 } });
  return (
    <Paper>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', opacity: pop }}>
        <H size={130} style={{ letterSpacing: '0.1em' }}>Outpost Dial</H>
        <Sub style={{ fontSize: 40 }}>A Junior Astronaut Mission Trainer · NASA Space Apps 2026</Sub>
        <div style={{ marginTop: 40, padding: '14px 26px', borderRadius: 14, background: C.ink, color: '#F9F2E5', fontFamily: MONO, fontSize: 32 }}>nasa-space-apps.bufiimman45.workers.dev</div>
        <div style={{ marginTop: 34, fontSize: 26, color: C.ink2 }}>Storm data: NASA DONKI (archived, real dates) · no account needed</div>
      </AbsoluteFill>
    </Paper>
  );
};

// Cross-fade wrapper so scene cuts are soft.
const Fade = ({ len, children }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 8, len - 8, len], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Video = () => {
  useFonts();
  const S = [[0, 90, TitleScene], [90, 180, BuildScene], [270, 180, PlanScene], [450, 210, StormScene], [660, 150, ReportScene], [810, 90, EndScene]];
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {S.map(([from, len, Comp], i) => (
        <Sequence key={i} from={from} durationInFrames={len}>
          {i === 0 || i === S.length - 1 ? <Comp /> : <Fade len={len}><Comp /></Fade>}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
