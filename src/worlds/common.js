// building blocks shared by the worlds (Stage D2). All placement is seeded at build time; all motion is closed form in t.
// "wake" = how awake a thing is: 0 ahead of the boat, ramps to 1 once the boat has passed it (everything wakes up behind her).
// Set dressing: proto(name, fit) loads tripo/web/<name>.glb (only after tripo/web/ASSETS_WEB_READY exists; stand-in box otherwise),
// bakes it to metres (base at y = 0, centred), and scatter(proto, xforms) draws N copies as ONE InstancedMesh per material.
// Every scattered piece is registered in window.D2.pieces for the clearance check (min distance spline -> prop, see clearance()).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mulberry, sst, s5, hsh, TAU, col } from '../util.js';
import { lotusSide } from '../lane.js';

export const wake = (sThing, sBoat, lead = 1.5, ramp = 5) => sst(sThing - lead, sThing - lead + ramp, sBoat);
const D2 = window.D2 = window.D2 || { pieces: [], protos: {}, notes: [] };

// ------------------------------------------------------------------ web assets
const WEB = './assets/';
let readyP = null;
export const webReady = () => readyP ??= Promise.resolve(true);   // GAME: assets are preloaded into THREE.Cache
const loader = new GLTFLoader(), rawC = new Map();
const loadRaw = (file) => { if (!rawC.has(file)) rawC.set(file, loader.loadAsync(WEB + file).catch(() => null)); return rawC.get(file); };

// recolour a texture on the CPU (hue rules), returns a new CanvasTexture with the same sampling settings
function imgData(tex) { const im = tex.image, w = im.width, h = im.height, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c2 = cv.getContext('2d', { willReadFrequently: true }); c2.drawImage(im, 0, 0); return { cv, c2, w, h, d: c2.getImageData(0, 0, w, h) }; }
function rgb2hsv(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, mx > 0 ? d / mx : 0, mx]; }
function hsv2rgb(h, s, v) { const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)]; }
function recolor(tex, fn) {
  const D = imgData(tex), a = D.d.data;
  for (let i = 0; i < a.length; i += 4) { const o = fn(...rgb2hsv(a[i] / 255, a[i + 1] / 255, a[i + 2] / 255)); if (o) { const [r, g, b] = hsv2rgb(...o); a[i] = r * 255; a[i + 1] = g * 255; a[i + 2] = b * 255; } }
  D.c2.putImageData(D.d, 0, 0); const t = new THREE.CanvasTexture(D.cv);
  t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.channel = tex.channel; t.anisotropy = 4; return t;
}
// no Clawd orange anywhere: orange hues (12-42 deg, saturated) go to crimson / rust (gorge) or to brown (dull)
export const RECOLOR = {
  crimson: (h, s, v) => (h > 8 && h < 44 && s > .35) ? [352 + (h - 8) * .15, Math.min(1, s * 1.05), v * .92] : null,
  rust: (h, s, v) => (h > 8 && h < 44 && s > .35) ? [8 + (h - 8) * .25, s * .7, v * .8] : null,
};

// per-vertex flags from the base colour: aGlow = (cap, gill) for the later glow pass (mushrooms), aHead for cattail heads
function vertexFlags(geo, tex, rule) {
  const D = imgData(tex), a = D.d.data, uv = geo.attributes.uv, n = geo.attributes.normal, N = uv.count, out = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { let u = uv.getX(i) % 1, v = uv.getY(i) % 1; if (u < 0) u += 1; if (v < 0) v += 1;
    const x = Math.min(D.w - 1, u * D.w | 0), y = Math.min(D.h - 1, (tex.flipY ? 1 - v : v) * D.h | 0), j = (y * D.w + x) * 4;
    const [h, s, val] = rgb2hsv(a[j] / 255, a[j + 1] / 255, a[j + 2] / 255); const f = rule(h, s, val, n ? n.getY(i) : 0, geo.attributes.position.getY(i)); out[i * 2] = f[0]; out[i * 2 + 1] = f[1]; }
  return out;
}

