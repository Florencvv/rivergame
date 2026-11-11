// Stage E1 Drowned Court fx: white marble in broken sun (albedo normalised, sun cookie, sky lift, crawling caustics), bowl fires that throw gold caustics
// on the hooded faces, white flowers spiralling up every pillar, falling petals, the glowing fish comet + starburst under the hull, arch drips with rings,
// the gold leaf mosaic glinting under the water, one shaft over the river that she crosses (shot 6), white birds through it. Pure in t.
import { THREE, KT, sprites, wakeTimer, rings, fires, lotusFx, makeBird, patch, meanLum, lin, mulberry, s5, sst, hsh, TAU, clamp } from './e1kit.js';
import { sidePt, headAt } from '../worlds/common.js';
let lotus, fish, flare, birds = [], BD = [], UF, UH, UCk = { value: 1 }, WT, SHAFT = null, BURST = 18.85, P0;
const SUN = new THREE.Vector3(.35, .9, .25).normalize();
// columns of a colonnade proto: clusters of mid-height points in plan
function columnsOf(pr) {
  const H = pr.size.y, G = .5, cells = new Map(); for (const p of pr.pts) if (p.y > .3 * H && p.y < .55 * H) { const k = Math.round(p.x / G) + ',' + Math.round(p.z / G); (cells.get(k) || cells.set(k, []).get(k)).push(p); }
  const seen = new Set(), out = [];
  for (const k0 of cells.keys()) { if (seen.has(k0)) continue; const st = [k0], pts = []; seen.add(k0);
    while (st.length) { const k = st.pop(); pts.push(...cells.get(k)); const [x, z] = k.split(',').map(Number); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const q = (x + dx) + ',' + (z + dz); if (cells.has(q) && !seen.has(q)) { seen.add(q); st.push(q); } } }
    if (pts.length < 3) continue; let cx = 0, cz = 0; pts.forEach(p => { cx += p.x; cz += p.z; }); cx /= pts.length; cz /= pts.length; let rr = 0; pts.forEach(p => { rr = Math.max(rr, Math.hypot(p.x - cx, p.z - cz)); });
    if (rr < 1.3) out.push({ x: cx, z: cz, r: clamp(rr, .25, .8) }); }
  if (out.length < 2) { out.length = 0; for (let x = -4.5; x <= 4.6; x += 2.25) out.push({ x, z: 0, r: .45 }); }
  return out;
}
const MARBLE = (bowl) => ({
  vhead: bowl ? 'attribute vec4 aBowl; varying vec4 vBowl;' : '', vbody: bowl ? 'vBowl = aBowl;' : '', fhead: 'uniform float eMean, eCk; uniform vec3 eSun;' + (bowl ? 'varying vec4 vBowl;' : ''),
  fmap: `{ float mL = dot(diffuseColor.rgb, vec3(.3, .59, .11)) / eMean; vec3 mb = mix(vec3(.80, .85, .88), vec3(1., .985, .95), smoothstep(.4, 1.3, mL)) * clamp(.52 + .5 * mL, .45, 1.06);
      mb *= .94 + .1 * eVn(vMW.xy * 1.7 + vMW.z * 1.1); diffuseColor.rgb = mix(mb, diffuseColor.rgb / max(eMean * 2.4, .05), .1); }`,
  femis: `{ vec3 n = normalize(vMN); float my = vMW.y; if (uUWk.w > .5) { n.y = -n.y; my = -my; } vec3 wp = vec3(vMW.x, my, vMW.z); vec3 L = normalize(eSun); float ndl = max(dot(n, L), 0.);
      vec3 q = wp - L * dot(wp, L); float ck = smoothstep(.3, .56, eVn(q.xz * .13 + 3.7));                     // the sun arrives in broken shafts
      totalEmissiveRadiance += diffuseColor.rgb * (vec3(.2, .29, .35) * (.65 + .35 * n.y) + vec3(1., .92, .78) * (.22 + .78 * ndl) * (.06 + 1.5 * ck)) * step(0., my);
      float ca = eCaust(wp.xz * .9 + my * .7, eT * 1.6) + eCaust(wp.zx * .6 - my * .5, eT * 1.1);
      totalEmissiveRadiance += vec3(.5, .95, .88) * ca * .55 * eCk * exp(-max(my, 0.) * .28) * (1. - .7 * max(n.y, 0.)) * step(0., my);
      ${bowl ? `vec3 d = vBowl.xyz - wp; float r2 = dot(d, d), ts = eT - vBowl.w, on = eQ5(0., .6, ts) * (1. + 1.5 * exp(-max(ts, 0.) * 2.2));
      float lam = max(dot(n, normalize(d)) * .65 + .35, 0.), c2 = eCaust(vec2(wp.x + wp.z, my) * 2.2, eT * 2.4);
      totalEmissiveRadiance += vec3(1., .64, .24) * on * (.85 + .15 * sin(eT * 13. + vBowl.x)) * lam * (.6 + 1.8 * c2) * 6. / (1. + r2 * .8);` : ''} }` });
