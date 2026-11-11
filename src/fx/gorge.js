// FX, Ember Gorge (stage E2): ten thousand backlit falling leaves (tumbling, each lands flat on its own reflection), maples flaring rust -> crimson
// in a wave that climbs the cliffs (+ a leaf shower per tree), the two waterfalls with spray and a faint rainbow, bridge lanterns.
// Pure in t: uniforms + build-time wake times. Leaves never come closer than 1.1 m to the river line and never stand between the lens and her.
import * as THREE from 'three';
import { mulberry, TAU, col } from '../util.js';
import { sidePt } from '../worlds/common.js';

const W = 'gorge';
let U = null;
const NOISE = `float hs2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hs2(i), hs2(i + vec2(1., 0.)), f.x), mix(hs2(i + vec2(0., 1.)), hs2(i + vec2(1., 1.)), f.x), f.y); }`;
const BB = `uniform float uT, fogD; uniform vec3 fogC; varying float vF; varying vec2 vP; varying vec3 vWp;
  vec4 bb(vec3 c, float r){ vec4 mv = modelViewMatrix * vec4(c, 1.); vF = exp(-fogD * fogD * dot(mv.xyz, mv.xyz)); vP = position.xy; mv.xy += position.xy * r;
    vWp = cameraPosition + transpose(mat3(viewMatrix)) * mv.xyz; return projectionMatrix * mv; }`;
const FB = `uniform float uT; uniform vec3 fogC; varying float vF; varying vec2 vP; varying vec3 vWp;`;
function inst(n, attrs, material, name, base = new THREE.PlaneGeometry(2, 2)) {
  const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  for (const k in attrs) g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(attrs[k]), attrs[k].length / n));
  g.instanceCount = n; const m = new THREE.Mesh(g, material); m.frustumCulled = false; m.name = name; m.renderOrder = 6; return m;
}
const mat = (vs, fs, o = {}) => new THREE.ShaderMaterial({ uniforms: U, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, fog: false, ...o });
function wakeTime(look, pos, t0, t1) { const w = look.wakeAt; if (w(W, pos, t0) >= .5) return t0 - 4; if (w(W, pos, t1) < .5) return 1e4;
  let a = t0, b = t1; for (let i = 0; i < 16; i++) { const m = (a + b) / 2; if (w(W, pos, m) >= .5) b = m; else a = m; } return b; }

