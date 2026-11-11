// WORLD 4: Ember Gorge (30 m cliff walls, maples on banks/ledges/rim, high bridge, two waterfall slots). Stage D2 set.
import * as THREE from 'three';
import { banks, lanternRoad, motes, proto, mirrored, scatter, register, beginWorld, camZones, blocked, sightLines, along, sidePt, onPath, headAt, riverCoords, sAtTime, bowlAnchor, slabTop, innerSpan, archTop, RECOLOR, UPV } from './common.js';
import { mulberry, s5, sst, TAU, col } from '../util.js';
import * as FX from '../fx/gorge.js';
export const id = 'gorge';
export const path = [[0, -20], [-1, 0], [2, 20], [-2, 40], [1, 60], [0, 80]];
export const look = {
  palette: { skyTop: '#b45a6a', skyMid: '#f08a78', skyHorizon: '#ffb07a', skyBottom: '#3a1a22', sun: '#ffc39a', streak: '#ffd9c0', wake: '#ffc27a' },
  sunDir: [-.5, .42, -.75], sun: { size: .03, disc: 7, glow: .9 },                         // late sun behind-right, 25 deg: backlight through the leaves
  sky: { exp: .7, streaks: .55, streakU: 2.5, streakV: 22, hazeK: 8 },
  fog: { color: '#e09a86', density: .0058, mist: .004, mistH: 1.6, banks: .5, scatter: .3, scatterC: '#ffc8a0' },            // E2: clear air near the boat, the cliffs and maples read
  mist: { count: 4, color: '#f4e6d8', opacity: .1, size: [20, 4], side: [10.5, 14] },
  shafts: { count: 7, color: '#ffc39a', k: .11, r: [1.2, 2.4], len: 30, side: [7.5, 10.5], every: 9, s0: 12 },             // E2: beyond the side camera of shot 13, never between the lens and her
  water: { tint: '#3a1018', deep: '#14060a', mirror: .92, f0: .22, rough: .08, ripple: .005, glit: .5, colTh: 2.6, carpet: .96, leafAsleep: '#a32c1d', leafAwake: '#c8102e' },   // wine-dark mirror under a leaf carpet
  light: { key: '#ffc39a', keyI: 3.4, hemiSky: '#e88a8a', hemiGround: '#5a2020', hemiI: 1.0, rim: '#ffe0c2', rimI: 80 },
  grade: { exposure: 1.0, con: 1.2, sat: [.82, 1.25], bloom: [.7, .8], knee: .66, lift: .012, tint: '#fff6f2', wakeT: [.15, 1.5] } };   // E2: the burst is loud from the first frames
