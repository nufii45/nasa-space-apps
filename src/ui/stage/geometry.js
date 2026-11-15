// Isometric outpost geometry, ported from docs/wireframes/source/Scene.dc.html.
// World units: the ground plate is 20 x 14, z is up. P(x, y, z) is a 30° projection.
// A "view" (0..3) turns the world 90° per step around the plate centre before projecting, so
// the 4 views are 4 pre-drawn sides of the same model (decision 0010). Painter's order: flat
// things first, then objects sorted back to front by their turned footprint centre.
// Pure functions: no DOM, nothing from src/sim/.

export const SIZES = {
  desktop: { w: 860, h: 440, u: 16, ox: 386, oy: 60, sw: 1.4, pipe: [6.5, 4] },
  phone: { w: 390, h: 300, u: 10.4, ox: 186, oy: 26, sw: 1.1, pipe: [4.5, 2.6] },
};
export const STATIONS = ['solar', 'rover', 'recycler', 'pump', 'lab', 'shelter'];

export const INK = '#18213D';
const METAL = ['#FBF7EF', '#E6DCCB', '#D2C5AF'];
const GROUND = ['#EED7C0', '#DDBB9C', '#C99F7E'];
const FLOOR = ['#F7F1E6', '#E2D8C6', '#D0C4AE'];
const PANEL = ['#DCE4F0', '#B7C3D8', '#A3B1CA'];
const ROVER = ['#F4E8CF', '#E3D2AE', '#CDB98F'];
const POWER = '#E2B23F', WATER = '#6E9FD0';

// Hotspot anchors and where astronauts stand, in world units (from the board).
const AT = { recycler: [3, 2.6, 1.95], shelter: [5.6, 7, 3.77], lab: [9, 11.6, 2.35], pump: [7.8, 1.6, 2.75], solar: [13.95, 1.75, 0.99], rover: [15.4, 10.5, 1.5] };
const SPOT = { solar: [14.3, 5.5, 0], rover: [13.5, 11.8, 0], recycler: [3.0, 4.1, 0.25], pump: [6.8, 2.5, 0.25], lab: [8.6, 13.1, 0.25] };
const SHELTER_SLOTS = [[4.3, 10.0, 0.25], [5.3, 10.2, 0.25], [6.3, 10.1, 0.25]];
// Pipes and the job that makes them flow.
const PIPES = [
  { job: 'solar', pts: [[12.5, 4.6, 0.3], [11.4, 4.6, 0.3], [11.4, 13.0, 0.3], [2.6, 13.0, 0.3], [2.6, 12.4, 0.6]], color: POWER, dot: '#FFF3C4', dur: 5 },
  { job: 'recycler', pts: [[4.0, 2.6, 0.6], [6.3, 2.6, 0.6]], color: WATER, dot: '#E3F0FF', dur: 2.5 },
  { job: 'pump', pts: [[7.8, 2.75, 0.5], [7.8, 3.4, 0.5], [5.6, 3.4, 0.5], [5.6, 4.3, 0.5]], color: WATER, dot: '#E3F0FF', dur: 3 },
];

const r1 = (n) => Math.round(n * 10) / 10;
function turn(dx, dy, view) {
  for (let i = 0; i < view; i++) [dx, dy] = [-dy, dx];
  return [dx, dy];
}
const turnPt = (x, y, view) => { const [a, b] = turn(x - 10, y - 7, view); return [10 + a, 7 + b]; };
const poly = (a) => 'M' + a.map((q) => q[0] + ',' + q[1]).join(' L') + ' Z';
const line = (a) => 'M' + a.map((q) => q[0] + ',' + q[1]).join(' L');
const ell = (c, rx, ry) => 'M' + r1(c[0] - rx) + ',' + c[1] + ' a' + r1(rx) + ',' + r1(ry) + ' 0 1 0 ' + r1(2 * rx) + ',0 a' + r1(rx) + ',' + r1(ry) + ' 0 1 0 ' + r1(-2 * rx) + ',0 Z';

// Projector for one layout and view: world (x, y, z) -> stage px.
export function projector(layout, view) {
  const size = SIZES[layout] ?? SIZES.desktop;
  const flat = (a, b, z = 0) => [r1(size.ox + (a - b) * 0.866 * size.u), r1(size.oy + (a + b) * 0.5 * size.u - z * size.u)];
  return { size, flat, P: (x, y, z) => flat(...turnPt(x, y, view), z) };
}