// fit: { h | w (target height / width in m), sx/sz (extra axis scale), far (use <name>_far.glb), recolor, flags, rough, standIn: [x,y,z] fallback size, color }
const protoC = new Map();
export async function proto(name, fit = {}) {
  const key = name + JSON.stringify(fit, (k, v) => typeof v === 'function' ? 'fn' : v); if (protoC.has(key)) return protoC.get(key);
  const P = (async () => {
    const ok = await webReady(); let gltf = null, file = null;
    if (ok && fit.far) { gltf = await loadRaw(name + '_far.glb'); file = name + '_far.glb'; }
    if (ok && !gltf) { gltf = await loadRaw(name + '.glb'); file = name + '.glb'; }
    const parts = [];
    if (gltf) { const sc = gltf.scene; sc.updateMatrixWorld(true);
      sc.traverse(o => { if (!o.isMesh) return; const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); parts.push({ geometry: g, material: o.material }); }); }
    let standIn = false;
    if (!parts.length) { const s = fit.standIn || [1, 1, 1]; const g = new THREE.BoxGeometry(...s); g.translate(0, s[1] / 2, 0);
      parts.push({ geometry: g, material: new THREE.MeshStandardMaterial({ color: fit.color || '#888070', roughness: .9 }) }); standIn = true; file = 'stand-in'; }
    const box = new THREE.Box3(); parts.forEach(p => { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); });
    const sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const k = fit.w ? fit.w / sz.x : fit.h ? fit.h / sz.y : 1, M = new THREE.Matrix4().makeScale(k * (fit.sx || 1), k, k * (fit.sz || 1)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
    const done = new Set();
    for (const p of parts) { p.geometry.applyMatrix4(M); p.geometry.computeBoundingBox(); p.geometry.computeBoundingSphere();
      const m = p.material; if (!done.has(m)) { done.add(m);
        if (m.isMeshStandardMaterial) { m.metalness = 0; m.metalnessMap = null; m.roughnessMap = null; m.roughness = fit.rough ?? .9; m.envMap = null; m.needsUpdate = true; }   // never plastic, never chrome
        if (fit.recolor && m.map) { m.map = recolor(m.map, fit.recolor); m.needsUpdate = true; } }
      if (fit.flags && m.map && !standIn) p.geometry.setAttribute('aGlow', new THREE.BufferAttribute(vertexFlags(p.geometry, m.map, fit.flags), 2)); }
    const bb = new THREE.Box3(); parts.forEach(p => bb.union(p.geometry.boundingBox));
    // a vertex sample for the clearance check (<= 3000 points)
    const pts = []; for (const p of parts) { const a = p.geometry.attributes.position, st = Math.max(1, Math.floor(a.count / 3000)); for (let i = 0; i < a.count; i += st) pts.push(new THREE.Vector3().fromBufferAttribute(a, i)); }
    const tris = parts.reduce((n, p) => n + (p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count) / 3, 0);
    const out = { name, file, parts, box: bb, size: bb.getSize(new THREE.Vector3()), pts, standIn, tris };
    D2.protos[key] = { name, file, tris, size: out.size.toArray().map(x => +x.toFixed(2)), standIn };
    return out;
  })();
  protoC.set(key, P); return P;
}

// mirror a proto in x (a second look of the same asset; winding flipped so it stays front-facing)
export function mirrored(pr) {
  const M = new THREE.Matrix4().makeScale(-1, 1, 1);
  const parts = pr.parts.map(p => { const g = p.geometry.clone(); g.applyMatrix4(M); if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.index.needsUpdate = true; }
    g.computeBoundingBox(); g.computeBoundingSphere(); return { geometry: g, material: p.material }; });
  return { ...pr, name: pr.name + '_mir', parts, pts: pr.pts.map(v => v.clone().setX(-v.x)) };
}

