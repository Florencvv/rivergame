// WORLD 3: the Underroot (tunnel of roots, root ceiling, hanging rootlets, hundreds of mushrooms flagged for the glow pass). Stage D2 set.
import * as THREE from 'three';
import { banks, lanternRoad, motes, proto, mirrored, scatter, register, beginWorld, camZones, blocked, sightLines, along, sidePt, onPath, headAt, riverCoords, sAtTime, bowlAnchor, slabTop, innerSpan, archTop, RECOLOR, UPV } from './common.js';
import { mulberry, s5, sst, TAU, col } from '../util.js';
import * as FX from '../fx/grotto.js';
export const id = 'grotto';
export const path = [[0, -20], [1, 0], [-3, 18], [2, 38], [-2, 58], [0, 78]];
export const look = {
  palette: { skyTop: '#1a1d4a', skyHorizon: '#1b2a5a', skyBottom: '#10162e', sun: '#000000', ceilGlow: '#8c5bff', star: '#9ff6ee', wake: '#6ff0e0', wakeGlow: '#23e0d0' },
  sunDir: [0, 1, .15], sun: { disc: 0, glow: 0 },
  sky: { ceil: 1, stars: 1, hazeK: 5, haze: .9 },                                          // no sky: root ceiling, glow-worm stars switch on with the wake
  fog: { color: '#1f2f66', density: .03, mist: .035, mistH: 1.1, banks: .5, scatter: 0 },
  mist: { count: 8, color: '#2c4a8a', opacity: .3, size: [26, 3], side: [5, 14] },
  water: { tint: '#0c1230', deep: '#05081a', mirror: 1, f0: .75, rough: .02, ripple: .0015, glit: .6, colTh: 2.4, colLen: 1.2, broken: .6, front: .45 },   // black mirror, the sharpest of the film
  light: { key: '#5b3fb8', keyI: 1.6, hemiSky: '#6a4fd0', hemiGround: '#23a0a0', hemiI: 1.3, rim: '#b58cff', rimI: 80, faceI: 5 },
  grade: { exposure: 1.8, con: 1.25, sat: [.7, 1.3], bloom: [1.2, .6], blk: '#0b1026', lift: .004, tint: '#f8f4ff', asleepEv: .3 } };
let road, flies;
// mushrooms for the glow pass: geometry attribute aGlow = (cap, gill) per vertex (from the base colour + normal), instance attribute aS = arc length
// of each cluster (wake it with wakeAt('grotto', aS)). mushrooms.near / mushrooms.far are the two instanced groups.
export const mushrooms = { near: null, far: null };
export let TUNNEL = null;       // { span, crown, every } measured root-arch tunnel
const glowFlags = (h, s, v, ny) => (s < .32 && v > .5) ? [ny > .2 ? 1 : 0, ny < -.2 ? 1 : 0] : [0, 0];
function rootletGeo() { const g = new THREE.PlaneGeometry(1, 1, 1, 8); g.translate(0, -.5, 0); const a = g.attributes.position;   // top at y = 0, hangs down 1, tapers to a thread
  for (let i = 0; i < a.count; i++) { const y = a.getY(i), w = .15 + .85 * (1 + y); a.setX(i, a.getX(i) * w + .06 * Math.sin(y * 7)); } g.computeVertexNormals(); return g; }
