// Stage E1 hook fx (shots 1-2): the leaf murmuration that tiles itself into the hull + the lantern ignition (flare, sparks, the gold flash rolling over the water).
// Pure in t: every leaf has a landing time taken from the hull's own reveal parameter (hero.js revP), so leaf and plank arrive together.
import { THREE, KT, sprites, lin, mulberry, s5, clamp } from './e1kit.js';
export const FLASH_T = 2.86, FLASH_V = 15;      // the ignition flash leaves the lantern at FLASH_T and rolls out at FLASH_V m/s
let leaves, glints, ign, ring, UB, UL, T1 = 2.3;
export function buildHook(ctx, g) {
  const boat = ctx.WORLD.getObjectByName('boat'), [r0, r1] = ctx.TL.boatReveal, r = mulberry(1501); T1 = r1 + .5;
  UB = { value: new THREE.Matrix4() }; UL = { value: new THREE.Vector3() };
  // ---- targets on the real hull: boat-space position + the time the reveal edge reaches it
  const N = 5200, A = new Float32Array(N * 4), B = new Float32Array(N * 4), hull = [];
  if (boat) { boat.updateMatrixWorld(true); boat.traverse(o => { if (o.isMesh && o.material && o.material.onBeforeCompile && String(o.material.onBeforeCompile).includes('uRev')) hull.push(o); }); }
  const inv = boat ? new THREE.Matrix4().copy(boat.matrixWorld).invert() : new THREE.Matrix4(), bx = new THREE.Box3(), v = new THREE.Vector3(), M = new THREE.Matrix4();
  for (const o of hull) { o.geometry.computeBoundingBox(); bx.union(o.geometry.boundingBox); }
  const X0 = bx.min.x, XL = bx.max.x - bx.min.x || 1, Y0 = bx.min.y, YH = bx.max.y - bx.min.y || 1, tot = hull.reduce((n, o) => n + o.geometry.attributes.position.count, 0);
  for (let i = 0; i < N; i++) { let tl, a, b;
    if (tot) { let k = Math.floor(r() * tot), o = hull[0]; for (const h of hull) { const c = h.geometry.attributes.position.count; if (k < c) { o = h; break; } k -= c; }
      v.fromBufferAttribute(o.geometry.attributes.position, k); a = (v.y - Y0) / YH; b = (v.x - X0) / XL; v.applyMatrix4(M.multiplyMatrices(inv, o.matrixWorld)); }
    else { const u = r(); v.set((r() * 2 - 1) * .55 * Math.sin(Math.PI * u), .05 + r() * .4, -2 + 4 * u); a = v.y; b = u; }
    tl = r0 + clamp((.42 * a + .58 * b * b + .07) / 1.16) * (r1 - r0) - .02;
    A.set([v.x, v.y, v.z, tl], i * 4); B.set([r(), r(), r(), .065 + .06 * r()], i * 4); }
  const head = `uniform mat4 uBoatM;
    vec3 bez(vec3 a, vec3 b, vec3 c, vec3 d, vec3 e, float t){ vec3 ab = mix(a, b, t), bc = mix(b, c, t), cd = mix(c, d, t), de = mix(d, e, t); vec3 x = mix(ab, bc, t), y = mix(bc, cd, t), z = mix(cd, de, t); return mix(mix(x, y, t), mix(y, z, t), t); }
    vec3 flock(float t){ return bez(vec3(-5.5, 3.6, 10.), vec3(-3.2, .5, 1.5), vec3(2.6, 1.6, -4.2), vec3(-.6, 1.5, -.4), vec3(0., 2.1, 2.1), clamp((t + .75) / 2.85, 0., 1.)); }`;
  leaves = sprites(ctx, { n: N, A, B, additive: false, order: 1, name: 'hookLeaves', uniforms: { uBoatM: UB }, head,
    vs: `float tau = uT - aA.w, D = 1.0 + .5 * aB.x, u = clamp(1. + tau / D, 0., 1.), e = u * u * u * (u * (u * 6. - 15.) + 10.), w = 1. - e;
      float ft = uT - aB.y * 1.05; vec3 F = flock(ft); float br = 1. + .4 * sin(uT * 3.1 + aB.y * 9.);
      vec3 O = vec3(sin(aB.x * 40. + uT * 2.3), .6 * cos(aB.z * 37. + uT * 1.9), sin(aB.y * 51. + uT * 1.6)) * (.15 + .85 * aB.z * aB.z) * br * .5;
      vec3 pb = mix(F + O, aA.xyz, e); float sw = aB.x * 6.283 + w * 7.;
      pb += vec3(cos(sw), .35 * sin(aB.z * 6.283 + w * 5.), sin(sw)) * .55 * (4. * w * e);
      pb.y = mix(max(pb.y, .06 + .1 * aB.z), pb.y, e * e);
      float th = aB.x * 6.283 + uT * (4. + 3. * aB.z) * w, ph = aB.y * 6.283 + uT * (3. + 2. * aB.x) * w;
      vec3 nn = vec3(sin(th) * cos(ph), cos(th), sin(th) * sin(ph)), ln = normalize(vec3(aA.x * 1.5 + .001, .6, .0)); nn = normalize(mix(nn, ln, e * e));
      vec3 lx = normalize(cross(nn, vec3(cos(ph * 1.3), .2, sin(ph * 1.3)))); mat3 Rb = mat3(uBoatM);
      C = (uBoatM * vec4(pb, 1.)).xyz; ori = 1.; AY = Rb * lx; AX = Rb * cross(lx, nn); float sz = aB.w * (1. - q5(.0, .24, tau));
      S = vec2(sz * .6, sz); K = vec4(Rb * nn, 1.); P = vec4(aB.z, e, tau, aB.x);`,
    fs: `float v = uv.y * .5 + .5, wd = .66 * pow(sin(3.14159 * pow(v, .8)), .9); A = step(abs(uv.x), wd);
      vec3 n = normalize(vK.xyz), L = normalize(uSunF.xyz); if (uUWk.w > .5) { L.y = -L.y; } vec3 V = normalize(vW - cameraPosition);
      float back = pow(max(dot(V, L), 0.), 3.), nl = abs(dot(n, L)), pi = floor(vP.x * 4.);
      vec3 alb = pi < 1. ? vec3(.62, .3, .04) : pi < 2. ? vec3(.36, .36, .05) : pi < 3. ? vec3(.5, .2, .03) : vec3(.8, .52, .1);
      float rib = smoothstep(.07, .0, abs(uv.x)) * .5 + smoothstep(.08, .0, abs(fract((v + abs(uv.x) * .7) * 5.) - .5)) * .25;
      col = alb * (.3 + .35 * nl) + alb * vec3(1., .8, .45) * (.45 + 2.6 * back) * (.3 + .7 * nl) * (1. - .55 * rib);
      col += vec3(1., .88, .62) * pow(abs(dot(n, normalize(L - V))), 60.) * 5.;` });
  glints = sprites(ctx, { n: N, A, B, order: 6, name: 'hookGlints', uniforms: { uBoatM: UB }, head: 'uniform mat4 uBoatM;',
    vs: `float tau = uT - aA.w; C = (uBoatM * vec4(aA.xyz, 1.)).xyz; S = vec2(.2 * (.5 + aB.x)) * step(0., tau) * step(tau, .45) * step(.6, aB.y); K = vec4(vec3(1., .85, .52) * 5. * exp(-tau * 10.), 1.); Z = .2; R = aB.z * 1.5;`,
    fs: `float d = length(uv), st = max(0., 1. - abs(uv.x) * 9.) * max(0., 1. - abs(uv.y)) + max(0., 1. - abs(uv.y) * 9.) * max(0., 1. - abs(uv.x)); A = pow(max(0., 1. - d), 3.) * .8 + st * st * .9;` });
  // ---- ignition: flare star + sparks at the lantern
  const NS = 90, A2 = new Float32Array((NS + 1) * 4), B2 = new Float32Array((NS + 1) * 4);
  for (let i = 1; i <= NS; i++) { const z = r() * 2 - 1, a = r() * 6.283, q = Math.sqrt(1 - z * z); A2.set([q * Math.cos(a), z * .6 + .25, q * Math.sin(a), 1], i * 4); B2.set([r(), .25 + r() * .9, .7 + r() * .9, r()], i * 4); }
  ign = sprites(ctx, { n: NS + 1, A: A2, B: B2, order: 7, name: 'hookIgnite', uniforms: { uL: UL, uIgn: { value: ctx.TL.lanternOn[0] } }, head: 'uniform vec3 uL; uniform float uIgn;',
    vs: `float tt = uT - uIgn; P.z = aA.w;
      if (aA.w < .5) { float k = q5(0., .26, tt) * (1. - q5(.3, 1.3, tt)); C = uL; S = vec2(.14 + .26 * k) * step(.001, k); K = vec4(vec3(1., .78, .45) * 1.6 * k, 1.); Z = .1; }
      else { float a = tt - .2 - aB.w * .3, u = a / aB.z; C = uL + aA.xyz * aB.y * .32 * (1. - exp(-3. * max(a, 0.))) + vec3(0., .05 * a, 0.);
        S = vec2(.004 + .005 * aB.x) * step(0., a) * step(u, 1.); K = vec4(vec3(1., .74, .38) * 6. * (1. - u) * (.6 + .4 * sin(uT * 30. + aB.x * 50.)), 1.); }`,
    fs: `float d = length(uv); if (vP.z < .5) { A = pow(max(0., 1. - d), 4.) + exp(-abs(uv.y) * 70.) * pow(max(0., 1. - abs(uv.x)), 2.) * .7 + exp(-abs(uv.x) * 70.) * pow(max(0., 1. - abs(uv.y)), 2.) * .4
        + exp(-abs(uv.x - uv.y) * 90.) * pow(max(0., 1. - d * 1.6), 2.) * .25 + exp(-abs(uv.x + uv.y) * 90.) * pow(max(0., 1. - d * 1.6), 2.) * .25; } else { A = smoothstep(1., .1, d); }` });
  // ---- the gold flash rolling out across the water (a ring of light on the mirror, centred under the lantern at FLASH_T)
  const A3 = new Float32Array(4), c0 = ctx.anchors(FLASH_T).lantern; A3.set([c0.x, .016, c0.z, 0]);
  ring = sprites(ctx, { n: 1, A: A3, order: 2, mirror: 0, name: 'hookFlash', uniforms: { uR: { value: new THREE.Vector4() }, uCol: { value: lin('#ffd27a') } }, head: 'uniform vec4 uR; uniform vec3 uCol;',
    vs: `ori = 1.; AX = vec3(1., 0., 0.); AY = vec3(0., 0., 1.); S = vec2(uR.z > 0. ? 160. : 0.); K = vec4(uCol * uR.z, 1.);`,
    fs: `float d = length(uv) * 80., e = (d - uR.x) / uR.y; A = exp(-e * e) + .22 * exp(-max(uR.x - d, 0.) * .3) * step(d, uR.x);` });
  g.add(leaves, glints, ign, ring);
  return { center: c0 };
}
// time the ignition flash reaches a world point (marsh fx uses it for the cattail glint)
export const flashAt = (ctx, pos) => { const c = ctx.anchors(FLASH_T).lantern; return FLASH_T + Math.hypot(pos.x - c.x, pos.z - c.z) / FLASH_V; };
export function updateHook(ctx, t) {
  KT.value = t; const b = ctx.now.boat; leaves.visible = glints.visible = t < T1;
  if (t < T1) UB.value.compose(b.pos, b.quat, ONE);
  ign.visible = t > ctx.TL.lanternOn[0] - .05 && t < ctx.TL.lanternOn[0] + 2.6; if (ign.visible) UL.value.copy(ctx.anchors(t).lantern);
  const a = t - FLASH_T, rr = FLASH_V * a; ring.visible = a > 0 && a < 2.6; ring.material.uniforms.uR.value.set(rr, .4 + .06 * rr, a > 0 ? 2.4 / (1 + .06 * rr) * (1 - s5(1.3, 2.6, a)) : 0, 0);
}
const ONE = new THREE.Vector3(1, 1, 1);