// xforms: [{ p: Vector3, ry, rx?, rz?, s: number | Vector3 }] -> Group of InstancedMesh (one per part). check: false = not counted in clearance
export function scatter(pr, xforms, { name = pr.name, check = true, attrs = null } = {}) {
  const g = new THREE.Group(); g.name = name; const mats = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), s = new THREE.Vector3();
  for (const x of xforms) { q.setFromEuler(e.set(x.rx || 0, x.ry || 0, x.rz || 0, 'YXZ')); if (typeof x.s === 'number' || x.s == null) s.setScalar(x.s ?? 1); else s.copy(x.s); mats.push(new THREE.Matrix4().compose(x.p, q, s)); }
  for (const p of pr.parts) { const im = new THREE.InstancedMesh(p.geometry, p.material, mats.length); mats.forEach((M, i) => im.setMatrixAt(i, M)); im.instanceMatrix.needsUpdate = true;
    if (attrs) for (const k in attrs) im.geometry.setAttribute(k, new THREE.InstancedBufferAttribute(attrs[k].array, attrs[k].size));
    im.computeBoundingSphere(); im.castShadow = im.receiveShadow = false; im.name = name; g.add(im); }
  g.userData = { proto: pr, mats };
  if (check) D2.pieces.push({ world: D2.cur, name, pr, mats });
  return g;
}
// a plain mesh registered for the clearance check
export function register(mesh, name = mesh.name) { mesh.updateMatrixWorld(true); const pos = mesh.geometry.attributes.position, pts = [], st = Math.max(1, Math.floor(pos.count / 2000));
  for (let i = 0; i < pos.count; i += st) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i)); D2.pieces.push({ world: D2.cur, name, pr: { pts }, mats: [mesh.matrixWorld.clone()] }); return mesh; }
export const beginWorld = (id) => { D2.cur = id; };

// clearance: min distance from the boat's swept segment (spline centre, y in [-.3, 2.3]) to any registered prop point, per world
window.D2clear = (pathOf) => { const res = {}, v = new THREE.Vector3(), p = new THREE.Vector3(), tg = new THREE.Vector3();
  for (const pc of D2.pieces) { const P = pathOf(pc.world); let best = res[pc.world] || { d: 1e9, what: '' };
    for (const M of pc.mats) for (const q of pc.pr.pts) { v.copy(q).applyMatrix4(M);
      // nearest arc length by coarse + fine search (paths are gentle S-curves running +z)
      let s0 = 0, dm = 1e18; for (let s = 0; s <= P.length; s += 2) { P.pointAt(s, p); const d = (p.x - v.x) ** 2 + (p.z - v.z) ** 2; if (d < dm) { dm = d; s0 = s; } }
      if (dm > 900) continue; for (let s = Math.max(0, s0 - 2); s <= Math.min(P.length, s0 + 2); s += .1) { P.pointAt(s, p); const d = (p.x - v.x) ** 2 + (p.z - v.z) ** 2; if (d < dm) dm = d; }
      const dy = v.y > 2.3 ? v.y - 2.3 : v.y < -.3 ? -.3 - v.y : 0, d = Math.sqrt(dm + dy * dy);
      if (d < best.d) best = { d: +d.toFixed(2), what: pc.name, at: v.toArray().map(x => +x.toFixed(1)) }; }
    res[pc.world] = best; }
  return res; };

// ------------------------------------------------------------------ banks: rounded low boulders/mud beyond `off` m either side
export function banks(P, { color = '#4a4a3a', off = 10, every = 3.5, h = [.6, 2.2], seed = 1, w = [5, 9], s0 = -30, s1 = null, sides = [-1, 1] } = {}) {
  const r = mulberry(seed), end = (s1 ?? P.length + 30), list = [];
  for (let sa = s0; sa < end; sa += every) for (const side of sides) { const p = new THREE.Vector3(); P.sideAt(Math.max(0, Math.min(P.length, sa)), side * (off + 3 + r() * 3), 0, p);
    if (sa < 0 || sa > P.length) p.addScaledVector(P.tangentAt(sa < 0 ? 0 : P.length), sa < 0 ? sa : sa - P.length);
    const hh = h[0] + r() * (h[1] - h[0]), ww = w[0] + r() * (w[1] - w[0]); p.y = -.3; list.push({ p, ry: r() * TAU, s: new THREE.Vector3(ww * .5, hh, (w[0] + r() * (w[1] - w[0])) * .5) }); }
  const geo = new THREE.IcosahedronGeometry(1, 2), pa = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const n = 1 + .18 * Math.sin(v.x * 3.1 + v.z * 1.7) * Math.cos(v.y * 2.3 + v.x); v.multiplyScalar(n); if (v.y < 0) v.y *= .2; pa.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  return scatter({ name: 'banks', parts: [{ geometry: geo, material: new THREE.MeshStandardMaterial({ color, roughness: .95 }) }], pts: [] }, list, { check: false });
}