let road, leaves;
// maples for the wake pass (rust -> crimson, climbing the cliffs): instance attribute aS = arc length, aH = height (m) of each tree's base
export const maples = { near: null, far: null };
export let BRIDGE = null;                 // { s, pos, span, deckY }
export const waterfalls = [];             // [{ name, anchor (Object3D at the foot, +z = out of the cliff), plane (Mesh on the cliff face), top, width, s, side }]
export async function build(ctx) {
  const P = ctx.path, g = new THREE.Group(), r = mulberry(41), L = P.length; beginWorld('gorge');
  const Z = camZones(ctx, 'gorge', P), SL = sightLines(ctx, 'gorge', P), FACE = 11.5;
  // two 30 m cliff walls from mirrored modules, front face ~11.5 m off the river line (no Clawd orange: lichen pushed to rust)
  const cl = await proto('gorge_cliff', { h: 31, recolor: RECOLOR.rust, standIn: [16, 31, 9.5], color: '#5a4a4c' }), clM = mirrored(cl), C0 = [], C1 = [];
  const dep = cl.size.z;
  for (const sd of [-1, 1]) for (let s = -40, i = 0; s < L + 45; s += 10.5, i++) { const sc = .92 + r() * .22, lat = FACE + dep * .5 * sc + r() * 1.2;
    ((i + (sd > 0 ? 1 : 0)) % 2 ? C1 : C0).push({ p: sidePt(P, s, sd * lat, -1.2 - r()), ry: headAt(P, s) - sd * Math.PI / 2 + (r() - .5) * .16, s: sc }); }
  const cliffs = new THREE.Group(); cliffs.add(scatter(cl, C0, { name: 'cliff' }), scatter(clM, C1, { name: 'cliff_mir' })); g.add(cliffs);
  g.add(banks(P, { color: '#3a2a2c', off: 6.8, every: 3, seed: 44, h: [.4, 1.6], w: [3, 6] }));
  // maples: on the banks, on the ledges and on the rim (ray cast down onto the cliff modules)
  const mN = await proto('gorge_maple', { h: 7.5, recolor: RECOLOR.crimson, standIn: [8, 7.5, 4.6], color: '#8a2a2a' }), mF = await proto('gorge_maple', { h: 7.5, far: true, recolor: RECOLOR.crimson, standIn: [8, 7.5, 4.6], color: '#8a2a2a' });
  const XN = [], XF = [], AN = [], AF = [];
  const put = (x, s, near) => { (near ? XN : XF).push(x); (near ? AN : AF).push(s, x.p.y); };
  for (let k = 0, n = 0; k < 60 && n < 12; k++) { const s = -5 + r() * (L + 10), sd = r() < .5 ? -1 : 1, lat = 8.3 + r() * 2.5, sc = .8 + r() * .5; if (blocked(Z, s, sd * lat, 3 * sc)) continue; if (SL.hides(sidePt(P, s, sd * lat), 4 * sc)) continue;
    put({ p: sidePt(P, s, sd * lat, .1), ry: r() * TAU, s: sc }, s, true); n++; }
  cliffs.updateMatrixWorld(true); const rc = new THREE.Raycaster(), o = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), nm = new THREE.Matrix3();
  for (let k = 0, n = 0; k < 400 && n < 26; k++) { const s = -10 + r() * (L + 20), sd = r() < .5 ? -1 : 1; sidePt(P, s, sd * (FACE + .3 + r() * 6), 40, o); rc.set(o, down); rc.far = 45;
    const hit = rc.intersectObject(cliffs, true)[0]; if (!hit || !hit.face || hit.point.y < 3) continue; const M = new THREE.Matrix4(); hit.object.getMatrixAt(hit.instanceId, M);
    const nrm = hit.face.normal.clone().applyMatrix3(nm.getNormalMatrix(M)).normalize(); if (nrm.y < .75) continue;
    put({ p: hit.point.clone().setY(hit.point.y - .3), ry: r() * TAU, s: hit.point.y > 26 ? .9 + r() * .5 : .45 + r() * .4 }, s, false); n++; }
  for (let s = 15; s < 37; s += 2.7) { const sc = .44 + r() * .16; put({ p: sidePt(P, s + r(), 8.3 + r() * 1.5, .05), ry: r() * TAU, s: sc }, s, true); }   // E2: saplings on the far bank behind her in shot 13 (the flare needs trees in frame)
  { const sWF = sAtTime(ctx, 'gorge', (ctx.SHOTS.shots.find(x => x.world === 'gorge').t0 + ctx.SHOTS.shots.find(x => x.world === 'gorge').t1) / 2) + 46 - 8;          // E2: bank maples that hid the right waterfall from shot 12
    for (let i = XN.length - 1; i >= 0; i--) { const rc = riverCoords(P, XN[i].p); if (rc.lat < 0 && rc.s > sWF - 15 && rc.s < sWF + 2) { XN.splice(i, 1); AN.splice(i * 2, 2); } } }
  maples.near = scatter(mN, XN, { name: 'maples', attrs: { aSH: { array: new Float32Array(AN), size: 2 } } });
  maples.far = scatter(mF, XF, { name: 'maples_far', attrs: { aSH: { array: new Float32Array(AF), size: 2 } } }); g.add(maples.near, maples.far); maples.count = [XN.length, XF.length];
  // the high bridge where the boat passes under it in shot 13 (seen ahead in shot 12)
  const sh12 = ctx.SHOTS.shots.find(x => x.world === 'gorge'), sB = sAtTime(ctx, 'gorge', (sh12.t0 + sh12.t1) / 2) + 46, br = await proto('gorge_bridge', { w: 2 * FACE + 7, standIn: [32, 15, 4.4], color: '#d8cfc0' }), pB = onPath(P, sB); pB.y = 10;
  g.add(scatter(br, [{ p: pB, ry: headAt(P, sB) }], { name: 'bridge' })); BRIDGE = { s: sB, pos: pB.clone(), span: +br.size.x.toFixed(1), deckY: +(10 + br.size.y).toFixed(1) };
  // two waterfall slots at the cliff feet (Fable makes the water): a flat wet plane on the face + a named anchor at the foot
  const wet = new THREE.MeshStandardMaterial({ color: '#1e1618', roughness: .6 });
  // E2: both falls must be seen from shot 12: if a cliff bulge hides a slot from that camera, slide it along the wall to the clearest spot
  const eye12 = sidePt(P, sAtTime(ctx, 'gorge', sh12.t0 + 1.5) - 8, .45, 2.4), rcW = new THREE.Raycaster(), tg = new THREE.Vector3();
  const seen = (s, sd) => { let n = 0; for (const y of [4, 8, 12, 16, 20]) { sidePt(P, s, sd * (FACE - .9), y, tg); const d = tg.clone().sub(eye12), len = d.length(); rcW.set(eye12, d.normalize()); rcW.far = len - .6; if (!rcW.intersectObject(cliffs, true).length) n++; } return n; };
  for (const sd of [-1, 1]) { let s = sB - 11 + (sd > 0 ? 0 : 3), bv = seen(s, sd); if (bv < 4) { const s0 = s; for (const ds of [-2, -4, -6, -8, -10, -12, -14, -16, 2, 4]) { const v = seen(s0 + ds, sd); if (v > bv) { bv = v; s = s0 + ds; } } }
    const h = headAt(P, s), top = 24, width = 4.2, a = new THREE.Object3D();
    a.name = 'waterfall_' + (sd > 0 ? 'L' : 'R'); sidePt(P, s, sd * (FACE - .6), 0, a.position); a.rotation.y = h - sd * Math.PI / 2;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(width, top).translate(0, top / 2, 0), wet); pl.name = a.name + '_plane'; a.add(pl);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f4e6d8', roughness: 1, transparent: true, opacity: 0 })); pool.position.set(0, .02, 1.5); pool.name = a.name + '_pool'; a.add(pool);
    g.add(a); waterfalls.push({ name: a.name, anchor: a, plane: pl, pool, top, width, s, side: sd }); }
  road = await lanternRoad(ctx, P, { color: '#ffc66e', s0: 4, world: 'gorge' }); g.add(road.group);
  FX.build(ctx, g, { P, maples, waterfalls, BRIDGE, sunDir: look.sunDir });      // stage E2: leaf rain (replaces the D motes), maple flare, waterfalls, rainbow, bridge lanterns
  g.userData = { road, maples, BRIDGE, waterfalls };
  return g;
}
export { road };
export function update(ctx, t) { const { s } = ctx.now; road.update(t, s); FX.update(ctx, t); }
