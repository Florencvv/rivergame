// Stage E1 shared fx kit (hook + marsh + court). Everything is closed form in t: the GPU poses every sprite from attributes + uT.
//   sprites(ctx, {...})   instanced quads (billboard or oriented), additive HDR or opaque alpha-tested, fogged, mirror-aware
//   wakeTimer(ctx, world) -> f(pos) = the film time at which the wake front crosses pos (same edge as look.wakeAt), f.tOfS(s)
//   rings / fires / lotusFx / makeBird / patch (MeshStandardMaterial hook with world position + normal)
import * as THREE from 'three';
import { mulberry, s5, sst, TAU, col, hsh, clamp } from '../util.js';
export const KT = { value: 0 };                 // film time, set by the running world's fx update
const FRONT = 4, BOWK = .03;
export const lin = (h, k = 1) => { const c = col(h).multiplyScalar(k); return new THREE.Vector3(c.r, c.g, c.b); };
export const GL = `
uniform float uT; uniform vec4 uUWk; uniform vec3 fogC; uniform float fogD; uniform sampler2D tN; uniform vec4 uSunF;
float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
float q5(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0., 1.); return t * t * t * (t * (t * 6. - 15.) + 10.); }
mat2 r2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return texture2D(tN, (i + f + .5) / 256.).r; }
`;
// o: { n, A, B, C (Float32Array n*4), uniforms, head (glsl), vs (sets C, S, K, P, R, Z, ori, AX, AY), fs (sets col, A from uv, vK, vP, vW), additive, order, mirror: 1 both | 0 main pass only }
export function sprites(ctx, o) {
  const { n, A, B, C, uniforms = {}, head = '', vs, fs, additive = true, order = 3, mirror = 1, name = 'fx' } = o;
  const g = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1); g.index = q.index; g.setAttribute('position', q.attributes.position);
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4)); g.setAttribute('aB', new THREE.InstancedBufferAttribute(B || new Float32Array(n * 4), 4)); g.setAttribute('aC', new THREE.InstancedBufferAttribute(C || new Float32Array(n * 4), 4));
  g.instanceCount = n; const U = ctx.look.U;
  const mat = new THREE.ShaderMaterial({ uniforms: { uT: KT, uUWk: U.uUWk, fogC: U.fogC, fogD: U.fogD, tN: U.tN, uSunF: U.uSunF, ...uniforms },
    transparent: additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !additive, side: THREE.DoubleSide, fog: false,
    vertexShader: `${GL} attribute vec4 aA, aB, aC; varying vec2 vUv; varying vec4 vK, vP; varying vec3 vW; ${head}
      void main(){ vec3 C = aA.xyz; vec2 S = vec2(1.); vec4 K = vec4(1.), P = vec4(0.); float R = 0., Z = 0., ori = 0.; vec3 AX = vec3(1., 0., 0.), AY = vec3(0., 1., 0.);
        ${vs}
        vUv = position.xy * 2.; vK = K; vP = P; vec2 o = r2(R) * (position.xy * S);
        vec4 wc = modelMatrix * vec4(C + ori * (AX * o.x + AY * o.y), 1.); vW = wc.xyz; vec4 mv = viewMatrix * wc; mv.xy += (1. - ori) * o; mv.xyz *= 1. - Z / max(.3, length(mv.xyz));
        gl_Position = (S.x > 0. && S.y > 0.) ? projectionMatrix * mv : vec4(2., 2., 2., 1.); }`,
    fragmentShader: `${GL} varying vec2 vUv; varying vec4 vK, vP; varying vec3 vW; ${head}
      void main(){ if (uUWk.w > .5 && ${mirror ? 'vW.y > .004' : 'true'}) discard; vec2 uv = vUv; vec3 col = vK.rgb; float A = 1.;
        ${fs}
        float fd = length(vW - cameraPosition), ff = exp(-fogD * fogD * fd * fd);
        ${additive ? 'gl_FragColor = vec4(col * ff, clamp(A, 0., 1.));' : 'if (A < .5) discard; gl_FragColor = vec4(mix(fogC, col, ff), 1.);'} }` });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = order; m.name = name; return m;
}
// film time at which the wake front (FRONT m behind the boat, bowed forward off-axis) crosses a world point
export function wakeTimer(ctx, world) {
  const sh = ctx.SHOTS.shots.filter(x => x.world === world), t0 = sh[0].t0, t1 = sh[sh.length - 1].t1, dt = 1 / 30, T = [], S = [];
  for (let t = t0; t < t1 - 1e-6; t += dt) { T.push(t); S.push(ctx.anchors(t).s); }
  const v0 = Math.max(.3, (S[1] - S[0]) / dt), N = S.length;
  const tOfS = (s) => { if (s <= S[0]) return t0 - (S[0] - s) / v0; if (s >= S[N - 1]) return 1e3; let a = 0, b = N - 1; while (b - a > 1) { const m = (a + b) >> 1; if (S[m] < s) a = m; else b = m; } return T[a] + dt * (s - S[a]) / Math.max(1e-6, S[b] - S[a]); };
  const f = (pos) => { const pc = ctx.look.pathCoords(world, pos.x, pos.z); return tOfS(pc.s + FRONT - BOWK * pc.lat * pc.lat); };
  f.lit = (pos, lead = 1, spread = 10) => { const pc = ctx.look.pathCoords(world, pos.x, pos.z); return Math.min(tOfS(pc.s + FRONT - BOWK * pc.lat * pc.lat), tOfS(pc.s - lead) + Math.abs(pc.lat) / spread); };   // lit by the lantern abeam (spreading outwards) or by the wake front, whichever is first
  f.tOfS = tOfS; f.t0 = t0; f.t1 = t1; f.sAt = (t) => ctx.anchors(clamp(t, t0, t1 - 1e-4)).s; return f;
}
// expanding rings on the water. list: [{ x, z, t0, period (0 = once), life, R, k }]
export function rings(ctx, list, { color = '#ffffff', order = 2, w = .035, name = 'rings' } = {}) {
  const n = list.length, A = new Float32Array(n * 4), B = new Float32Array(n * 4);
  list.forEach((r, i) => { A.set([r.x, r.z, r.t0, r.period || 0], i * 4); B.set([r.life || 1, r.R || 1, r.k ?? 1, hsh(i, 5)], i * 4); });
  return sprites(ctx, { n, A, B, order, mirror: 0, name, uniforms: { uCol: { value: lin(color) }, uW: { value: w } }, head: 'uniform vec3 uCol; uniform float uW;',
    vs: `float age = uT - aA.z; if (aA.w > 0. && age > 0.) age = mod(age, aA.w); float u = age / aB.x; float r = aB.y * (1. - exp(-2.2 * u)) / .889;
      C = vec3(aA.x, .012, aA.y); ori = 1.; AX = vec3(1., 0., 0.); AY = vec3(0., 0., 1.); float sz = 2. * r + .3; S = vec2((u < 0. || u > 1.) ? 0. : sz);
      K = vec4(uCol * aB.z * (1. - u) * (1. - u), 1.); P = vec4(2. * r / sz, 2. * (uW + .03 * r) / sz, 0., 0.);`,
    fs: `float d = length(uv), e = (d - vP.x) / vP.y; A = exp(-e * e);` });
}
// bowl fires: 3 flame layers + halo + sparks per fire. list: [{ pos, tW, size }]
export function fires(ctx, list, { order = 3, name = 'fires', glow = 1 } = {}) {
  const per = 3 + 1 + 10, n = list.length * per, A = new Float32Array(n * 4), B = new Float32Array(n * 4); let j = 0;
  list.forEach((f, i) => { for (let k = 0; k < per; k++, j++) { const ty = k < 3 ? 0 : k === 3 ? 1 : 2; A.set([f.pos.x, f.pos.y, f.pos.z, f.tW], j * 4); B.set([f.size, hsh(i * 17 + k, 3), k < 3 ? k : hsh(i * 31 + k, 7), ty], j * 4); } });
  return sprites(ctx, { n, A, B, order, name, uniforms: { uGl: { value: glow } }, head: 'uniform float uGl;',
    vs: `float ts = uT - aA.w, on = q5(0., .45, ts), burst = 1. + 1.4 * exp(-max(ts, 0.) * 2.5), ty = aB.w, sz = aB.x; P = vec4(aB.y, ts, ty, 0.);
      if (ty < .5) { S = vec2(.66, 1.3) * sz * on * (.8 + .25 * burst) * (1. - .2 * aB.z); C.y += S.y * .4; C.x += (aB.y - .5) * .12 * sz; }
      else if (ty < 1.5) { S = vec2(5. * sz) * on; C.y += .35 * sz; K = vec4(vec3(1., .6, .24) * .3 * uGl * burst * (1. + .12 * sin(uT * 17. + aB.y * 40.)), 1.); Z = .3 * sz; }
      else { float life = .9 + aB.y, a = mod(ts - aB.z * 5., life), u = a / life; C += vec3(sin(aB.y * 40. + a * 3.) * .25, .3 + a * (1.2 + aB.z), cos(aB.z * 50. + a * 2.3) * .25) * sz;
        S = vec2(.03 * sz) * step(.3, ts); K = vec4(vec3(1., .7, .32) * 8. * (1. - u), 1.); }`,
    fs: `if (vP.z < .5) { float v = uv.y * .5 + .5, t = uT; float n1 = vn(vec2(uv.x * 1.6 + vP.x * 31., v * 2.4 - t * 3.1)), n2 = vn(vec2(uv.x * 3.4 + vP.x * 13., v * 5. - t * 5.3));
        float x = uv.x + (n1 - .5) * 1.1 * v, w = .8 * pow(max(1. - v, 0.), .55) * smoothstep(0., .1, v) + .02, d = abs(x) / (w * (.7 + .6 * n2));
        float sh = smoothstep(1., .2, d) * smoothstep(1.02, .65, v + (n2 - .5) * .4); col = mix(vec3(1., .22, .02), vec3(1., .66, .22), sh * sh) * (2.5 + 11. * sh * sh * (1. - v * .5)); A = sh; }
      else if (vP.z < 1.5) { A = pow(max(0., 1. - length(uv)), 2.5); }
      else { A = smoothstep(1., .2, length(uv)); }` });
}
// lotus lanterns: the flat bulb becomes a waxy bud lit from inside (hot core, amber rim, petal ribs) + a halo + a pool of light on the water + a flare when the bow lantern reaches it
export function lotusFx(ctx, road, WT, { gateT = -1e3 } = {}) {
  const U = ctx.look.U, it = road.items, n = it.length;
  road.bulbs.material = new THREE.ShaderMaterial({ uniforms: { fogC: U.fogC, fogD: U.fogD }, fog: false,
    vertexShader: `varying vec3 vN, vV, vC, vW, vO; varying float vH;
      void main(){ vec3 p = position; vO = position; float v = clamp(p.y / .105, -1., 1.); p.xz *= 1. - .62 * pow(smoothstep(-.3, 1., v), 1.4); p *= 1.9; p.y += .06; vH = v;
        vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.); vW = w.xyz; vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mv.xyz);
        vC = vec3(1.);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #endif
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 fogC; uniform float fogD; varying vec3 vN, vV, vC, vW, vO; varying float vH;
      void main(){ float ndv = abs(dot(normalize(vN), normalize(vV))), core = pow(ndv, 2.2); float k = max(vC.r, max(vC.g, vC.b)) / 6.;
        float rib = .5 + .5 * cos(atan(vO.z, vO.x) * 6. + vH * 1.5); vec3 c = vC * mix(vec3(1., .86, .5), vec3(1., 1.2, 1.3), core) * (.14 + .46 * core) * (1.25 - .5 * vH) * (.78 + .22 * rib);
        c += vec3(.62, .5, .3) * .55 * (1. - k) * (.4 + .6 * ndv) * (.85 + .15 * rib);          // asleep: a pale waxy bud, not a black dot
        float fd = length(vW - cameraPosition), ff = exp(-fogD * fogD * fd * fd); gl_FragColor = vec4(mix(fogC, c, ff), 1.); }` });
  const N2 = n * 2, A = new Float32Array(N2 * 4), B = new Float32Array(N2 * 4), tLit = [];
  it.forEach((L, i) => { tLit.push(Math.max(WT.tOfS(L.s - .4), gateT)); for (let k = 0; k < 2; k++) { A.set([L.pos.x, k ? .014 : .2, L.pos.z, tLit[i]], (i * 2 + k) * 4); B.set([k, hsh(i, 9), 0, 0], (i * 2 + k) * 4); } });
  const halo = sprites(ctx, { n: N2, A, B, order: 3, name: 'lotusHalo', uniforms: { uCol: { value: new THREE.Vector3(road.color.r, road.color.g, road.color.b) } }, head: 'uniform vec3 uCol;',
    vs: `float ts = uT - aA.w, k = .1 + .9 * q5(-1.1, 0., ts), pulse = step(0., ts) * 1.8 * exp(-max(ts, 0.) * 2.2), fl = 1. + .05 * sin(uT * 9. + aB.y * 40.);
      if (aB.x < .5) { S = vec2(.4 + .7 * k + 1.1 * pulse); K = vec4(uCol * (.03 + .2 * k + .8 * pulse) * fl, 1.); Z = .25; C.y += .025 * sin(uT * 1.1 + aB.y * 50.); }
      else { ori = 1.; AX = vec3(1., 0., 0.); AY = vec3(0., 0., 1.); S = vec2(1.2 + 2.2 * k + 2. * pulse); K = vec4(uCol * (.02 + .16 * k + .5 * pulse), 1.); } P.x = aB.x;`,
    fs: `float d = length(uv); A = vP.x < .5 ? pow(max(0., 1. - d), 2.6) + .6 * pow(max(0., 1. - d * 3.), 2.) : pow(max(0., 1. - d), 2.) * (uUWk.w > .5 ? 0. : 1.);` });
  return { halo, update(t) { for (let i = 0; i < n; i++) { const ts = t - tLit[i]; road.glow[i] = ts > 0 ? .5 * Math.exp(-ts * 2.2) : 0; } } };
}
// a small procedural white bird (heron / egret): body, neck, head, beak, trailing legs, two 2-segment wings. Faces +z. pose(phase, fold 0..1 standing)
export function makeBird({ span = 1.7, emissive = '#ffe6c0', wingGlow = .9, bodyGlow = .3 } = {}) {
  const k = span / 1.7, g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .7, emissive: col(emissive), emissiveIntensity: bodyGlow });
  const wing = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .8, emissive: col(emissive), emissiveIntensity: wingGlow, side: THREE.DoubleSide });
  const add = (geo, mat, p, par = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.frustumCulled = false; par.add(m); return m; };
  add(new THREE.SphereGeometry(1, 10, 8).scale(.075, .07, .23), body, [0, 0, 0]);
  const neck = add(new THREE.CylinderGeometry(.018, .028, 1, 6).translate(0, .5, 0), body, [0, .02, .19]);
  const head = add(new THREE.SphereGeometry(1, 8, 6).scale(.03, .03, .05), body, [0, 0, 0]); const beak = add(new THREE.ConeGeometry(.012, .13, 5).rotateX(Math.PI / 2).translate(0, 0, .1), new THREE.MeshStandardMaterial({ color: '#e8b040', roughness: .6 }), [0, 0, 0], head);
  const legs = [-1, 1].map(s => add(new THREE.CylinderGeometry(.007, .007, 1, 4).translate(0, -.5, 0), new THREE.MeshStandardMaterial({ color: '#3a3428', roughness: .8 }), [s * .03, -.03, -.08]));
  const panel = (l, c0, c1) => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, c0 * .45, 0, 0, -c0 * .55, l, 0, c1 * .3, l, 0, -c1 * .7]), 3)); ge.setIndex([0, 1, 2, 2, 1, 3]); ge.computeVertexNormals(); return ge; };
  const W = [-1, 1].map(s => { const a = new THREE.Group(); a.position.set(s * .05, .04, .05); a.scale.x = s; g.add(a); add(panel(.42, .3, .26), wing, [0, 0, 0], a);
    const b = new THREE.Group(); b.position.set(.42, 0, 0); a.add(b); add(panel(.43, .26, .06), wing, [0, 0, 0], b); return { a, b, s }; });
  g.scale.setScalar(k);
  return { g, pose(ph, fold = 0) { const up = Math.sin(ph), a1 = (1 - fold) * (.15 + .75 * up) + fold * -1.35, a2 = (1 - fold) * (-.1 + .55 * Math.sin(ph - 1.1)) + fold * -.2;
      for (const w of W) { w.a.rotation.z = w.s * a1; w.b.rotation.z = a2; w.a.scale.set(w.s * (1 - .45 * fold), 1, 1); }
      const hx = 0, hy = .02 + fold * .34 + (1 - fold) * .07, hz = .19 + .2 * (1 - fold) + .08 * fold; head.position.set(hx, hy, hz + .02);
      neck.scale.y = Math.hypot(hy - .02, hz - .19) + .02; neck.rotation.x = Math.atan2(hz - .19, hy - .02);
      for (const l of legs) { l.scale.y = fold * .5 + (1 - fold) * .46; l.rotation.x = (1 - fold) * 1.45; } } };
}
// MeshStandardMaterial hook: world position vMW + world normal vMN (instancing aware), my time eT + noise eN, code after the map and in the emissive slot
let PK = 0;
export function patch(ctx, mat, { vhead = '', vbody = '', fhead = '', fmap = '', femis = '', uniforms = {} } = {}) {
  const key = 'e1p' + (PK++);
  mat.onBeforeCompile = (sh) => { ctx.look.air(sh); Object.assign(sh.uniforms, { eT: KT, eN: ctx.look.U.tN, ...uniforms });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMW, vMN;\n' + vhead)
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 w4 = vec4(transformed, 1.); vec3 n3 = objectNormal;
        #ifdef USE_INSTANCING
          w4 = instanceMatrix * w4; n3 = mat3(instanceMatrix) * n3;
        #endif
        vMW = (modelMatrix * w4).xyz; vMN = normalize(mat3(modelMatrix) * n3); ${vbody} }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vMW, vMN; uniform float eT; uniform sampler2D eN;
        float eVn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return texture2D(eN, (i + f + .5) / 256.).r; }
        float eCaust(vec2 p, float t){ return pow(.5 + .5 * sin(p.x * 1.7 + 1.3 * sin(p.y * 1.1 + t * .6)) * sin(p.y * 1.9 + 1.2 * sin(p.x * 1.3 - t * .5)), 5.); }
        float eQ5(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0., 1.); return t * t * t * (t * (t * 6. - 15.) + 10.); }\n` + fhead)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + fmap)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + femis); };
  mat.customProgramCacheKey = () => key; mat.needsUpdate = true; return mat;
}
// mean linear luminance of a texture image (for normalising Tripo albedo)
export function meanLum(tex) { try { const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(tex.image, 0, 0, 32, 32); const d = c.getImageData(0, 0, 32, 32).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += .3 * Math.pow(d[i] / 255, 2.2) + .59 * Math.pow(d[i + 1] / 255, 2.2) + .11 * Math.pow(d[i + 2] / 255, 2.2); return s / (d.length / 4); } catch (e) { return .3; } }
export { THREE, mulberry, s5, sst, TAU, col, hsh, clamp };
