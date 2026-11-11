// WORLD 2: the Drowned Court (turquoise glass, 18 m white arch, colonnades, six guardians, a drowned court under the keel). Stage D2 set.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { banks, lanternRoad, motes, proto, mirrored, scatter, register, beginWorld, camZones, blocked, sightLines, along, sidePt, onPath, headAt, riverCoords, sAtTime, bowlAnchor, slabTop, innerSpan, archTop, RECOLOR, UPV } from './common.js';
import { mulberry, s5, sst, TAU, col } from '../util.js';
import * as FX from '../fx/court.js';            // Stage E1: white marble, bowl fires, flowers, fish comet, drips, mosaic gold, river shaft, birds
export const id = 'ruins';
export const path = [[0, -20], [-2, 0], [3, 22], [-1, 42], [2, 62], [0, 82]];
export const look = {
  palette: { skyTop: '#2590be', skyMid: '#7fd4e8', skyHorizon: '#dff7f2', skyBottom: '#0e6f86', sun: '#fff6dc', cloud: '#ffffff', cloudShade: '#8cc8d6', wake: '#ffe0a0' },
  sunDir: [.35, .9, .25], sun: { size: .02, disc: 5, glow: .5 },                           // high sun above-left, 65 deg
  sky: { exp: .6, midH: .3, cumulus: .6, hazeK: 14 },
  fog: { color: '#8adbd6', density: .012, mist: .008, mistH: 2, banks: .4, scatter: .3, scatterC: '#eafff8' },
  mist: { count: 5, color: '#d8fbf4', opacity: .16, size: [40, 5], side: [10, 26] },
  shafts: { count: 6, color: '#fff6dc', k: .2, r: [1.4, 3], len: 34, side: [2.5, 9], every: 10, s0: 18 },
  water: { tint: '#19c2c2', deep: '#0e6f86', bed: '#7fe6da', mirror: .9, f0: .12, rough: .06, ripple: .006, swell: .006, glit: .5, colTh: 2.6, clarity: .6, caust: .5, caustC: '#bfefe4' },   // clear turquoise glass
  light: { key: '#fff6dc', keyI: 3.4, hemiSky: '#dffaf6', hemiGround: '#3fd0d0', hemiI: 1.0, rim: '#bff4ff', rimI: 70 },
  grade: { exposure: .7, con: 1.18, sat: [.65, 1.15], bloom: [.6, .85], lift: .014, tint: '#f6fffd', asleepTint: '#eaf2ff', asleepEv: .22, wakeT: [.2, 2.0] } };   // E1: the white arch must read white from the first frames of shot 6