export async function build(ctx) {
  const P = ctx.path, g = new THREE.Group(), r = mulberry(31), L = P.length; beginWorld('grotto');
  const Z = camZones(ctx, 'grotto', P), SL = sightLines(ctx, 'grotto', P);
  g.add(banks(P, { color: '#2a2030', off: 7.5, every: 4, seed: 31, h: [1, 3], w: [5, 9], sides: [1] }), banks(P, { color: '#2a2030', off: 12, every: 4, seed: 32, h: [1, 3], w: [5, 9], sides: [-1] }));   // E2: the bank on the camera side of shot 11 moved out (rocks stood in the lens)
  // tunnel of roots: the arch every 5.5 m, every other one mirrored, legs scaled apart to a ~9.5 m clear span
  let ra = await proto('grotto_root_arch', { h: 12.5, standIn: [10, 12.5, 4.8], color: '#3a2a30' });
  const SINK = 1.2, op = ra.standIn ? { span: 7, mid: 0 } : innerSpan(ra, SINK + .1, SINK + 4, true), span0 = op.span, sx = Math.min(2, Math.max(1, 7.6 / span0));
  if (sx > 1.01) ra = await proto('grotto_root_arch', { h: 12.5, sx, standIn: [10, 12.5, 4.8], color: '#3a2a30' });
  const raM = mirrored(ra), A0 = [], A1 = [], every = 5.5;
  for (let s = -18, i = 0; s < L + 18; s += every, i++) { if (s > 18 && s < 29) continue;                                    // E2: the two arches whose root feet stood in the lens of shot 11 (camera 8 m off the line): an open chamber under the star ceiling
    const flip = i % 4 > 1, mir = i % 2 === 1, mx = op.mid * sx * (mir ? -1 : 1) * (flip ? -1 : 1), ss = s + (r() - .5) * 1.2; (mir ? A1 : A0).push({ p: sidePt(P, ss, -mx, -SINK), ry: headAt(P, ss) + (r() - .5) * .1 + (flip ? Math.PI : 0), s: new THREE.Vector3(1, .92 + r() * .16, .9 + r() * .3) }); }
  const arches = new THREE.Group(); arches.add(scatter(ra, A0, { name: 'root_arch' }), scatter(raM, A1, { name: 'root_arch_mir' })); g.add(arches);
  const crown = (ra.standIn ? 9 : archTop(ra, 2)) - SINK; TUNNEL = { span: +(span0 * sx).toFixed(2), crown: +crown.toFixed(2), every, sx: +sx.toFixed(2) };
  // root ceiling: dark knotted masses above the arches, with gaps where the glow-worm sky shows through
  const cg = new THREE.IcosahedronGeometry(1, 2), ca = cg.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < ca.count; i++) { v.fromBufferAttribute(ca, i); v.multiplyScalar(1 + .25 * Math.sin(v.x * 4.1 + v.z * 2.3) * Math.cos(v.y * 3.7 - v.x)); ca.setXYZ(i, v.x, v.y, v.z); } cg.computeVertexNormals();
  const CX = []; for (let s = -20; s < L + 20; s += 2.6) for (let k = 0; k < 4; k++) { if (r() < .4) continue; const lat = (r() * 2 - 1) * 14;
    CX.push({ p: sidePt(P, s + r() * 2, lat, crown + 1.2 + r() * 3.5 + Math.abs(lat) * .12), ry: r() * TAU, rz: (r() - .5) * .5, s: new THREE.Vector3(2.5 + r() * 4, .8 + r() * 1.6, 1.4 + r() * 2.5) }); }
  g.add(scatter({ name: 'ceiling', parts: [{ geometry: cg, material: new THREE.MeshStandardMaterial({ color: '#1c1626', roughness: .95 }) }], pts: [] }, CX, { name: 'root_ceiling', check: false }));
  // hanging root curtains (thin tapered cards): under every crown and along the walls; over the channel they end >= 4.6 m up
  const RX = [];
  for (const a of [...A0, ...A1]) { const s = riverCoords(P, a.p).s; for (let k = 0; k < 9; k++) { const lat = (r() * 2 - 1) * 4.6, top = crown - .3 - Math.abs(lat) * .25;
      let len = 1 + r() * 4.5; if (Math.abs(lat) < 2.8) len = Math.min(len, top - 4.7); if (len < .5) continue; if (top - len < 4 && blocked(Z, s, lat, .3)) continue; if (SL.hides(sidePt(P, s, lat), .3, top - len, top)) continue;
      RX.push({ p: sidePt(P, s + (r() - .5) * 2, lat, top), ry: r() * TAU, s: new THREE.Vector3(.05 + r() * .14, len, 1) }); } }
  for (let s = -10; s < L + 10; s += .8) for (const sd of [-1, 1]) { if (r() < .35) continue; const lat = 4.8 + r() * 5, top = 7 + r() * 3, len = 2 + r() * 5.5; if (top - len < 4 && blocked(Z, s, sd * lat, .3)) continue; if (SL.hides(sidePt(P, s, sd * lat), .3, top - len, top)) continue;
    RX.push({ p: sidePt(P, s, sd * lat, top), ry: r() * TAU, s: new THREE.Vector3(.06 + r() * .16, len, 1) }); }
  g.add(scatter({ name: 'rootlets', parts: [{ geometry: rootletGeo(), material: new THREE.MeshStandardMaterial({ color: '#3a2c34', roughness: .9, side: THREE.DoubleSide }) }], pts: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -.5, 0)] }, RX, { name: 'rootlets' }));
  // mushrooms: hundreds on both banks + small clusters grown on the root legs (ray cast from the channel onto the arches)
  const mn = await proto('grotto_mushrooms', { h: 1.5, flags: glowFlags, standIn: [1.2, 1.5, 1], color: '#d8d0c8' }), mf = await proto('grotto_mushrooms', { h: 1.5, far: true, flags: glowFlags, standIn: [1.2, 1.5, 1], color: '#d8d0c8' });
  const XN = [], XF = [], SN = [], SF = [];
  for (const sd of [-1, 1]) for (let s = -20; s < L + 20; s += .7) for (let k = 0; k < 3; k++) { if (r() < .45) continue; const lat = 3.4 + Math.pow(r(), 1.3) * 9, sc = .35 + r() * (lat < 5 ? .5 : 1.1), ss = s + r() * .7;
    if (blocked(Z, ss, sd * lat, .8 * sc) || SL.hides(sidePt(P, ss, sd * lat), .8 * sc, 0, 1.5 * sc)) continue; const x = { p: sidePt(P, ss, sd * lat, -.1), ry: r() * TAU, rx: (r() - .5) * .3, rz: (r() - .5) * .3, s: sc };
    if (lat < 7) { XN.push(x); SN.push(ss); } else { XF.push(x); SF.push(ss); } }
  arches.updateMatrixWorld(true); const rc = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3(), nm = new THREE.Matrix3(), q = new THREE.Quaternion();
  for (let k = 0; k < 160; k++) { const s = -5 + r() * (L + 10), sd = r() < .5 ? -1 : 1, y = .6 + r() * 6.5, h = headAt(P, s);
    sidePt(P, s, 0, y, o); d.set(Math.cos(h) * sd, (r() - .3) * .4, -Math.sin(h) * sd).normalize(); rc.set(o, d); rc.far = 12;
    const hit = rc.intersectObject(arches, true)[0]; if (!hit || !hit.face) continue; const im = hit.object, M = new THREE.Matrix4(); im.getMatrixAt(hit.instanceId, M);
    const n = hit.face.normal.clone().applyMatrix3(nm.getNormalMatrix(M)).normalize(); if (n.dot(d) > -.2) continue; n.lerp(UPV, .45).normalize(); q.setFromUnitVectors(UPV, n);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'), sc = .25 + r() * .4; if (hit.point.y < 4 && blocked(Z, s, sd * 5, .5)) continue; if (Math.abs(riverCoords(P, hit.point).lat) < 3.4 || SL.hides(hit.point, .5, hit.point.y - .5, hit.point.y + 1)) continue;
    XN.push({ p: hit.point.clone().addScaledVector(n, -.05), rx: e.x, ry: e.y, rz: e.z, s: sc }); SN.push(s); }
  mushrooms.near = scatter(mn, XN, { name: 'mushrooms', attrs: { aS: { array: new Float32Array(SN), size: 1 } } });
  mushrooms.far = scatter(mf, XF, { name: 'mushrooms_far', attrs: { aS: { array: new Float32Array(SF), size: 1 } } }); g.add(mushrooms.near, mushrooms.far);
  mushrooms.count = [XN.length, XF.length];
  road = await lanternRoad(ctx, P, { color: '#ffc66e', s0: 4, world: 'grotto' }); g.add(road.group);
  FX.build(ctx, g, { P, mushrooms, TUNNEL, Z });       // stage E2: glow wave, spores, glow-worm ceiling, wake sparks, fireflies (replace the D motes), drip rings
  g.userData = { road, mushrooms, TUNNEL };
  return g;
}
export { road };
export function update(ctx, t) { const { s } = ctx.now; road.update(t, s); FX.update(ctx, t); }
