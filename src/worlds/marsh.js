// WORLD 1: mirror marsh at dawn (gold mist, reed banks, waymarkers, willows). Stage D2 set: Tripo props instanced. Also hosts the 0-4 s hook (leaf whirl).
import * as THREE from 'three';
import { banks, lanternRoad, motes, proto, mirrored, scatter, register, beginWorld, camZones, blocked, sightLines, along, sidePt, onPath, headAt, riverCoords, sAtTime, bowlAnchor, slabTop, innerSpan, archTop, RECOLOR, UPV } from './common.js';
import { mulberry, s5, sst, TAU, col } from '../util.js';
import * as FX from '../fx/marsh.js';            // Stage E1: hook murmuration + ignition, candle wave, bowl fires, lotus buds, herons, pollen
export const id = 'marsh';
export const path = [[0, -20], [2, 0], [-3, 20], [2, 40], [0, 60], [-4, 80]];
export const look = {
  palette: { skyTop: '#8fa8c4', skyMid: '#ffe9b8', skyHorizon: '#f6c56b', skyBottom: '#c98a3c', sun: '#ffd08a', streak: '#fff4d8', wake: '#ffd27a' },
  sunDir: [-.5, .21, .84], sun: { size: .032, disc: 5.5, glow: 1.5 },                       // low sun front-right, 12 deg: three-quarter backlight
  sky: { exp: .8, midH: .22, streaks: .4, streakU: 2.2, streakV: 16, hazeK: 9 },
  fog: { color: '#e6c184', density: .017, mist: .022, mistH: 1.4, banks: .6, scatter: .8, scatterC: '#ffc870' },
  mist: { count: 9, color: '#f2d9a8', opacity: .3, size: [38, 4.5], side: [7, 24] },
  water: { tint: '#7a5c2c', deep: '#2e3a44', mirror: .97, f0: .55, rough: .03, ripple: .0025, glit: .85, colTh: 3, colLen: 1.5, broken: .7 },   // gold glass, one long sun column
  light: { key: '#ffd08a', keyI: 3.4, hemiSky: '#9fb6c9', hemiGround: '#5e6b4a', hemiI: 1.0, rim: '#ffe2a8', rimI: 70 },
  grade: { exposure: 1.0, con: 1.08, sat: [.92, 1.12], bloom: [.9, .8], hal: .5, blk: '#1c1608', lift: .008, tint: '#fff6e8', asleepEv: .12, asleepTint: '#f6f4f2', wakeT: [3, 6.5] },
  awake: { fog: { color: '#f2c67c' }, mist: { color: '#ffe2ae' } } };
let road, flies;
export let bowls = [];                       // world positions of the waymarker bowls (flare when woken), with arc length: [{ pos, s }]
export let reedHeads = null;                 // the near reed InstancedMesh group (geometry attribute aGlow.x = cattail head) for the candle wave
const cattail = (h, s, v, ny, y) => [(h > 12 && h < 40 && s > .35 && v > .2 && v < .75 && y > 1.2) ? 1 : 0, 0];
export async function build(ctx) {
  const P = ctx.path, g = new THREE.Group(), r = mulberry(12); beginWorld('marsh');
  const Z = camZones(ctx, 'marsh', P), SL = sightLines(ctx, 'marsh', P), L = P.length;
  g.add(banks(P, { color: '#5e5a3a', off: 15, every: 5, h: [.5, 1.6], seed: 11, w: [7, 12] }));
  // reed banks: hundreds of clumps, thin and small near the channel, dense and tall further out. near file inside 9 m, decimated beyond
  const near = await proto('marsh_reeds', { h: 2.4, flags: cattail, standIn: [1.9, 2.4, 1.6], color: '#9a8a50' }), far = await proto('marsh_reeds', { h: 2.4, far: true, standIn: [1.9, 2.4, 1.6], color: '#9a8a50' });
  const XN = [], XF = [];
  for (const sd of [-1, 1]) for (let s = -35; s < L + 35; s += .9) for (let k = 0; k < 6; k++) {
    const lat = 3.7 + Math.pow(r(), .75) * 22, dens = Math.min(1, .25 + (lat - 3.7) / 6); if (r() > dens * .55) continue;
    const sc = (.55 + .45 * Math.min(1, (lat - 3.7) / 5)) * (.8 + r() * .45), ss = s + r() * .9;
    if (blocked(Z, ss, sd * lat, .9 * sc)) continue; if (lat < 9 && SL.hides(sidePt(P, ss, sd * lat), .9 * sc, 0, 2.4 * sc)) continue;
    const x = { p: sidePt(P, ss, sd * lat, -.05), ry: r() * TAU, rx: (r() - .5) * .12, rz: (r() - .5) * .12, s: new THREE.Vector3(sc * (.85 + r() * .3), sc * (.8 + r() * .4), sc * (.85 + r() * .3)) };
    (lat < 9 ? XN : XF).push(x); }
  reedHeads = scatter(near, XN, { name: 'reeds' }); const reedFar = scatter(far, XF, { name: 'reeds_far' }); g.add(reedHeads, reedFar);
  // waymarkers every ~25 m on alternating banks (fern-curl pillar + bronze bowl)
  const wm = await proto('marsh_waymarker', { h: 3.1, standIn: [1, 3.1, 1], color: '#cfcab8' }), WX = []; bowls = [];
  const bowl = bowlAnchor(wm, .74, .9);
  for (let s = 12, i = 0; s < L + 10; s += 25, i++) { let sd = i % 2 ? -1 : 1, lat = 4.6; if (blocked(Z, s, sd * lat, .8)) sd = -sd; if (blocked(Z, s, sd * lat, .8) || SL.hides(sidePt(P, s, sd * lat), .7)) lat = 9.5;
    const h = headAt(P, s), x = { p: sidePt(P, s, sd * lat, -.15), ry: h - sd * Math.PI / 2 + (r() - .5) * .3, s: 1 }; WX.push(x);
    bowls.push({ pos: bowl.clone().applyAxisAngle(UPV, x.ry).add(x.p), s }); }
  g.add(scatter(wm, WX, { name: 'waymarkers' }));
  // 4 willows far out, mostly on the backdrop (left) bank
  const wl = await proto('marsh_willow', { h: 13, standIn: [12, 13, 10], color: '#6a7048' });
  g.add(scatter(wl, [[18, 1, 22], [44, 1, 27], [70, 1, 20], [30, -1, 30], [92, -1, 26]].map(([s, sd, lat]) => ({ p: sidePt(P, s, sd * lat, -.3), ry: r() * TAU, s: .85 + r() * .35 })), { name: 'willows' }));
  road = await lanternRoad(ctx, P, { color: '#ffc66e', s0: 4, world: 'marsh', gate: (t) => s5(ctx.TL.lanternOn[0], ctx.TL.lanternOn[1], t) }); g.add(road.group);
  flies = motes(P, { count: 140, color: '#ffd890', size: .025, seed: 14 }); g.add(flies.mesh);
  FX.build(ctx, g, { near: reedHeads, far: reedFar, bowls, road });
  g.userData = { road, bowls };
  return g;
}
export { road };
export function update(ctx, t) { const { s } = ctx.now; FX.update(ctx, t); road.update(t, s); flies.update(t, s); }