// Hotspot centres in stage px: { solar: [x, y], ... }
export function hotspotPoints(layout, view) {
  const { P } = projector(layout, view);
  return Object.fromEntries(STATIONS.map((id) => [id, P(...AT[id])]));
}

// The whole scene for one layout and view.
// opts: { storm, running: Set of station ids with someone working,
//         people: [{ station, n (index at that station), color, dashed, picked }] }
// -> { w, h, shapes: [{ d, fill, stroke, sw, dash, op }], flows: [{ d, color, dur, begin }], feet: [[x, y]] }
export function scene(layout, view, { storm = false, running = new Set(), people = [] } = {}) {
  const { size, flat, P } = projector(layout, view);
  const U = size.u;
  const groups = [];
  let cur;
  const group = (depth) => { cur = { depth, shapes: [] }; groups.push(cur); };
  const depthOf = (x, y) => { const [a, b] = turnPt(x, y, view); return a + b; };
  const add = (d, fill, o) => cur.shapes.push({ d, fill: fill || 'none', stroke: INK, sw: size.sw, dash: '', op: 1, ...o });
  // A face detail (window, wheel) on a box side with world normal [nx, ny]: drawn only when
  // that side faces the viewer (+x or +y after turning).
  const facing = (nx, ny) => { const [a, b] = turn(nx, ny, view); return a + b > 0.5; };

  // Axis-aligned box: turn its footprint, then draw the three visible faces (light top, mid left, dark right).
  const box = (x, y, z, w, d, h, c) => {
    const [ax, ay] = turnPt(x, y, view), [bx, by] = turnPt(x + w, y + d, view);
    const X = Math.min(ax, bx), Y = Math.min(ay, by), W = Math.abs(bx - ax), D = Math.abs(by - ay);
    add(poly([flat(X + W, Y, z), flat(X + W, Y + D, z), flat(X + W, Y + D, z + h), flat(X + W, Y, z + h)]), c[2]);
    add(poly([flat(X, Y + D, z), flat(X + W, Y + D, z), flat(X + W, Y + D, z + h), flat(X, Y + D, z + h)]), c[1]);
    add(poly([flat(X, Y, z + h), flat(X + W, Y, z + h), flat(X + W, Y + D, z + h), flat(X, Y + D, z + h)]), c[0]);
  };
  const K = 1.2247, Q = 0.7071;
  const side = (x, y, z, r, h, fill, o) => {
    const B = P(x, y, z), T = P(x, y, z + h), rx = r1(r * U * K), ry = r1(r * U * Q);
    add('M' + r1(B[0] - rx) + ',' + T[1] + ' L' + r1(B[0] - rx) + ',' + B[1] + ' A' + rx + ',' + ry + ' 0 0 0 ' + r1(B[0] + rx) + ',' + B[1] + ' L' + r1(B[0] + rx) + ',' + T[1] + ' Z', fill, o);
  };
  const top = (x, y, z, r, fill, o) => add(ell(P(x, y, z), r * U * K, r * U * Q), fill, o);
  const band = (x, y, z0, z1, r, fill, o) => {
    const A = P(x, y, z1), B = P(x, y, z0), rx = r1(r * U * K), ry = r1(r * U * Q);
    add('M' + r1(A[0] - rx) + ',' + A[1] + ' A' + rx + ',' + ry + ' 0 0 0 ' + r1(A[0] + rx) + ',' + A[1] + ' L' + r1(B[0] + rx) + ',' + B[1] + ' A' + rx + ',' + ry + ' 0 0 1 ' + r1(B[0] - rx) + ',' + B[1] + ' Z', fill, o);
  };
  const dome = (x, y, z, r, fill) => {
    const B = P(x, y, z), rx = r1(r * U * K), ry = r1(r * U * Q), Hh = r * U * 1.05;
    add('M' + r1(B[0] - rx) + ',' + B[1] + ' C' + r1(B[0] - rx) + ',' + r1(B[1] - Hh * 1.33) + ' ' + r1(B[0] + rx) + ',' + r1(B[1] - Hh * 1.33) + ' ' + r1(B[0] + rx) + ',' + B[1] + ' A' + rx + ',' + ry + ' 0 0 1 ' + r1(B[0] - rx) + ',' + B[1] + ' Z', fill);
    add('M' + B[0] + ',' + r1(B[1] + ry) + ' Q' + r1(B[0] - rx * 0.1) + ',' + r1(B[1] - Hh * 0.6) + ' ' + B[0] + ',' + r1(B[1] - Hh), 'none', { stroke: '#8B93AA', sw: 1 });
    add('M' + r1(B[0] - rx * 0.6) + ',' + r1(B[1] + ry * 0.8) + ' Q' + r1(B[0] - rx * 0.62) + ',' + r1(B[1] - Hh * 0.5) + ' ' + B[0] + ',' + r1(B[1] - Hh), 'none', { stroke: '#8B93AA', sw: 1 });
    add('M' + r1(B[0] - rx * 0.88) + ',' + r1(B[1] - Hh * 0.45) + ' A' + r1(rx * 0.88) + ',' + r1(ry * 0.88) + ' 0 0 0 ' + r1(B[0] + rx * 0.88) + ',' + r1(B[1] - Hh * 0.45), 'none', { stroke: '#8B93AA', sw: 1 });
    add(ell([r1(B[0] - rx * 0.42), r1(B[1] - Hh * 0.68)], U * 0.45, U * 0.26), '#FFFFFF', { stroke: 'none', op: 0.8 });
  };
  // A flat quad on the y = yf side of a box, from x0 to x1 and z0 to z1.
  const face = (yf, ny, x0, x1, z0, z1, fill) => facing(0, ny) && add(poly([P(x0, yf, z0), P(x1, yf, z0), P(x1, yf, z1), P(x0, yf, z1)]), fill, { sw: 1 });

  // Flat layer: ground, craters, storm tint, rover track, floors, pipes.
  group(-Infinity);
  box(0, 0, -0.8, 20, 14, 0.8, GROUND);
  top(17.6, 8.2, 0, 0.9, '#E3C4A6', { sw: 1 });
  top(13.0, 12.4, 0, 0.55, '#E3C4A6', { sw: 1 });
  top(18.6, 12.2, 0, 0.4, '#E3C4A6', { sw: 1 });
  if (storm) add(poly([P(11.4, 0.2, 0.01), P(19.8, 0.2, 0.01), P(19.8, 13.8, 0.01), P(11.4, 13.8, 0.01)]), '#C0652D', { op: 0.25, stroke: 'none' });
  add(line([P(12.4, 7.0, 0), P(13.2, 8.4, 0), P(14.3, 9.5, 0)]), 'none', { stroke: '#B98966', sw: 2, dash: '2 6' });
  box(0.6, 0.6, 0, 10.4, 12.8, 0.25, FLOOR);
  box(11.0, 6.2, 0, 1.3, 1.6, 0.25, FLOOR);
  const flows = [];
  for (const pipe of PIPES) {
    const d = line(pipe.pts.map((q) => P(...q)));
    add(d, 'none', { sw: size.pipe[0] });
    add(d, 'none', { stroke: pipe.color, sw: size.pipe[1] });
    if (running.has(pipe.job)) for (let i = 0; i < 2; i++) flows.push({ d, color: pipe.dot, dur: pipe.dur + 's', begin: (i * pipe.dur) / 2 + 's' });
  }

  // Recycler
  group(depthOf(3, 2.6));
  box(2, 1.6, 0.25, 2, 2, 1.4, METAL);
  top(3, 2.6, 1.65, 0.55, '#CFE0F2', { sw: 1 });
  // Pump
  group(depthOf(6.7, 1.4));
  box(6.3, 1.0, 0.25, 0.8, 0.8, 0.9, METAL);
  // Water tank with its water level
  group(depthOf(7.8, 1.6));
  side(7.8, 1.6, 0.25, 1.1, 2.2, '#F3F6FA');
  band(7.8, 1.6, 0.25, 0.25 + 2.2 * 0.25, 1.1, WATER, { op: 0.75, stroke: 'none' });
  top(7.8, 1.6, 2.45, 1.1, '#E6EEF7');
  // Shelter: water-wall ring and dome
  group(depthOf(5.6, 7));
  side(5.6, 7, 0.25, 2.7, 0.8, storm ? '#A8C6E6' : '#EEF3F8');
  top(5.6, 7, 1.05, 2.7, storm ? '#C7DAEE' : '#F6F8FB');
  dome(5.6, 7, 1.05, 2.3, '#FDFBF6');
  // Battery with charge cells on both long sides
  group(depthOf(2.6, 11.6));
  box(1.8, 10.8, 0.25, 1.6, 1.6, 1.0, METAL);
  for (const [yf, ny] of [[12.4, 1], [10.8, -1]]) {
    for (let i = 0; i < 3; i++) { const x0 = 2.0 + i * 0.42; face(yf, ny, x0, x0 + 0.3, 0.45, 0.95, i < 2 ? POWER : '#FFFFFF'); }
  }
  // Four solar panels
  for (const [x, y] of [[12.6, 0.8], [15.8, 0.8], [12.6, 3.2], [15.8, 3.2]]) {
    const z = 0.69;
    group(depthOf(x + 1.35, y + 0.95));
    box(x + 1.2, y + 0.8, 0, 0.25, 0.25, 0.55, METAL);
    box(x, y, 0.55, 2.7, 1.9, 0.14, PANEL);
    add(line([P(x + 0.9, y, z), P(x + 0.9, y + 1.9, z)]), 'none', { stroke: '#7F8DAA', sw: 1 });
    add(line([P(x + 1.8, y, z), P(x + 1.8, y + 1.9, z)]), 'none', { stroke: '#7F8DAA', sw: 1 });
    add(line([P(x, y + 0.95, z), P(x + 2.7, y + 0.95, z)]), 'none', { stroke: '#7F8DAA', sw: 1 });
  }
  // Lab with windows on both long sides and a dish on the roof
  group(depthOf(9, 11.6));
  box(7.8, 10.6, 0.25, 2.4, 2, 1.8, METAL);
  for (const [yf, ny] of [[12.6, 1], [10.6, -1]]) {
    face(yf, ny, 8.2, 8.9, 0.8, 1.6, '#CFE0F2');
    face(yf, ny, 9.2, 9.9, 0.8, 1.6, '#CFE0F2');
  }
  side(9.4, 11.2, 2.05, 0.12, 0.5, METAL[1]);
  top(9.4, 11.2, 2.6, 0.5, '#FBF7EF');
  // Rover with wheels on both sides and a camera mast
  group(depthOf(15.4, 10.5));
  box(14, 9.6, 0.4, 2.8, 1.8, 0.8, ROVER);
  for (const [yf, ny] of [[11.4, 1], [9.6, -1]]) {
    if (!facing(0, ny)) continue;
    for (const wx of [14.6, 16.2]) { const c = P(wx, yf, 0.4); add(ell(c, U * 0.42, U * 0.42), INK); add(ell(c, U * 0.16, U * 0.16), '#D2C5AF', { stroke: 'none' }); }
  }
  box(16.2, 10.0, 1.2, 0.22, 0.22, 0.9, METAL);
  box(16.0, 9.85, 2.1, 0.6, 0.5, 0.32, METAL);

  // Astronauts
  const s = U / 16;
  const feet = people.map((p) => {
    const at = p.station === 'shelter' ? SHELTER_SLOTS[p.n % 3].map((v, i) => (i === 1 ? v + Math.floor(p.n / 3) * 0.9 : v)) : SPOT[p.station].map((v, i) => (i === 0 ? v + p.n * 0.9 : v));
    group(depthOf(at[0], at[1]));
    const B = P(...at);
    if (p.picked) add(ell(B, 13 * s, 6 * s), 'none', { stroke: '#1AA3A1', sw: 2.5, dash: '4 3' });
    add(ell(B, 7 * s, 3 * s), INK, { stroke: 'none', op: 0.2 });
    add('M' + r1(B[0] - 5 * s) + ',' + B[1] + ' L' + r1(B[0] - 5 * s) + ',' + r1(B[1] - 10 * s) + ' Q' + r1(B[0] - 5 * s) + ',' + r1(B[1] - 15 * s) + ' ' + B[0] + ',' + r1(B[1] - 15 * s) + ' Q' + r1(B[0] + 5 * s) + ',' + r1(B[1] - 15 * s) + ' ' + r1(B[0] + 5 * s) + ',' + r1(B[1] - 10 * s) + ' L' + r1(B[0] + 5 * s) + ',' + B[1] + ' Z', '#FDFBF6', { dash: p.dashed ? '2 2' : '' });
    add(ell([B[0], r1(B[1] - 19 * s)], 6 * s, 6 * s), p.color, { op: p.dashed ? 0.55 : 1 });
    add(ell([r1(B[0] + 1.5 * s), r1(B[1] - 19.5 * s)], 3.4 * s, 2.4 * s), INK, { stroke: 'none' });
    return B;
  });

  groups.sort((a, b) => a.depth - b.depth); // stable: equal depths keep source order
  return { w: size.w, h: size.h, shapes: groups.flatMap((g) => g.shapes), flows, feet };
}