export function marble(ctx, mat, bowl = false) { if (mat.userData.e1) return; mat.userData.e1 = 1; patch(ctx, mat, { ...MARBLE(bowl), uniforms: { eMean: { value: mat.map ? Math.max(.04, meanLum(mat.map)) : .8 }, eCk: UCk, eSun: { value: SUN } } }); }
// scripted ignition of the guardians' bowls (shot 7 looks back at them): far pair first, the fire walks after her
export const bowlTime = (ctx, i) => { const sh = ctx.SHOTS.shots.find(x => x.name.startsWith('07')) || { t0: 15 }; return sh.t0 + .35 + i * .4; };

export function build(ctx, g, { arch, cols, stat, stone, mos, bowls, ARCH, road }) {
  const P = P0 = ctx.path, r = mulberry(1701), v = new THREE.Vector3(); WT = wakeTimer(ctx, 'ruins');
  // ---- white marble
  for (const grp of [arch, cols]) grp.children.forEach(im => marble(ctx, im.material)); marble(ctx, stone);
  const order = bowls.map((b, i) => i).sort((a, b) => bowls[a].s - bowls[b].s), tB = []; order.forEach((bi, k) => { tB[bi] = bowlTime(ctx, k); });
  stat.children.forEach(im => { const a = new Float32Array(im.count * 4); for (let i = 0; i < im.count; i++) { const b = bowls[i]; if (b) a.set([b.pos.x, b.pos.y + .3, b.pos.z, tB[i]], i * 4); else a.set([0, -99, 0, 1e3], i * 4); }
    im.geometry.setAttribute('aBowl', new THREE.InstancedBufferAttribute(a, 4)); marble(ctx, im.material, true); });
  g.add(fires(ctx, bowls.map((b, i) => ({ pos: b.pos.clone().setY(b.pos.y + .1), tW: tB[i], size: 1.8 })), { name: 'bowlFires', glow: 4. }));
  // ---- white flowers spiral up every pillar (a beat after the wake front), buds before
  { const CL = columnsOf(cols.userData.proto), H = cols.userData.proto.size.y, L = [];
    for (const M of cols.userData.mats) { for (const c of CL) { const base = v.set(c.x, 0, c.z).applyMatrix4(M).clone(), tW = WT(base), a0 = r() * TAU, dir = r() < .5 ? -1 : 1;
      for (let k = 0; k < 30; k++) { const y = H * (.04 + .8 * (k + r() * .6) / 30), a = a0 + dir * y * 1.5, rr = c.r + .07; v.set(c.x + Math.cos(a) * rr, y, c.z + Math.sin(a) * rr).applyMatrix4(M); if (v.y < .25) continue;
        L.push([v.x, v.y, v.z, tW + .9 + v.y * .16 + r() * .25, r(), r(), .2 + .14 * r(), 0]); } } }
    const n = L.length, A = new Float32Array(n * 4), B = new Float32Array(n * 4); L.forEach((c, i) => { A.set(c.slice(0, 4), i * 4); B.set(c.slice(4), i * 4); });
    g.add(sprites(ctx, { n, A, B, additive: false, order: 1, name: 'flowers',
      vs: `float ts = uT - aA.w, op = q5(0., .55, ts), pop = 1. + .35 * exp(-max(ts, 0.) * 4.) * step(0., ts); S = vec2(aB.z * (.22 + .78 * op) * pop); R = aB.x * 6.283 + .15 * sin(uT * 1.3 + aB.y * 20.); Z = .12; P = vec4(op, aB.y, 0., 0.);`,
      fs: `float d = length(uv), a = atan(uv.y, uv.x), pet = .55 + .42 * abs(cos(a * 2.5)); float op = vP.x; A = step(d, mix(.6, pet, op));
        vec3 wh = vec3(1.18, 1.16, 1.1) * (.82 + .18 * smoothstep(.2, .9, d)); col = mix(vec3(.5, .62, .36), wh, op); col = mix(col, vec3(1.3, .95, .3), op * smoothstep(.24, .16, d));
        col *= .92 + .08 * cos(a * 5.);` }));
    window.E1 = Object.assign(window.E1 || {}, { columns: CL.length, flowers: n }); }
  // ---- petals falling in the woken court
  { const N = 520, A = new Float32Array(N * 4), B = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { const s = -26 + r() * 62, p = sidePt(P, s, (r() * 2 - 1) * 11, 0); A.set([p.x, 2 + r() * 8, p.z, WT(p) + 1.6 + r() * 2], i * 4); B.set([r(), r(), r(), 0], i * 4); }
    g.add(sprites(ctx, { n: N, A, B, additive: false, order: 1, name: 'petals',
      vs: `float ts = uT - aA.w, top = aA.y, f = .45 + .3 * aB.x, y = top - mod(ts * f, top); C.y = y; C.x += .5 * sin(ts * .9 + aB.y * 40.) ; C.z += .5 * cos(ts * .7 + aB.z * 40.);
        float th = ts * (2. + 2. * aB.y) + aB.x * 9.; ori = 1.; AX = normalize(vec3(cos(th), .4 * sin(th * .7), sin(th))); AY = normalize(cross(AX, vec3(sin(th * .6), cos(th * .6), .3)));
        S = vec2(.085, .06) * (.7 + .6 * aB.z) * step(0., ts) * smoothstep(top, top - .6, y) * smoothstep(0., .25, y); K = vec4(1.2, 1.17, 1.1, 1.);`,
      fs: `A = step(length(uv), 1.); col = vK.rgb * (.85 + .15 * uv.x);` })); }
  // ---- glowing fish: a comet tail under the hull behind the lantern, then a starburst
  { const N = 170, A = new Float32Array(N * 4), B = new Float32Array(N * 4); for (let i = 0; i < N; i++) { A.set([r(), r(), r(), r()], i * 4); B.set([r(), r(), r(), r()], i * 4); }
    UF = { value: new THREE.Matrix4() }; const sh8 = ctx.SHOTS.shots.find(x => x.name.startsWith('08')); if (sh8) BURST = sh8.t0 + .85;
    fish = sprites(ctx, { n: N, A, B, order: -6, mirror: 1, name: 'fish', uniforms: { uF: UF, uBt: { value: BURST } }, head: 'uniform mat4 uF; uniform float uBt;',
      vs: `float tb = uT - uBt, lag = mod(aA.x * 7. - uT * .55, 7.), ed = smoothstep(0., .5, lag) * smoothstep(7., 5., lag); float wd = .1 + .13 * lag;
        vec3 pb = vec3((aA.y - .5) * 2. * wd + .1 * sin(uT * 5. + lag * 2.4 + aA.z * 6.283), -.42 - .55 * aA.w - .05 * lag, 1.7 - lag);
        vec3 dir = vec3(.35 * cos(uT * 5. + lag * 2.4 + aA.z * 6.283), 0., 1.); float len = 1., glow = 1.;
        if (tb > 0.) { float ang = aB.x * 6.283, e = 1. - exp(-3.4 * tb); vec3 rd = vec3(cos(ang), 0., sin(ang)); pb += rd * (2.2 + 4.5 * aB.y) * e + vec3(0., -.25 * e, 0.); dir = mix(dir, rd, min(1., tb * 9.)); len = 1. + 3.2 * exp(-tb * 3.5); glow = (1. + 2.4 * exp(-tb * 5.)) * (1. - q5(.55, 1.15, tb)); ed = mix(ed, 1., min(1., tb * 6.)); }
        dir = normalize(dir); mat3 Rb = mat3(uF); C = (uF * vec4(pb, 1.)).xyz; ori = 1.; AX = Rb * dir; AY = Rb * vec3(dir.z, 0., -dir.x); S = vec2(.3 * len, .085) * (.6 + .7 * aB.z);
        vec3 cc = mix(vec3(.45, 1., .9), vec3(1., .8, .4), step(.8, aB.w) + .35 * smoothstep(2.5, 0., lag) * (1. - step(0., tb))); K = vec4(cc * 7.5 * ed * glow * q5(uBt - 4.4, uBt - 3.2, uT), 1.);`,
      fs: `float x = uv.x, y = uv.y; float body = exp(-y * y * 5.) * smoothstep(-1., -.2, x) * smoothstep(1., .55, x); A = body * (.35 + .65 * smoothstep(-.6, .7, x)) + .5 * exp(-dot(uv - vec2(.5, 0.), uv - vec2(.5, 0.)) * 14.);` });
    g.add(fish); }
  // ---- drips from the arch + colonnades: a falling streak, a splash spark, a ring
  { const sites = []; if (ARCH) { const h = headAt(P, ARCH.s); for (let i = 0; i < 9; i++) { const la = (r() * 2 - 1) * ARCH.span * .55, ds = (r() * 2 - 1) * 2.2; sites.push(sidePt(P, ARCH.s + ds, la, 0)); } }
    cols.userData.mats.forEach((M, i) => { v.setFromMatrixPosition(M); const pc = ctx.look.pathCoords('ruins', v.x, v.z); if (Math.abs(pc.lat) > 12.5 || hsh(i, 8) < .35) return; sites.push(sidePt(P, pc.s + (r() - .5) * 6, pc.lat - Math.sign(pc.lat) * (1.6 + r() * 1.5), 0)); });
    const RL = [], n = sites.length, A = new Float32Array(n * 8), B = new Float32Array(n * 8);
    sites.forEach((p, i) => { const per = 1.4 + r() * 2.2, t0 = r() * per; RL.push({ x: p.x, z: p.z, t0, period: per, life: Math.min(per, 1.5), R: .75 + .4 * r(), k: 1.1 }); RL.push({ x: p.x, z: p.z, t0: t0 + .22, period: per, life: Math.min(per, 1.3), R: .4, k: .7 });
      for (let k = 0; k < 2; k++) { A.set([p.x, p.z, t0, per], (i * 2 + k) * 4); B.set([k, r(), 0, 0], (i * 2 + k) * 4); } });
    g.add(rings(ctx, RL, { color: '#eafff8', name: 'dripRings', w: .022 }));
    g.add(sprites(ctx, { n: n * 2, A, B, order: 4, name: 'drips',
      vs: `float age = mod(uT - aA.z, aA.w), tr = aA.w - age; C = vec3(aA.x, 0., aA.y);
        if (aB.x < .5) { float y = 13. * tr + 4.9 * tr * tr; C.y = y + .22; S = vec2(.022, .5) * step(tr, .5); K = vec4(vec3(.9, 1., .98) * 2.2, 1.); }
        else { C.y = .06 + .5 * age; S = vec2(.3 * (1. - age / .3)) * step(age, .3); K = vec4(vec3(1., 1., .95) * 5. * (1. - age / .3), 1.); } P.x = aB.x;`,
      fs: `A = vP.x < .5 ? exp(-uv.x * uv.x * 6.) * smoothstep(1., .2, abs(uv.y)) : pow(max(0., 1. - length(uv)), 2.) + max(0., 1. - abs(uv.x) * 7.) * max(0., 1. - abs(uv.y)) + max(0., 1. - abs(uv.y) * 7.) * max(0., 1. - abs(uv.x));` })); }
  // ---- the gold leaf under the water: gold that survives the depth tint + glinting tesserae
  if (mos) { const m = mos.material; m.emissiveMap = m.map; m.emissive = new THREE.Color(1, 1, 1); m.emissiveIntensity = 1;
    patch(ctx, m, { femis: `{ vec3 tx = diffuseColor.rgb; float gold = smoothstep(.02, .14, tx.r - tx.b * 1.25); vec2 tl = floor(vMapUv * 1024. / 12.); float h = fract(sin(dot(tl, vec2(127.1, 311.7))) * 43758.5453);
        float tw = pow(max(0., sin(eT * (1.2 + 2.6 * h) + h * 40.)), 18.); totalEmissiveRadiance = tx * mix(vec3(.9), vec3(8., 4.6, 1.1), gold) + gold * vec3(1., .78, .3) * tw * 30.; }` }); }
  // ---- one shaft of sun over the river (shot 6 crosses it), its pool of light on the water, and the white-gold flare on her
  { const sh6 = ctx.SHOTS.shots.find(x => x.name.startsWith('06')); const tX = sh6 ? sh6.t0 + .56 * (sh6.t1 - sh6.t0) : 13.7, sX = WT.sAt(tX); SHAFT = { t: tX, s: sX, p: sidePt(P, sX, 0, 0) };
    const A = new Float32Array(8), B = new Float32Array(8); A.set([SHAFT.p.x, 0, SHAFT.p.z, 0, SHAFT.p.x, .015, SHAFT.p.z, 1]);
    g.add(sprites(ctx, { n: 2, A, B, order: 5, name: 'riverShaft', uniforms: { eSun: { value: SUN } }, head: 'uniform vec3 eSun;',
      vs: `P.x = aA.w; if (aA.w < .5) { vec3 L = normalize(eSun); C += L * 17.; vec4 wq = modelMatrix * vec4(C, 1.); ori = 1.; AY = L; AX = normalize(cross(L, normalize(C - cameraPosition))); S = vec2(5., 34.); K = vec4(vec3(1., .96, .84) * 1.1, 1.); }
        else { ori = 1.; AX = vec3(1., 0., 0.); AY = vec3(0., 0., 1.); S = vec2(7.); K = vec4(vec3(1., .95, .8) * .9, 1.); }`,
      fs: `if (vP.x < .5) { float a = pow(max(0., 1. - uv.x * uv.x), 1.6), dust = .55 + .45 * vn(vec2(uv.x * 3. + 7., uv.y * 22. - uT * .12)) * (.6 + .8 * vn(vec2(uv.x * 9., uv.y * 60. + uT * .2)));
          A = a * dust * smoothstep(1., .1, uv.y) * smoothstep(-1., -.94, uv.y) * (uUWk.w > .5 ? 0. : 1.); } else { A = pow(max(0., 1. - length(uv)), 1.5) * (uUWk.w > .5 ? 0. : 1.); }` }));
    UH = { a: { value: new THREE.Vector3() }, b: { value: new THREE.Vector3() }, k: { value: 0 } }; const A2 = new Float32Array(8); A2[3] = 0; A2[7] = 1;
    flare = sprites(ctx, { n: 2, A: A2, order: 7, name: 'shaftFlare', uniforms: { uA: UH.a, uB: UH.b, uK: UH.k }, head: 'uniform vec3 uA, uB; uniform float uK;',
      vs: `P.x = aA.w; if (aA.w < .5) { C = uA; S = vec2(3.4 * step(.01, uK)); K = vec4(vec3(1., .93, .74) * .55 * uK, 1.); Z = .5; } else { C = uB; S = vec2(2.2 * step(.01, uK)); K = vec4(vec3(1., .88, .6) * 2.6 * uK, 1.); Z = .3; }`,
      fs: `float d = length(uv); A = vP.x < .5 ? pow(max(0., 1. - d), 2.) : pow(max(0., 1. - d), 4.) + exp(-abs(uv.y) * 60.) * pow(max(0., 1. - abs(uv.x)), 2.) * .6 + exp(-abs(uv.x) * 60.) * pow(max(0., 1. - abs(uv.y)), 2.) * .35;` }); g.add(flare);
    // white birds crossing the shaft, under the arch
    for (let i = 0; i < 5; i++) { const b = makeBird({ span: 1.25, emissive: '#fff8ea', wingGlow: 1.1 }); b.g.rotation.order = 'YXZ'; birds.push(b); g.add(b.g);
      BD.push({ t0: tX + .15 - i * .17 - r() * .1, lat: 1.2 + (i % 3) * 1.5 + r(), y: 7.5 + (i * 1.37 % 3.2), v: 8.5 + r() * 1.5, ph: r() * TAU }); } }
  lotus = lotusFx(ctx, road, WT); g.add(lotus.halo);
  return { WT };
}
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
export function update(ctx, t) {
  KT.value = t; lotus.update(t); const fr = ctx.now.boat.frame; UF.value.compose(fr.pos, fr.quat, ONE); fish.visible = t > BURST - 4.5 && t < BURST + 1.2;
  UCk.value = .55 + .45 * s5(WT.t0 + .5, WT.t0 + 3.5, t);
  if (SHAFT) { const k = Math.exp(-Math.pow((ctx.now.s - SHAFT.s) / 1.15, 2)); UH.k.value = k; flare.visible = k > .01; if (flare.visible) { const A = ctx.anchors(t); UH.a.value.copy(A.hero).setY(A.hero.y - .45); UH.b.value.copy(A.lantern); }
    BD.forEach((d, i) => { const b = birds[i], s = SHAFT.s - (t - d.t0) * d.v, y = d.y + .5 * Math.sin(t * .9 + d.ph); sidePt(P0, s, d.lat + .6 * Math.sin(t * .6 + d.ph), y, _p); b.g.position.copy(_p);
      b.g.rotation.set(0, headAt(P0, clamp(s, 0, P0.length)) + Math.PI, 0); b.pose(d.ph + t * TAU * 2.9, 0); b.g.visible = t < WT.t0 + 3.6; }); }
}