// ------------------------------------------------------------------ the lotus road (ALL worlds): two rows `side` m either side of the spline, every `every` m.
// Instanced: leaf body (lotus_lantern) + an emissive bulb in the bud. Exposed for wake effects:
//   road.items[i] = { s, side, pos (world, y = 0) }, road.bulbs (InstancedMesh, per-instance colour), road.glow[i] (0..1 extra light any effect may set each frame),
//   road.level(i, t, sBoat) -> the base light level (10% asleep, 100% once the bow lantern has passed; marsh waits for lanternOn).
export async function lanternRoad(ctx, P, { every = 7, side = 2.5, color = '#ffc66e', s0 = 4, s1 = null, world = '', gate = null } = {}) {
  const items = [], end = s1 ?? P.length - 2;
  for (let s = s0; s < end; s += every) for (const sd of [-1, 1]) { const pos = P.sideAt(s, sd * (world ? lotusSide(world, s) : side), 0);   /* GAME: wider per-world lane */ items.push({ s, side: sd, pos, ry: hsh(items.length, 3) * TAU }); }
  const pr = await proto('lotus_lantern', { w: .8, far: true, standIn: [.8, .3, .8], color: '#7a8a5a', rough: .8 });
  const g = new THREE.Group(); g.name = 'lotusRoad';
  const body = scatter(pr, items.map(it => ({ p: it.pos, ry: it.ry })), { name: 'lotus', check: false }); g.add(body);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(.075, 12, 8).scale(1, 1.4, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), items.length);
  bulbs.name = 'lotusBulbs'; bulbs.frustumCulled = false; g.add(bulbs);
  const bud = pr.standIn ? .2 : pr.size.y * .82, base = col(color), cc = new THREE.Color(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const glow = new Float32Array(items.length);
  const level = (i, t, sBoat) => { const L = items[i]; return (gate ? gate(t) : 1) * sst(L.s - 2.2, L.s - .4, sBoat); };     // the bow lantern is ~2 m ahead of the boat centre
  const road = { group: g, items, bulbs, glow, level, color: base,
    update(t, sBoat) { const bob = (i) => .025 * Math.sin(t * 1.1 + i * 1.7);
      for (let i = 0; i < items.length; i++) { const L = items[i], k = Math.min(1, .1 + .9 * level(i, t, sBoat) + glow[i]);
        cc.copy(base).multiplyScalar(k * 6 * (1 + .04 * Math.sin(t * 9 + i)));
        p.copy(L.pos); p.y = bud + bob(i); bulbs.setMatrixAt(i, m.compose(p, q, sc)); bulbs.setColorAt(i, cc);
        p.y = bob(i); body.children.forEach(im => { im.setMatrixAt(i, m.compose(p, q.setFromAxisAngle(UP, L.ry), sc)); }); q.identity(); }
      bulbs.instanceMatrix.needsUpdate = true; bulbs.instanceColor.needsUpdate = true; body.children.forEach(im => { im.instanceMatrix.needsUpdate = true; }); } };
  return road;
}
const UP = new THREE.Vector3(0, 1, 0);