let road, motesU;
export let bowls = [];          // the 6 guardians' empty bowls (world positions, arc length, side): [{ pos, s, side }] -> fire leaps in as she passes
export let ARCH = null;         // { s, pos, span, height } of the 18 m arch (shot 6)
const STONE = '#e9e5d8';
function leafMosaic() {         // one giant leaf of gold tesserae on pale stone (canvas texture, seeded)
  const N = 1024, cv = document.createElement('canvas'); cv.width = cv.height = N; const c = cv.getContext('2d'), r = mulberry(29);
  c.fillStyle = '#d9d4c2'; c.fillRect(0, 0, N, N);
  const inLeaf = (x, y) => { const u = (y / N - .06) / .88; if (u < 0 || u > 1) return 0; const w = .44 * Math.pow(Math.sin(Math.PI * Math.pow(u, .8)), .9); const dx = Math.abs(x / N - .5); return dx < w ? 1 : 0; };
  const T = 12;
  for (let y = 0; y < N; y += T) for (let x = 0; x < N; x += T) { const L = inLeaf(x + T / 2, y + T / 2), u = y / N, dx = Math.abs(x + T / 2 - N / 2) / N;
    const vein = L && (dx < .012 || Math.abs(dx - Math.abs(u - .1) * .55 % .14) < .012);
    const g = L ? (vein ? [236, 214, 160] : [[232, 183, 106], [214, 160, 84], [240, 200, 128], [196, 142, 70]][r() * 4 | 0]) : [[222, 217, 202], [210, 205, 190], [228, 224, 212]][r() * 3 | 0];
    c.fillStyle = `rgb(${g[0]},${g[1]},${g[2]})`; c.fillRect(x + 1, y + 1, T - 2, T - 2); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
export async function build(ctx) {
  const P = ctx.path, g = new THREE.Group(), r = mulberry(21), L = P.length; beginWorld('ruins');
  const Z = camZones(ctx, 'ruins', P), SL = sightLines(ctx, 'ruins', P), stone = new THREE.MeshStandardMaterial({ color: STONE, roughness: .92 });
  g.add(banks(P, { color: '#cfcab8', off: 16, every: 6, seed: 21, h: [.3, 1.0], w: [8, 14] }));
  // the colossal arch: floor slab sunk below the keel, legs scaled apart to a ~14 m clear span, 18 m above the water
  let ar = await proto('court_arch', { h: 21.5, standIn: [12, 21.5, 7], color: STONE });
  const sink = ar.standIn ? 0 : slabTop(ar) + 2.4, op = ar.standIn ? { span: 9, mid: 0 } : innerSpan(ar, sink + .2, sink + 6, true), span0 = op.span, sx = Math.min(1.6, Math.max(1, 8.2 / span0));   // ~8 m clear span: a wider arch would swallow shot 6's locked camera (13 m off the river)
  if (sx > 1.01) ar = await proto('court_arch', { h: 21.5, sx, standIn: [12, 21.5, 7], color: STONE });
  const sh6 = ctx.SHOTS.shots.find(x => x.world === 'ruins'), sA = sAtTime(ctx, 'ruins', sh6.t0 + (sh6.lockU ?? .5) * (sh6.t1 - sh6.t0)) + 4, hA = headAt(P, sA), pA = sidePt(P, sA, -op.mid * sx, -sink);
  const archG = scatter(ar, [{ p: pA, ry: hA }], { name: 'court_arch' }); g.add(archG);
  ARCH = { s: sA, pos: pA.clone(), span: +(span0 * sx).toFixed(2), height: +(ar.size.y - sink).toFixed(2), sx: +sx.toFixed(2), sink: +sink.toFixed(2) };
  // colonnade rows receding along both banks, half drowned
  const co = await proto('court_colonnade', { h: 10, standIn: [11.5, 10, 3.5], color: STONE }), CX = [];
  for (const [lat, step, off] of [[9.5, 13, 0], [17, 15, 6]]) for (const sd of [-1, 1]) for (let s = -30 + off; s < L + 40; s += step) {
    const ss = s + (r() - .5) * 2; if (Math.abs(ss - sA) < 8 && lat < 12) continue; const la = lat + r() * 1.5; if (blocked(Z, ss, sd * la, 2)) continue; const cp = sidePt(P, ss, sd * la); if (SL.hides(cp, 6)) continue;
    CX.push({ p: sidePt(P, ss, sd * la, -1.2 - r() * .8), ry: headAt(P, ss) + Math.PI / 2 * (sd > 0 ? -1 : 1) + (r() - .5) * .08, s: .85 + r() * .3 }); }
  const colsG = scatter(co, CX, { name: 'colonnades' }); g.add(colsG);
  // six 10 m guardians in three facing pairs after the arch, bowls at ~7 m, empty
  const st = await proto('court_statue', { h: 10.5, standIn: [4.3, 10.5, 4.6], color: STONE }), SX = []; bowls = [];
  const bw = bowlAnchor(st, .58, .72, true);
  for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) { const s = -19 + i * 7.5 + (sd > 0 ? 0 : 1.2), lat = 6.6,   /* E1: behind her in shot 7 (was sA + 8 + i * 6.5, never passed by the boat) */ ry = headAt(P, s) - sd * Math.PI / 2 + sd * .25;
    const x = { p: sidePt(P, s, sd * lat, -.6), ry, s: 1 }; SX.push(x); bowls.push({ pos: bw.clone().applyAxisAngle(UPV, ry).add(x.p), s, side: sd }); }
  const statG = scatter(st, SX, { name: 'statues' }); g.add(statG);
  // the court under the keel (clear water, bed at -3.5): gold leaf mosaic floor, two drowned staircases, fallen columns
  const sM = sAtTime(ctx, 'ruins', 16.5), mos = new THREE.Mesh(new THREE.PlaneGeometry(16, 30).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: leafMosaic(), roughness: .55 }));
  onPath(P, sM, mos.position); mos.position.y = -3.38; mos.rotation.y = headAt(P, sM) + Math.PI; mos.name = 'mosaic'; g.add(register(mos));
  const stairs = (s, sd, n = 10) => { const geo = []; for (let k = 0; k < n; k++) { const lat = 10 - k * .9, top = -.55 - k * .3, h = 3.5 + top; const b = new THREE.Mesh(new THREE.BoxGeometry(.9, h, 7.5), stone);
      sidePt(P, s, sd * lat, top - h / 2, b.position); b.rotation.y = headAt(P, s); b.name = 'stairs'; geo.push(b); } return geo; };
  const sunk = [...stairs(sA - 1, 1), ...stairs(sAtTime(ctx, 'ruins', 19) + 1, 1)];
  const colG = new THREE.CylinderGeometry(.62, .62, 1, 18).rotateZ(Math.PI / 2);
  for (let i = 0; i < 9; i++) { const s = sA - 6 + i * 4.2 + r() * 2, lat = (r() * 2 - 1) * 7, len = 3 + r() * 5, c = new THREE.Mesh(colG, stone);
    sidePt(P, s, lat, -3.5 + .55, c.position); c.scale.set(len, 1, 1); c.rotation.y = r() * TAU; sunk.push(c); }
  const sg = mergeGeometries(sunk.map(b => { b.updateMatrixWorld(true); return b.geometry.clone().applyMatrix4(b.matrixWorld); }), false); const sm = new THREE.Mesh(sg, stone); sm.name = 'drowned_court'; g.add(register(sm));
  road = await lanternRoad(ctx, P, { color: '#ffc66e', s0: 4, world: 'ruins' }); g.add(road.group);
  motesU = motes(P, { count: 90, color: '#ffffff', size: .02, seed: 24, glow: 3 }); g.add(motesU.mesh);
  FX.build(ctx, g, { arch: archG, cols: colsG, stat: statG, stone, mos, bowls, ARCH, road });
  g.userData = { road, bowls, ARCH };
  return g;
}
export { road };
export function update(ctx, t) { const { s } = ctx.now; FX.update(ctx, t); road.update(t, s); motesU.update(t, s); }
