// Stage E1 Mirror Marsh fx: the candle wave on the cattail heads (thousands, mirrored), dew glints, waymarker bowl fires, lotus buds + halos,
// two herons lifting through the sun column with paired wingtip rings, pollen in the backlight, water-strider pin rings. Pure in t.
import { THREE, KT, sprites, wakeTimer, rings, fires, lotusFx, makeBird, patch, lin, mulberry, s5, sst, hsh, TAU } from './e1kit.js';
import { buildHook, updateHook, flashAt, FLASH_T } from './hook.js';
let lotus, birds = [], HER = [];
// cattail head tops in proto space: flagged vertices (aGlow.x) clustered
function headPts(pr) {
  const raw = [];
  for (const p of pr.parts) { const gl = p.geometry.attributes.aGlow, ps = p.geometry.attributes.position; if (!gl) continue; const cells = new Map();
    for (let i = 0; i < ps.count; i++) if (gl.getX(i) > .5) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), k = Math.round(x / .08) + ',' + Math.round(z / .08), c = cells.get(k) || { x: 0, z: 0, y: -1e9, n: 0 }; c.x += x; c.z += z; c.y = Math.max(c.y, y); c.n++; cells.set(k, c); }
    for (const c of cells.values()) if (c.n >= 3) raw.push(new THREE.Vector3(c.x / c.n, c.y, c.z / c.n)); }
  raw.sort((a, b) => b.y - a.y); const out = [];
  for (const p of raw) { if (out.length >= 16) break; if (!out.some(q => Math.hypot(q.x - p.x, q.z - p.z) < .16)) out.push(p); }
  return out;
}
export function build(ctx, g, { near, far, bowls, road }) {
  buildHook(ctx, g);
  const WT = wakeTimer(ctx, 'marsh'), r = mulberry(1601), H = near.userData.proto.size.y || 2.4, v = new THREE.Vector3();
  let heads = near.userData.proto.standIn ? [] : headPts(near.userData.proto);
  if (heads.length < 4) { heads = []; for (let i = 0; i < 9; i++) { const a = r() * TAU, q = r() * .6; heads.push(new THREE.Vector3(Math.cos(a) * q, H * (.72 + .26 * r()), Math.sin(a) * q)); } }
  window.E1 = Object.assign(window.E1 || {}, { heads: heads.length });
  // ---- candles (type 0) on every head + dew beads (type 1) on the reeds
  const L = [];
  const put = (M, k, perDew) => { const ins = v.setFromMatrixPosition(M).clone(), tW = WT.lit(ins, 2.5, 25), tF = flashAt(ctx, ins), sy = new THREE.Vector3().setFromMatrixScale(M).y;
    const hs = k >= heads.length ? heads : heads.map((h, i) => [hsh(i + L.length, 4), h]).sort((a, b) => a[0] - b[0]).slice(0, k).map(x => x[1]);
    for (const h of hs) { const p = h.clone().applyMatrix4(M); L.push([p.x, p.y, p.z, Math.max(tW, tF) + r() * .35, tF, r(), sy * (.8 + .5 * r()), 0]); }
    for (let i = 0; i < perDew; i++) { const a = r() * TAU, q = r() * .7; v.set(Math.cos(a) * q, H * (.12 + .7 * r()), Math.sin(a) * q).applyMatrix4(M); L.push([v.x, v.y, v.z, Math.max(tW, tF), tF, r(), 1, 1]); } };
  near.userData.mats.forEach(M => put(M, 99, 5)); far.userData.mats.forEach(M => put(M, 11, 1));
  const n = L.length, A = new Float32Array(n * 4), B = new Float32Array(n * 4); L.forEach((c, i) => { A.set(c.slice(0, 4), i * 4); B.set(c.slice(4), i * 4); });
  g.add(sprites(ctx, { n, A, B, order: 3, name: 'candles',
    vs: `float ts = uT - aA.w, tf = uT - aB.x, sd = aB.y, flash = step(0., tf) * exp(-max(tf, 0.) * 3.2); P = vec4(sd, 0., flash, aB.w);
      vec4 wq = modelMatrix * vec4(C, 1.); float dist = length(wq.xyz - cameraPosition), far = max(1., dist / 7.5), gl = 1. + min(dist, 45.) * .09;
      if (aB.w < .5) { float on = q5(0., .3, ts), pop = 1. + 1.8 * exp(-max(ts, 0.) * 3.5), fl = 1. + .2 * sin(uT * (9. + 7. * sd) + sd * 60.) + .1 * sin(uT * 23. + sd * 17.);
        float k = on * pop * fl + 1.1 * flash * (1. - on); S = vec2(.4, .5) * aB.z * far * step(.003, k); C.y += .1 * aB.z; C.x += .012 * sin(uT * 6. + sd * 30.) * on; K = vec4(k, on, gl, 1.); }
      else { float tw = pow(.5 + .5 * sin(uT * (1.3 + 2. * sd) + sd * 90.), 40.), k = 2.5 * flash + step(0., ts) * (4. * exp(-max(ts, 0.) * 2.5) + 1.2 * tw);
        S = vec2(.07 * (.5 + sd)) * far * step(.02, k); K = vec4(vec3(1., .93, .75) * k * 2., 1.); Z = .05; }`,
    fs: `if (vP.w < .5) { vec2 p = uv; float f = exp(-(p.x * p.x * 90. + (p.y + .22) * (p.y + .22) * 16.)) * smoothstep(-.7, -.35, p.y), d = length(uv), halo = exp(-d * d * 6.) * smoothstep(1., .55, d);
        col = (vec3(1., .64, .22) * f * 4.2 + vec3(1., .5, .14) * halo * .14 * vK.z) * vK.x; A = 1.; }
      else { float d = length(uv); A = pow(max(0., 1. - d), 2.) + max(0., 1. - abs(uv.x) * 8.) * max(0., 1. - abs(uv.y)) * .6 + max(0., 1. - abs(uv.y) * 8.) * max(0., 1. - abs(uv.x)) * .6; }` }));
  // ---- the near cattail heads themselves glow like embers once lit (per-instance wake time)
  near.children.forEach(im => { const a = new Float32Array(im.count); near.userData.mats.forEach((M, i) => { v.setFromMatrixPosition(M); a[i] = Math.max(WT.lit(v, 2.5, 25), flashAt(ctx, v)) + .2; });
    im.geometry.setAttribute('aTW', new THREE.InstancedBufferAttribute(a, 1)); if (!im.geometry.attributes.aGlow) return;
    patch(ctx, im.material, { vhead: 'attribute vec2 aGlow; attribute float aTW; varying float vHd; uniform float eT;', vbody: 'vHd = aGlow.x * smoothstep(0., .7, eT - aTW);', fhead: 'varying float vHd;',
      femis: 'totalEmissiveRadiance += vHd * vec3(2.4, 1.0, .22) * (1. + .15 * sin(eT * 11. + vMW.x * 9.));' }); });
  // ---- waymarker bowls flare
  g.add(fires(ctx, bowls.map(b => ({ pos: b.pos.clone().setY(b.pos.y + .04), tW: Math.max(WT(b.pos), flashAt(ctx, b.pos)) + .15, size: .62 })), { name: 'bowlFires', glow: 1.2 }));
  // ---- lotus buds + halos
  lotus = lotusFx(ctx, road, WT, { gateT: ctx.TL.lanternOn[1] - .15 }); g.add(lotus.halo);
  // ---- pollen in the backlight
  { const N = 2800, P = ctx.path, A = new Float32Array(N * 4), B = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { const p = P.sideAt(r() * P.length, (r() * 2 - 1) * 10, .08 + Math.pow(r(), 1.4) * 3.6); A.set([p.x, p.y, p.z, r()], i * 4); B.set([r(), r(), 0, 0], i * 4); }
    g.add(sprites(ctx, { n: N, A, B, order: 4, name: 'pollen',
      vs: `float s = aA.w; C += vec3(sin(uT * .31 + s * 40.), .4 * sin(uT * .23 + aB.x * 30.), cos(uT * .27 + aB.y * 50.)) * .4; vec4 wq = modelMatrix * vec4(C, 1.); vec3 dv = wq.xyz - cameraPosition; float d = length(dv);
        vec3 L = normalize(uSunF.xyz); if (uUWk.w > .5) { L.y = -L.y; } float back = pow(max(dot(dv / d, L), 0.), 4.);
        S = vec2(max(.007, d * .0017)) * (.6 + .8 * aB.x); K = vec4(vec3(1., .84, .5) * (.3 + 5. * back) * (.45 + .55 * sin(uT * (1. + 2. * aB.y) + s * 80.)) * smoothstep(.5, 2., d), 1.);`,
      fs: `A = pow(max(0., 1. - length(uv)), 2.);` })); }
  // ---- herons: two birds standing in the shallows ahead-right of shot 4, lifting off through the sun column
  const s4 = ctx.SHOTS.shots.find(x => x.name.startsWith('04')) || { t0: 7.5 }, b4 = ctx.anchors(s4.t0).b, RL = [];
  const toW = (x, z) => new THREE.Vector3(x, 0, z).applyQuaternion(b4.quat).add(b4.pos).setY(0), dirW = (x, z) => new THREE.Vector3(x, 0, z).applyQuaternion(b4.quat).setY(0).normalize();
  HER = [{ p0: toW(-9.0, -1.5), dir: dirW(-.2, 1), T0: s4.t0 + .35, v: 4.6, ph: 0 }, { p0: toW(-11.2, 0.2), dir: dirW(-.26, 1), T0: s4.t0 + .8, v: 5.0, ph: 1.7 }];   // P1: behind her in shot 4's new 3/4 front frame
  HER.forEach((h, i) => { const b = makeBird({ span: 1.75, bodyGlow: 1.3, wingGlow: 1.8 }); b.g.rotation.order = 'YXZ'; birds.push(b); g.add(b.g); const sd = new THREE.Vector3(h.dir.z, 0, -h.dir.x), q = new THREE.Vector3();
    for (let k = 0; k < 4; k++) { const tk = h.T0 + .16 + k * .435; heronPos(h, tk, q); for (const e of [-1, 1]) RL.push({ x: q.x + sd.x * e * .8, z: q.z + sd.z * e * .8, t0: tk, life: 2.6, R: 1.5 + .3 * k, k: 1.3 - .2 * k }); } });
  // water striders: pin rings near the channel
  for (let i = 0; i < 70; i++) { const p = ctx.path.sideAt(r() * ctx.path.length, (r() * 2 - 1) * 6.5, 0); RL.push({ x: p.x, z: p.z, t0: r() * 3, period: 1.3 + r() * 2.2, life: 1.1, R: .22 + .15 * r(), k: .55 }); }
  g.add(rings(ctx, RL, { color: '#ffe9b8', name: 'marshRings', w: .02 }));
  return { WT };
}
function heronPos(h, t, out) { const a = Math.max(0, t - h.T0), d = h.v * (a - (1 - Math.exp(-1.5 * a)) / 1.5); return out.copy(h.p0).addScaledVector(h.dir, d).setY(.6 + .34 * Math.pow(a, 1.7)); }
const _p = new THREE.Vector3();
export function update(ctx, t) {
  updateHook(ctx, t); lotus.update(t);
  HER.forEach((h, i) => { const b = birds[i], a = t - h.T0, fold = 1 - sst(-.12, .18, a); heronPos(h, t, _p); b.g.position.copy(_p);
    b.g.rotation.set(-Math.min(.35, .3 * Math.max(0, a)) * (1 - sst(1.2, 2.6, a)), Math.atan2(h.dir.x, h.dir.z), 0); b.pose(h.ph + Math.max(0, a) * TAU * 2.3 + 1.2, fold); });
}