// props scattered along the banks (both sides unless side is given), seeded. Returns xforms (feed to scatter)
export function along(P, { count = 6, off = [6, 12], side = 0, seed = 7, s0 = 0, s1 = null, scale = [1, 1], face = false } = {}) {
  const r = mulberry(seed), end = s1 ?? P.length, out = [];
  for (let i = 0; i < count; i++) { const sd = side || (r() < .5 ? -1 : 1), s = s0 + (i + r() * .8) / count * (end - s0), p = new THREE.Vector3();
    P.sideAt(Math.max(0, Math.min(P.length, s)), sd * (off[0] + r() * (off[1] - off[0])), 0, p); if (s < 0 || s > P.length) p.addScaledVector(P.tangentAt(s < 0 ? 0 : P.length), s < 0 ? s : s - P.length);
    out.push({ p, ry: face ? P.headingAt(Math.max(0, Math.min(P.length, s))) - sd * Math.PI / 2 + (r() - .5) * .5 : r() * TAU, s: scale[0] + r() * (scale[1] - scale[0]), side: sd, sArc: s }); }
  return out;
}

// motes: fireflies / petals / sparks drifting around the river line; awake ones glow brighter. HDR colour -> bloom.
export function motes(P, { count = 160, color = '#d8ff9a', size = .03, spread = 7, y = [.3, 3], seed = 3, glow = 6, fall = 0 } = {}) {
  const r = mulberry(seed), im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), count);
  const base = col(color), D = []; for (let i = 0; i < count; i++) { const s = r() * P.length; const p = P.sideAt(s, (r() * 2 - 1) * spread, y[0] + r() * (y[1] - y[0])); D.push({ s, p, ph: r() * TAU, f: .3 + r() * .7 }); }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  im.frustumCulled = false;
  return { mesh: im, update(t, sBoat) { D.forEach((d, i) => { const w = .15 + .85 * wake(d.s, sBoat, 6, 6);
    p.set(d.p.x + .5 * Math.sin(t * d.f + d.ph), d.p.y + .3 * Math.sin(t * d.f * 1.3 + d.ph * 2), d.p.z + .5 * Math.cos(t * d.f * .8 + d.ph));
    if (fall) p.y = ((d.p.y - fall * t * d.f) % 6 + 6) % 6 + .2;
    const pulse = .6 + .4 * Math.sin(t * 3 * d.f + d.ph); sc.setScalar(size * (.7 + .3 * pulse)); im.setMatrixAt(i, m.compose(p, q, sc)); im.setColorAt(i, c.copy(base).multiplyScalar(glow * w * pulse)); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; } };
}

// arc length of the boat at time t in a world (closed form, same schedule main.js uses)
export function sAtTime(ctx, world, t) { let g = null, first = null, endOf = {};
  for (const sh of ctx.SHOTS.shots) { const b = sh.boat || {}, v0 = b.speed ?? 1.2, v1 = b.speed1 ?? v0, D = sh.t1 - sh.t0, s0 = b.s0 ?? endOf[sh.world] ?? 0;
    const seg = { t0: sh.t0, t1: sh.t1, s0, v0, v1, D }; endOf[sh.world] = s0 + (v0 + v1) * .5 * D; if (sh.world !== world) continue; first = first || seg; if (t >= sh.t0) g = seg; }
  if (!g) return first ? first.s0 : 0; const dt = Math.max(0, Math.min(t - g.t0, g.D)); return g.s0 + g.v0 * dt + .5 * (g.v1 - g.v0) / g.D * dt * dt; }

// ------------------------------------------------------------------ river coordinates + camera keep-out zones
// riverCoords(P, v) -> { s, lat } (lat > 0 = boat's left). camZones: for every shot of a world, the arc-length window and the lateral
// position of its camera; blocked() keeps low props out of the strip between that camera and the boat (nothing between camera and heroine).
export function riverCoords(P, v) { const p = new THREE.Vector3(); let sb = 0, dm = 1e18;
  for (let s = -40; s <= P.length + 40; s += 1) { onPath(P, s, p); const d = (p.x - v.x) ** 2 + (p.z - v.z) ** 2; if (d < dm) { dm = d; sb = s; } }
  for (let s = sb - 1; s <= sb + 1; s += .05) { onPath(P, s, p); const d = (p.x - v.x) ** 2 + (p.z - v.z) ** 2; if (d < dm) { dm = d; sb = s; } }
  onPath(P, sb, p); const h = P.headingAt(Math.max(0, Math.min(P.length, sb))); return { s: sb, lat: (v.x - p.x) * Math.cos(h) - (v.z - p.z) * Math.sin(h) }; }
// point on the river line, extended straight past both ends
export function onPath(P, s, out = new THREE.Vector3()) { const c = Math.max(0, Math.min(P.length, s)); P.pointAt(c, out); if (c !== s) out.addScaledVector(P.tangentAt(c), s - c); return out; }
export function sidePt(P, s, lat, y = 0, out = new THREE.Vector3()) { onPath(P, s, out); const h = P.headingAt(Math.max(0, Math.min(P.length, s))); return out.set(out.x + Math.cos(h) * lat, y, out.z - Math.sin(h) * lat); }
export const headAt = (P, s) => P.headingAt(Math.max(0, Math.min(P.length, s)));
export function camZones(ctx, world, P) {
  const Z = [], kAt = (keys, u) => { if (keys.length === 1) return keys[0].p; let i = 0; while (i < keys.length - 2 && u > keys[i + 1].u) i++; const a = keys[i], b = keys[i + 1], f = Math.max(0, Math.min(1, (u - a.u) / (b.u - a.u || 1))); return a.p.map((x, k) => x + (b.p[k] - x) * f); };
  for (const sh of ctx.SHOTS.shots) { if (sh.world !== world || !sh.keys) continue; let z = null;
    const sp = sh.space || 'boat'; if (sp === 'tree') continue;                                  // finale tree-space cameras: open lake, nothing to keep out
    for (const u of [0, .25, .5, .75, 1]) { const t = sh.t0 + u * (sh.t1 - sh.t0), s = sAtTime(ctx, world, t), k = kAt(sh.keys, u); let v;
      const sf = sp === 'lock' ? sAtTime(ctx, world, sh.t0 + (sh.lockU ?? .5) * (sh.t1 - sh.t0)) : s;
      if (sp === 'world') v = new THREE.Vector3(...k); else { const h = headAt(P, sf), p = onPath(P, sf); v = new THREE.Vector3(p.x + k[0] * Math.cos(h) + k[2] * Math.sin(h), k[1], p.z - k[0] * Math.sin(h) + k[2] * Math.cos(h)); }
      const rc = riverCoords(P, v); z = z || { name: sh.name, s0: 1e9, s1: -1e9, lat: 0, y: 0 }; z.s0 = Math.min(z.s0, s - 14, rc.s - 6); z.s1 = Math.max(z.s1, s + 14, rc.s + 6);
      if (Math.abs(rc.lat) > Math.abs(z.lat)) z.lat = rc.lat; z.y = Math.max(z.y, v.y); }
    if (z) Z.push(z); }
  D2.notes.push({ world, zones: Z.map(z => [z.name, +z.s0.toFixed(1), +z.s1.toFixed(1), +z.lat.toFixed(1)]) });
  return Z;
}
// true if a low prop at (s, lat) with radius r would stand between a camera of this world and the boat
export const blocked = (Z, s, lat, r = 1) => Z.some(z => Math.abs(z.lat) > 1.2 && s > z.s0 && s < z.s1 && Math.sign(lat) === Math.sign(z.lat) && Math.abs(lat) - r < Math.abs(z.lat) + 1.2);

export const UPV = new THREE.Vector3(0, 1, 0);
// a bowl / socket anchor on a proto (local metres): centroid of the vertices in the height band [a, b] x height (front half only if front),
// at the top of that band. Used for the waymarker and statue bowls the wake pass lights.
export function bowlAnchor(pr, a, b, front = false) {
  const H = pr.size.y, c = new THREE.Vector3(); let n = 0, top = 0; const zs = [];
  for (const v of pr.pts) if (v.y > a * H && v.y < b * H) zs.push(v.z); zs.sort((x, y) => x - y); const zm = zs.length ? zs[zs.length >> 1] : 0;
  for (const v of pr.pts) if (v.y > a * H && v.y < b * H && (!front || v.z > zm)) { c.add(v); n++; top = Math.max(top, v.y); }
  if (!n) return new THREE.Vector3(0, b * H, 0); c.divideScalar(n); c.y = top; return c;
}
// arch helpers (local metres of a proto): top of the floor slab between the legs, and the clear span between the legs in a height band
export function slabTop(pr, frac = .18) { const W = pr.size.x, H = pr.size.y; let t = 0; for (const v of pr.pts) if (Math.abs(v.x) < frac * W && v.y < .35 * H) t = Math.max(t, v.y); return t; }
// clear opening between the legs in a height band: walk out from x = 0 over 0.25 m bins until a bin holds >= 3 sample points (stray vines ignored)
export function innerSpan(pr, y0, y1, info = false) { const B = .25, n = Math.ceil(pr.size.x / B) + 4, c = new Int32Array(n), o = n >> 1;
  for (const v of pr.pts) if (v.y > y0 && v.y < y1) { const i = o + Math.floor(v.x / B); if (i >= 0 && i < n) c[i]++; }
  let a = o, b = o; while (a > 0 && c[a - 1] < 3) a--; while (b < n - 1 && c[b] < 3) b++; const L = (a - o) * B, R = (b - o) * B;
  return info ? { span: R - L, mid: (L + R) / 2 } : R - L; }
export function archTop(pr, half = 1.5) { let m = 1e9; for (const v of pr.pts) if (Math.abs(v.x) < half && v.y > pr.size.y * .3) m = Math.min(m, v.y); return m; }   // underside of the crown over the centre
// sight lines camera -> heroine for every shot of a world (sampled every .25 of the shot). hides(pos, r, y0, y1): true if a prop standing at pos
// (radius r, heights y0..y1) would cut one of them, i.e. would stand between a camera and her.
export function sightLines(ctx, world, P) {
  const L = [], kAt = (keys, u) => { if (keys.length === 1) return keys[0].p; let i = 0; while (i < keys.length - 2 && u > keys[i + 1].u) i++; const a = keys[i], b = keys[i + 1], f = Math.max(0, Math.min(1, (u - a.u) / (b.u - a.u || 1))); return a.p.map((x, k) => x + (b.p[k] - x) * f); };
  for (const sh of ctx.SHOTS.shots) { if (sh.world !== world || !sh.keys) continue; const sp = sh.space || 'boat'; if (sp === 'tree' || sp === 'world') continue;
    for (const u of [0, .25, .5, .75, 1]) { const t = sh.t0 + u * (sh.t1 - sh.t0), s = sAtTime(ctx, world, t), k = kAt(sh.keys, u);
      const sf = sp === 'lock' ? sAtTime(ctx, world, sh.t0 + (sh.lockU ?? .5) * (sh.t1 - sh.t0)) : s, h = headAt(P, sf), p = onPath(P, sf);
      const C = new THREE.Vector3(p.x + k[0] * Math.cos(h) + k[2] * Math.sin(h), k[1], p.z - k[0] * Math.sin(h) + k[2] * Math.cos(h)), H = onPath(P, s).setY(1.3); L.push([C, H, sh.name]); } }
  return { lines: L, hides(pos, r, y0 = 0, y1 = 99) { for (const [C, H] of L) { const dx = H.x - C.x, dz = H.z - C.z, l2 = dx * dx + dz * dz || 1;
      const f = Math.max(0, Math.min(1, ((pos.x - C.x) * dx + (pos.z - C.z) * dz) / l2)); if (f > .97) continue;   // at her own position: not between
      const y = C.y + (H.y - C.y) * f, d = Math.hypot(C.x + dx * f - pos.x, C.z + dz * f - pos.z); if (d < r + .4 && y > y0 - .3 && y < y1 + .3) return true; } return false; } };
}