export function build(ctx, g, { P, maples, waterfalls, BRIDGE, sunDir }) {
  const L = P.length, r = mulberry(4107), look = ctx.look, LU = look.U, fx = new THREE.Group(); fx.name = 'fx_gorge';
  const sh = ctx.SHOTS.shots.filter(x => x.world === W), t0 = sh[0].t0, t1 = sh[sh.length - 1].t1;
  U = { uT: LU.time, fogD: LU.fogD, fogC: LU.fogC, uBoat: { value: new THREE.Vector4() }, uHero: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3(...sunDir).normalize() }, uTL: { value: t0 + 1.0 },
    cA: { value: col('#c8102e') }, cB: { value: col('#ff5a2a') }, cRust: { value: col('#8a3a24') } };

  // ---- maples: rust asleep, burning crimson awake; the flare climbs the cliff (.055 s per metre of height)
  const trees = [], p = new THREE.Vector3(), done = new Set();
  for (const grp of [maples.near, maples.far]) { const M = grp.userData.mats, n = M.length, a = new Float32Array(n);
    for (let i = 0; i < n; i++) { p.setFromMatrixPosition(M[i]); const sc = M[i].getMaxScaleOnAxis(); a[i] = wakeTime(look, p, t0, t1) + Math.max(0, p.y) * .055; trees.push({ p: p.clone(), sc, tw: a[i] }); }
    for (const im of grp.children) { im.geometry.setAttribute('aTW', new THREE.InstancedBufferAttribute(a, 1)); const m = im.material; if (done.has(m)) continue; done.add(m);
      m.customProgramCacheKey = () => 'e2maple';
      m.onBeforeCompile = (s) => { look.air(s); s.uniforms.uT = U.uT;
        s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n attribute float aTW; varying float vTW;`).replace('#include <begin_vertex>', `#include <begin_vertex>\n vTW = aTW;`);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n uniform float uT; varying float vTW; float e2L; vec3 e2C;`)
          .replace('#include <map_fragment>', `#include <map_fragment>
          { float lf = smoothstep(.05, .2, diffuseColor.r - max(diffuseColor.g, diffuseColor.b)), a = uT - vTW, w = smoothstep(-.35, .45, a), l = dot(diffuseColor.rgb, vec3(.3, .5, .2));
            vec3 asleep = mix(vec3(l), diffuseColor.rgb, .65) * vec3(1., .76, .68) * .95, awake = diffuseColor.rgb * vec3(1.05, .45, .4);
            e2C = diffuseColor.rgb; diffuseColor.rgb = mix(diffuseColor.rgb, mix(asleep, awake, w), lf); e2L = lf * (w * .22 + 1.15 * exp(-max(a, 0.) * 1.7) * w) * (.3 + 1.6 * l); }`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1., .1, .02) * e2L;`); };
      m.needsUpdate = true; } }

  // ---- the leaves: 10k in the air over the whole gorge + a shower from every maple as it wakes
  { const a = [], b = [], c = []; let n = 0;
    const leaf = (x, z, s, y0, tStart) => { a.push(x, z, y0, tStart); b.push(r(), r(), r(), .08 + .09 * r()); c.push(s, r()); n++; };
    for (let i = 0; i < 10000; i++) { const s = 1 + r() * (L - 2), sd = r() < .5 ? -1 : 1, q = sidePt(P, s, sd * (1.6 + Math.pow(r(), .8) * 9.4), 0); leaf(q.x, q.z, s, 4 + Math.pow(r(), 1.4) * 20, -5 - r() * 60); }
    for (const t of trees) { if (t.tw > 1e3) continue; const pc = look.pathCoords(W, t.p.x, t.p.z), sd = Math.sign(pc.lat) || 1;
      for (let k = 0; k < 90; k++) { const lat = sd * Math.max(1.7, Math.abs(pc.lat) - (.2 + r() * 5.5) * Math.max(t.sc, .7)), s = pc.s + (r() - .5) * 7 * t.sc, q = sidePt(P, s, lat, 0);
        leaf(q.x, q.z, s, t.p.y + (2.6 + r() * 4.2) * t.sc, t.tw + .15 + r() * r() * 3.2); } }
    const lg = new THREE.PlaneGeometry(2, 2, 2, 1); lg.rotateX(-Math.PI / 2);
    const m = inst(n, { iA: a, iB: b, iC: c }, new THREE.ShaderMaterial({ uniforms: U, side: THREE.DoubleSide, fog: false,
      vertexShader: `attribute vec4 iA, iB; attribute vec2 iC; uniform float uT, fogD; uniform vec4 uBoat; uniform vec3 uHero; varying vec2 vUv; varying vec3 vN, vW; varying vec4 vK; varying float vF;
        mat3 rX(float a){ float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); } mat3 rY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); } mat3 rZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
        void main(){ float v = .75 + .7 * iB.x, tf = iA.z / v, rest = 1.8, Tc = tf + rest, u0 = uT - iA.w, u = mod(u0, Tc), k = min(u, tf), rem = tf - k, air = clamp(rem / 1.4, 0., 1.);
          vec3 c = vec3(iA.x, iA.z - v * k + .014, iA.y);
          c.x += (.5 * sin(rem * (1. + iB.y) + iB.z * 6.283) + .16 * sin(rem * 3.1 + iB.x * 9.)) * air - .1 * rem; c.z += .45 * cos(rem * (.8 + iB.z) + iB.y * 6.283) * air - .24 * rem;
          mat3 R = rY(iB.z * 6.283 + rem * (.8 + iB.x)) * rX(rem * (2.1 + 2.6 * iB.y) + .5 * sin(rem * 2.3 + iB.x * 20.) * air) * rZ(.7 * sin(rem * 1.7 + iB.y * 30.) * air);
          float curl = .25 + .5 * iB.y; vec3 lp = vec3(position.x, curl * abs(position.x) * .5, position.z);
          vec3 dd = uHero - cameraPosition; float Ld = length(dd); dd /= Ld; vec3 rel = c - cameraPosition; float tt = dot(rel, dd), rr = length(rel - dd * tt);
          float keep = max(step(Ld + .7, tt), smoothstep(1.5, 2.1, rr / max(tt / Ld, .3))) * smoothstep(3.2, 4.6, length(rel));      // nothing between the lens and her (cone on the camera -> torso line), nothing near the lens
          keep *= max(smoothstep(1.25, 1.75, length(c.xz - uHero.xz)), step(3.6, c.y));                                             // and a 1.25 m cylinder around her head / torso from any camera: leaves only fall beyond her
          float sz = iB.w * keep * step(0., u0) * smoothstep(0., .5, k) * (1. - smoothstep(Tc - .6, Tc, u));
          vec4 wp = modelMatrix * vec4(c + R * (lp * sz), 1.); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * (R * vec3(-sign(position.x) * curl * .5, 1., 0.)));
          vUv = uv; vK = vec4(iC.y, smoothstep(0., 3., uBoat.x - 4. - iC.x), iB.x, rem); vec4 mv = viewMatrix * wp; vF = exp(-fogD * fogD * dot(mv.xyz, mv.xyz)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 cA, cB, cRust, uSun, fogC; varying vec2 vUv; varying vec3 vN, vW; varying vec4 vK; varying float vF;
        void main(){ vec2 q = vUv * 2. - 1.; float rq = length(q), th = abs(atan(q.x, q.y)), R = max(.3, max(1. - th / .4, max(.88 * (1. - abs(th - .98) / .4), .58 * (1. - abs(th - 1.95) / .38))));
          if (rq > R && !(abs(q.x) < .035 && q.y < 0. && q.y > -.95)) discard;
          vec3 base = mix(cA, cB, step(.72, vK.x) * .75 + .15 * vK.z); base = mix(mix(vec3(dot(base, vec3(.3, .5, .2))), cRust, .8) * 1.1, base, .35 + .65 * vK.y);
          base *= 1. - .3 * (1. - smoothstep(0., .07, abs(q.x))); vec3 N = normalize(vN), V = normalize(cameraPosition - vW); if (dot(N, V) < 0.) N = -N;
          float ndl = dot(N, uSun), thr = pow(max(dot(-V, uSun), 0.), 3.);
          base.b *= .55; vec3 c = base * (.85 + 1.25 * max(ndl, 0.)) + base * vec3(1.6, .7, .3) * (1.7 * max(-ndl, 0.) + 1.4 * thr);                // lit face + stained-glass transmission
          gl_FragColor = vec4(mix(fogC, c, vF), 1.); }` }), 'leaves', lg);
    m.renderOrder = 0; fx.add(m); fx.userData.leaves = n; }

  // ---- waterfalls: streaked falling water on the wet face, churned pool, drifting spray, a faint rainbow at 42 deg from the anti-sun
  const fallM = mat(`varying vec2 vUv; varying float vF; uniform float fogD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vF = exp(-fogD * fogD * dot(mv.xyz, mv.xyz)); gl_Position = projectionMatrix * mv; }`,
    `uniform float uT; uniform vec3 fogC; varying vec2 vUv; varying float vF; ${NOISE}
    void main(){ float x = vUv.x, y = vUv.y, f = uT * (1.3 + 1.3 * (1. - y));
      float n = .55 * vn(vec2(x * 16., y * 6. + f * 1.3)) + .3 * vn(vec2(x * 44., y * 13. + f * 2.3)) + .15 * vn(vec2(x * 90., y * 30. + f * 4.));
      float edge = smoothstep(0., .22, x) * smoothstep(1., .78, x) * (.7 + .3 * vn(vec2(y * 9. + f, x * 3.))), foam = smoothstep(.16, 0., y);
      float a = max(edge * smoothstep(.2, .55, n + .22) * smoothstep(1., .95, y), foam * edge);
      vec3 c = mix(mix(vec3(.6, .47, .5), vec3(1.7, 1.45, 1.25), smoothstep(.35, .78, n)), vec3(1.7, 1.5, 1.4), foam * .85);
      gl_FragColor = vec4(mix(fogC, c, vF), a * .95); }`, { side: THREE.DoubleSide });
  const poolM = mat(`varying vec2 vUv; varying float vF; uniform float fogD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vF = exp(-fogD * fogD * dot(mv.xyz, mv.xyz)); gl_Position = projectionMatrix * mv; }`,
    `uniform float uT; uniform vec3 fogC; varying vec2 vUv; varying float vF; ${NOISE}
    void main(){ vec2 q = vUv * 2. - 1.; float d = length(q), n = vn(q * 5. + vec2(0., uT * .8)) * .6 + vn(q * 12. - vec2(uT * .5, 0.)) * .4;
      gl_FragColor = vec4(mix(fogC, vec3(1.5, 1.35, 1.25), vF), (1. - smoothstep(.35, 1., d)) * smoothstep(.2, .7, n + .35 * (1. - d)) * .85); }`, { side: THREE.DoubleSide });
  const sprayM = mat(`${BB} attribute vec4 iR; varying float vA;
    void main(){ float u = fract(uT * (.1 + .08 * iR.x) + iR.y); vec3 c = vec3((iR.z - .5) * 5.5 * (.6 + u), .4 + (1.5 + 7. * iR.x) * u, .6 + 4.5 * u * iR.w + .8 * sin(uT * .3 + iR.y * 20.));
      vA = sin(3.1416 * u) * (.06 + .08 * iR.w); gl_Position = bb(c, 1.3 + 3.2 * u); }`,
    `${FB} varying float vA; void main(){ float d = dot(vP, vP); gl_FragColor = vec4(mix(fogC, vec3(1.35, 1.15, 1.05), vF), vA * (exp(-d * 2.6) - .074) * step(d, 1.)); }`);
  const bowM = mat(`${BB} void main(){ gl_Position = bb(vec3(0., 9., 3.), 13.); }`,
    `${FB} uniform vec3 uSun; ${NOISE} void main(){ float d = dot(vP, vP); vec3 vd = normalize(vWp - cameraPosition); float ang = degrees(acos(clamp(dot(vd, -normalize(uSun)), -1., 1.))), t = (ang - 39.6) / 3.6;
      if (t < 0. || t > 1.) discard; vec3 sp = clamp(vec3(1.5 - abs(4. * t - 3.), 1.5 - abs(4. * t - 2.), 1.5 - abs(4. * t - 1.)), 0., 1.);
      float mk = (exp(-d * 2.2) - .11) * step(d, 1.) * (.6 + .4 * vn(vWp.xy * .35 + uT * .05));
      gl_FragColor = vec4(sp * sin(3.1416 * t) * mk * .26 * vF, 1.); }`, { blending: THREE.AdditiveBlending });
  for (const wf of waterfalls) { const A = wf.anchor;
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(wf.width * 1.25, wf.top + 4).translate(0, (wf.top + 4) / 2, .18), fallM); fall.name = wf.name + '_water'; fall.renderOrder = 4; A.add(fall);
    wf.pool.material = poolM; wf.pool.scale.setScalar(1.5); wf.pool.renderOrder = 4;
    const n = 34, a = []; for (let i = 0; i < n; i++) a.push(r(), r(), r(), r());
    const sp = inst(n, { iR: a }, sprayM, wf.name + '_spray'); A.add(sp);
    const bow = inst(1, { iR: [0, 0, 0, 0] }, bowM, wf.name + '_rainbow'); bow.renderOrder = 7; A.add(bow); }

  // ---- bridge lanterns: hung under the deck (underside measured from the model), lit one after another from the middle
  { const bg = g.children.find(c => c.name === 'bridge'), a = [];
    if (bg && bg.userData.proto) { const pr = bg.userData.proto, M = bg.userData.mats[0], hw = pr.size.x * .5, N = 9;
      for (let i = 0; i < N; i++) { const x = (i / (N - 1) - .5) * 2 * hw * .7; let y = 1e9; for (const v of pr.pts) if (Math.abs(v.x - x) < 1 && v.y < y) y = v.y; if (y > 1e8) y = pr.size.y * .7;
        p.set(x, y - .8, 0).applyMatrix4(M); a.push(p.x, p.y, p.z, Math.abs(i - (N - 1) / 2) * .16 + r() * .05); }
      fx.add(inst(N, { iP: a }, mat(`${BB} attribute vec4 iP; uniform float uTL; varying float vI;
        void main(){ float t = uT - uTL - iP.w; vI = .05 + smoothstep(0., .2, t) * (1. + 2.2 * exp(-max(t, 0.) * 3.)) * (.92 + .08 * sin(uT * 9. + iP.w * 50.)); gl_Position = bb(iP.xyz + vec3(0., .05 * sin(uT * 1.1 + iP.w * 30.), 0.), 2.4); vF = mix(1., vF, .5); }`,
        `${FB} varying float vI; void main(){ float d = dot(vP, vP); gl_FragColor = vec4(vec3(1., .62, .26) * vI * vF * (.6 * (exp(-d * 5.) - .007) + 12. * exp(-d * 300.) + 2. * exp(-d * 50.)) * step(d, 1.), 1.); }`, { blending: THREE.AdditiveBlending }), 'bridge_lanterns')); } }
  g.add(fx); return fx;
}

export function update(ctx, t) {
  if (!U) return; const A = ctx.anchors(t);
  U.uBoat.value.set(ctx.now.s, 0, 0, 0); U.uHero.value.copy(A.hero); U.uHero.value.y -= .7;
}
