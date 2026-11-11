// FX, the Underroot (stage E2): mushroom wave (cap cyan, gills violet a beat later), spore puffs, glow-worm ceiling drawn like a star field,
// sparkling cyan wake, warm fireflies parting around the lantern, drip rings, the red cave mouth. Pure in t: uniforms + build-time wake times.
import * as THREE from 'three';
import { mulberry, TAU, col } from '../util.js';
import { sidePt, blocked } from '../worlds/common.js';

const W = 'grotto';
let U = null; const _d = new THREE.Vector3(), _v = new THREE.Vector3();
// bb(): camera-facing sprite. Small lights are DOF-aware: a sprite far out of focus grows with its circle of confusion and is boosted (uDof = focus distance,
// aperture radius, gain), so the sub-sampled lens blur fuses into real bokeh discs instead of a ring of dots.
const HEAD = `uniform float uT, fogD, uPx; uniform vec3 uDof; varying float vF; varying vec2 vP;
  vec4 bb(vec3 c, float r){ vec4 mv = modelViewMatrix * vec4(c, 1.); float d2 = dot(mv.xyz, mv.xyz); vF = exp(-fogD * fogD * d2);
    float coc = uDof.y * abs(-mv.z - uDof.x) / uDof.x, q = coc / (r + coc + 1e-5); vF *= 1. + uDof.z * q * q; r += .72 * coc;
    float rm = sqrt(d2) * uPx; if (r < rm) { vF *= max(r / rm, .22); r = rm; } vP = position.xy; mv.xy += position.xy * r; return projectionMatrix * mv; }
  float hs(float n){ return fract(sin(n * 127.1) * 43758.5453); }`;
const FHEAD = `uniform float uT; varying float vF; varying vec2 vP;`;
const mat = (vs, fs, o = {}) => new THREE.ShaderMaterial({ uniforms: U, vertexShader: HEAD + vs, fragmentShader: FHEAD + fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...o });
function inst(n, attrs, material, name, base = new THREE.PlaneGeometry(2, 2)) {
  const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  for (const k in attrs) g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(attrs[k]), attrs[k].length / n));
  g.instanceCount = n; const m = new THREE.Mesh(g, material); m.frustumCulled = false; m.name = name; m.renderOrder = 6; return m;
}
// the moment the wake front reaches a point (wakeAt = .5), by bisection over the world's time span
function wakeTime(look, pos, t0, t1) { const w = look.wakeAt; if (w(W, pos, t0) >= .5) return t0 - 4; if (w(W, pos, t1) < .5) return 1e4;
  let a = t0, b = t1; for (let i = 0; i < 16; i++) { const m = (a + b) / 2; if (w(W, pos, m) >= .5) b = m; else a = m; } return b; }
// the star field is drawn outward from above her: seconds after T0 at which the front is d metres away (slow start, accelerating)
const tau = (d) => (-5 + Math.sqrt(25 + 24 * d)) / 12;

export function build(ctx, g, { P, mushrooms, TUNNEL, Z }) {
  const L = P.length, r = mulberry(3107), look = ctx.look, LU = look.U, fx = new THREE.Group(); fx.name = 'fx_grotto';
  const sh = ctx.SHOTS.shots.filter(x => x.world === W), t0 = sh[0].t0, t1 = sh[sh.length - 1].t1, T0 = sh[1].t0 + .3, O = ctx.anchors(T0).hero.clone();
  U = { uT: LU.time, fogD: LU.fogD, uPx: { value: .002 }, uDof: { value: new THREE.Vector3(5, 0, 9) }, uBoat: { value: new THREE.Vector4() }, uLan: { value: new THREE.Vector3() }, uT0: { value: T0 },
    cCap: { value: col('#23e0d0') }, cGill: { value: col('#a45bff') }, cStar: { value: col('#9ff6ee') }, cPink: { value: col('#e86bff') }, cWarm: { value: col('#ffc27a') } };
  const starT = (p, y = 6) => T0 + tau(Math.hypot(p.x - O.x, p.z - O.z)) + (7 - y) * .04;

  // ---- mushrooms: emissive pass on the Tripo material (aGlow = cap, gill), wake time + breathing phase per cluster
  const clusters = [], p = new THREE.Vector3(), done = new Set();
  for (const grp of [mushrooms.near, mushrooms.far]) { const M = grp.userData.mats, n = M.length, a = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { p.setFromMatrixPosition(M[i]); const sc = M[i].getMaxScaleOnAxis();
      let tw = Math.min(wakeTime(look, p, t0, t1), starT(p, 1) + .35 + r() * .5); if (p.y > 1) tw += .5 + r() * .8;       // the small ones on the roots light late, like afterthoughts
      a[i * 2] = tw; a[i * 2 + 1] = r(); clusters.push({ p: p.clone(), sc, tw, ph: a[i * 2 + 1], far: grp === mushrooms.far }); }
    for (const im of grp.children) { im.geometry.setAttribute('aTW', new THREE.InstancedBufferAttribute(a, 2)); const m = im.material; if (done.has(m)) continue; done.add(m);
      const flag = !!im.geometry.attributes.aGlow; m.customProgramCacheKey = () => 'e2mush' + flag;
      m.onBeforeCompile = (s) => { look.air(s); s.uniforms.uT = U.uT; s.uniforms.cCap = U.cCap; s.uniforms.cGill = U.cGill;
        s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n attribute vec2 aTW; ${flag ? 'attribute vec2 aGlow;' : ''} varying vec4 vMu;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>\n vMu = vec4(${flag ? 'aGlow' : 'vec2(smoothstep(.1, .5, normal.y), smoothstep(-.1, -.5, normal.y))'}, aTW);`);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n uniform float uT; uniform vec3 cCap, cGill; varying vec4 vMu;`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { float a = uT - vMu.z, wc = smoothstep(-.25, .2, a), wg = smoothstep(.3, .85, a), br = .8 + .2 * sin(uT * 1.5708 + vMu.w * 6.283);
            float fc = exp(-max(a, 0.) * 2.4) * wc, fg = exp(-max(a - .55, 0.) * 2.4) * wg, lm = .35 + .65 * dot(diffuseColor.rgb, vec3(.3, .5, .2));
            totalEmissiveRadiance += cCap * lm * (vMu.x * (.06 + wc * (1.25 * br + 2.6 * fc)) + (1. - vMu.x) * wc * .12 * br);
            totalEmissiveRadiance += cGill * lm * vMu.y * (.05 + wg * (2.4 * br + 3. * fg)); }`); };
      m.needsUpdate = true; } }

  // ---- soft halo on every cluster: lights the mist from inside and doubles in the black mirror
  { const n = clusters.length, a = [], b = []; for (const c of clusters) { a.push(c.p.x, c.p.y + .45 * c.sc, c.p.z, .9 + 1.5 * c.sc); b.push(c.tw, c.ph); }
    fx.add(inst(n, { iP: a, iT: b }, mat(`attribute vec4 iP; attribute vec2 iT; varying vec3 vC; uniform vec3 cCap, cGill;
      void main(){ float a = uT - iT.x, wc = smoothstep(-.25, .3, a), wg = smoothstep(.3, 1., a), br = .8 + .2 * sin(uT * 1.5708 + iT.y * 6.283);
        vC = (cCap * (.008 + wc * (.07 * br + .3 * exp(-max(a, 0.) * 2.4))) + cGill * wg * .06 * br); gl_Position = bb(iP.xyz, iP.w); }`,
      `varying vec3 vC; void main(){ float d = dot(vP, vP); gl_FragColor = vec4(vC * vF * (exp(-d * 3.2) - .04) * step(d, 1.), 1.); }`), 'mush_halo')); }

  // ---- spores: every cluster puffs a small cloud as it lights, then the spores hang in the air and twinkle
  { const K = 7, n = clusters.length * K, a = [], b = []; for (const c of clusters) for (let k = 0; k < K; k++) { a.push(c.p.x + (r() - .5) * .5 * c.sc, c.p.y + (.5 + r() * .7) * c.sc, c.p.z + (r() - .5) * .5 * c.sc, c.tw + r() * .5); b.push(r(), r(), r(), c.sc); }
    fx.add(inst(n, { iP: a, iR: b }, mat(`attribute vec4 iP, iR; varying vec3 vC; uniform vec3 cCap, cPink;
      void main(){ float a = uT - iP.w; vec3 dir = normalize(vec3(iR.x - .5, .35 + iR.y * .6, iR.z - .5)); float k = 1. - exp(-max(a, 0.) * 2.2);
        vec3 c = iP.xyz + dir * (.25 + .7 * iR.y) * iR.w * k + vec3(.12 * sin(uT * (.4 + iR.x) + iR.z * 40.), 1.1 * (1. - exp(-max(a, 0.) * .22)) * (.4 + iR.z), .12 * cos(uT * (.5 + iR.z) + iR.x * 40.));
        float tw = .55 + .45 * sin(uT * (2. + 3. * iR.y) + iR.x * 60.), on = step(0., a) * (.5 * tw + 2.6 * exp(-max(a, 0.) * 1.6));
        vC = mix(cCap, cPink, step(.62, iR.z)) * on * 1.5; gl_Position = bb(c, a < 0. ? 0. : .014 + .012 * iR.x); }`,
      `varying vec3 vC; void main(){ float d = dot(vP, vP); gl_FragColor = vec4(vC * vF * exp(-d * 4.) * step(d, 1.), 1.); }`), 'spores')); }

  // ---- glow-worm ceiling: silk threads with beads of light, switched on outward from above her (T0), low curtains on the banks for the bokeh
  { const th = [], bd = [], bt = []; let nt = 0, nb = 0; const crown = TUNNEL ? TUNNEL.crown : 7.3;
    const thread = (s, lat, top, len) => { const q = sidePt(P, s, lat, top), ph = r(); th.push(q.x, q.y, q.z, len, ph, starT(q, top)); nt++;
      for (let y = .15 + r() * .3; y < len; y += .28 + r() * .5) { const yy = top - y; bd.push(q.x, yy, q.z, y); bt.push(starT(q, yy) + r() * .4, ph, r(), .017 + .022 * r() * r()); nb++; } };
    for (let s = -6; s < L + 8; s += .22) { const lat = (r() * 2 - 1) * 3.1, top = crown - .2 - Math.abs(lat) * .22 + r() * .5; thread(s + r() * .2, lat, top, Math.min(.5 + r() * 2.2, top - 4.8)); }   // over the channel: never lower than 4.8 m
    for (const sd of [-1, 1]) for (let s = -6; s < L + 8; s += .11) { const lat = 3.7 + Math.pow(r(), 1.2) * 10.5, top = 5 + r() * 3.6, len = 1.5 + r() * (top - 1.9), ss = s + r() * .1;
      if (top - len < 4.2 && blocked(Z, ss, sd * lat, .4)) continue; thread(ss, sd * lat, top, len); }
    const sway = `vec3 sw(vec3 c, float y, float ph){ c.x += .012 * y * sin(uT * .7 + ph * 40.); c.z += .01 * y * cos(uT * .6 + ph * 31.); return c; }`;
    fx.add(inst(nb, { iP: bd, iR: bt }, mat(`attribute vec4 iP, iR; varying vec3 vC; uniform vec3 cStar, cGill, cPink; ${sway}
      void main(){ float a = uT - iR.x, on = smoothstep(0., .22, a), tw = .7 + .3 * sin(uT * (1. + 2.5 * iR.z) + iR.z * 50.);
        vC = mix(mix(cStar, cGill * 1.7, step(.68, iR.z)), cPink * 1.3, step(.92, iR.z)) * (.05 + on * (3.4 * tw + 7. * exp(-max(a, 0.) * 3.))); gl_Position = bb(sw(iP.xyz, iP.w, iR.y), iR.w); }`,
      `varying vec3 vC; void main(){ float d = dot(vP, vP); gl_FragColor = vec4(vC * vF * (exp(-d * 5.) + .5 * exp(-d * 30.)) * step(d, 1.), 1.); }`), 'glowworm_beads'));
    const lg = new THREE.PlaneGeometry(2, 1, 1, 6); lg.translate(0, -.5, 0);
    fx.add(inst(nt, { iA: th.filter((_, i) => i % 6 < 4), iB: th.filter((_, i) => i % 6 >= 4) }, mat(`attribute vec4 iA; attribute vec2 iB; varying float vI; ${sway}
      void main(){ float y = -position.y * iA.w; vec3 c = sw(iA.xyz - vec3(0., y, 0.), y, iB.x); vec4 mv = modelViewMatrix * vec4(c, 1.); float d = length(mv.xyz); vF = exp(-fogD * fogD * d * d); vP = position.xy;
        float w = max(.003, d * uPx * .6); vI = (.02 + .16 * smoothstep(0., .5, uT - iB.y)) * min(1., .003 / w * 3.); mv.x += position.x * w; gl_Position = projectionMatrix * mv; }`,
      `varying float vI; uniform vec3 cStar; void main(){ gl_FragColor = vec4(cStar * vI * vF * (1. - vP.x * vP.x), 1.); }`), 'glowworm_silk', lg));
    fx.userData.beads = nb; fx.userData.threads = nt; }

  // ---- the wake of stars: sparks on the water inside the V the hull opens (closed form from the boat's arc length)
  { const n = 9000, a = [], b = []; for (let i = 0; i < n; i++) { const s = -2 + r() * (L + 2), lat = (r() * 2 - 1) * 5.2, q = sidePt(P, s, lat, .02); a.push(q.x, q.z, s, lat); b.push(r(), r(), r()); }
    fx.add(inst(n, { iP: a, iR: b }, mat(`attribute vec4 iP; attribute vec3 iR; varying vec3 vC; uniform vec4 uBoat; uniform vec3 cCap, cStar;
      void main(){ float d = uBoat.x - iP.z + 2.3, al = abs(iP.w), w = d < 2.3 ? .8 * sqrt(max(d, 0.) / 2.3) : .8 + .2 * (d - 2.3), spd = smoothstep(.05, .8, uBoat.y);
        float arm = exp(-pow((al - w) / (.16 + .03 * d), 2.)) * exp(-d / 9.), ins = step(al, w) * exp(-d / 5.) * .5, tw = pow(.5 + .5 * sin(uT * (5. + 9. * iR.x) + iR.y * 60.), 5.);
        float k = step(0., d) * spd * (arm + ins) * tw; vC = mix(cCap, cStar, iR.z) * k * 9.; gl_Position = bb(vec3(iP.x, .02, iP.y), k < .01 ? 0. : .012 + .02 * iR.z); }`,
      `varying vec3 vC; void main(){ float d = dot(vP, vP); gl_FragColor = vec4(vC * vF * (exp(-d * 6.) + exp(-d * 40.)) * step(d, 1.), 1.); }`), 'wake_sparks')); }

  // ---- warm fireflies (the lantern's echo): they part around the lantern and close again; none near the lens
  { const n = 520, a = [], b = []; for (let i = 0; i < n; i++) { const s = -4 + r() * (L + 8), q = sidePt(P, s, (r() * 2 - 1) * 7, .35 + r() * r() * 3.4); a.push(q.x, q.y, q.z, starT(q, 3)); b.push(r(), r(), r(), r()); }
    fx.add(inst(n, { iP: a, iR: b }, mat(`attribute vec4 iP, iR; varying vec3 vC; uniform vec3 uLan, cWarm;
      void main(){ float f = .3 + .7 * iR.x; vec3 c = iP.xyz + vec3(.7 * sin(uT * f + iR.y * 6.283), .3 * sin(uT * f * 1.3 + iR.z * 12.6), .7 * cos(uT * f * .8 + iR.w * 6.283));
        vec3 dl = c - uLan; float l2 = dot(dl, dl); c += normalize(dl + vec3(0., .001, 0.)) * 1.25 * exp(-l2 / 2.4);
        float near = smoothstep(1.6, 3.2, distance(c, cameraPosition)), aw = .3 + .7 * smoothstep(0., .6, uT - iP.w), pl = .25 + .75 * pow(.5 + .5 * sin(uT * (1.4 + 2. * iR.z) + iR.w * 30.), 2.);
        vC = cWarm * 11. * aw * pl * near * (1. + 1.5 * exp(-l2 / 6.)); gl_Position = bb(c, .016 + .012 * iR.y); }`,
      `varying vec3 vC; void main(){ float d = dot(vP, vP); gl_FragColor = vec4(vC * vF * (exp(-d * 5.) * .6 + exp(-d * 28.)) * step(d, 1.), 1.); }`), 'fireflies')); }

  // ---- root tips drip, every drop bursts into a glowing ring (two rings, the second smaller and later)
  { const n = 90, a = [], b = []; for (let i = 0; i < n; i++) { const s = 2 + r() * (L - 2), sd = r() < .5 ? -1 : 1, q = sidePt(P, s, sd * (1.9 + r() * 5), 0); a.push(q.x, q.z, 2.4 + r() * 3.2, r()); b.push(4.6 + r() * 2, r(), starT(q, 1)); }
    const cyc = `float period = iP.z, u = mod(uT + iP.w * period, period), tf = .62;`;
    const rg = new THREE.PlaneGeometry(2, 2); rg.rotateX(-Math.PI / 2);
    fx.add(inst(n, { iP: a, iR: b }, mat(`attribute vec4 iP; attribute vec3 iR; varying vec2 vQ; varying vec3 vK; uniform vec3 cCap;
      void main(){ ${cyc} float a = u - tf, R = 1.5; vQ = position.xz; vK = vec3(a, .25 + .75 * smoothstep(0., .6, uT - iR.z), 0.);
        vec4 mv = modelViewMatrix * vec4(iP.x + position.x * R, .015, iP.y + position.z * R, 1.); vF = exp(-fogD * fogD * dot(mv.xyz, mv.xyz)); vP = position.xy; gl_Position = projectionMatrix * mv; if (a < 0.) gl_Position = vec4(2., 2., 2., 1.); }`,
      `varying vec2 vQ; varying vec3 vK; uniform vec3 cCap; void main(){ float d = length(vQ), a = vK.x, r1 = .08 + .52 * sqrt(a) , r2 = .04 + .34 * sqrt(max(a - .35, 0.));
        float g = exp(-pow((d - r1) / .022, 2.)) * exp(-a * 1.3) + .7 * step(.35, a) * exp(-pow((d - r2) / .02, 2.)) * exp(-(a - .35) * 1.6) + .5 * exp(-d * d * 90.) * exp(-a * 5.);
        gl_FragColor = vec4(cCap * g * 2.6 * vK.y * vF, 1.); }`, { side: THREE.DoubleSide }), 'drip_rings', rg));
    fx.add(inst(n, { iP: a, iR: b }, mat(`attribute vec4 iP; attribute vec3 iR; varying float vI; uniform vec3 cCap;
      void main(){ ${cyc} float k = u / tf, y = iR.x * (1. - k * k); vI = step(u, tf) * (.3 + .7 * k); vec4 mv = modelViewMatrix * vec4(iP.x, y, iP.y, 1.); float d = length(mv.xyz); vF = exp(-fogD * fogD * d * d); vP = position.xy;
        mv.xy += position.xy * vec2(max(.008, d * uPx * .7), .03 + .1 * k); gl_Position = projectionMatrix * mv; }`,
      `varying float vI; uniform vec3 cStar; void main(){ gl_FragColor = vec4(cStar * vI * vF * 1.6 * exp(-dot(vP, vP) * 2.5), 1.); }`), 'drips')); }

  // ---- the cave mouth ahead glows red (the gorge is waiting): one big soft sprite past the last arch
  { const q = sidePt(P, L + 16, 0, 3.2); const m = inst(1, { iP: [q.x, q.y, q.z, 9] }, mat(`attribute vec4 iP; void main(){ gl_Position = bb(iP.xyz, iP.w); vF = 1.; }`,
      `void main(){ float d = dot(vP, vP); gl_FragColor = vec4(vec3(1., .2, .1) * .55 * (exp(-d * 2.6) - .074) * step(d, 1.), 1.); }`), 'cave_mouth'); m.renderOrder = -1; fx.add(m); }
  g.add(fx); return fx;
}

export function update(ctx, t) {
  if (!U) return; const A = ctx.anchors(t), s = ctx.now.s, e = .02, v = (ctx.anchors(t + e).s - ctx.anchors(t - e).s) / (2 * e);
  U.uBoat.value.set(s, Math.max(0, v), 0, 0); U.uLan.value.copy(A.lantern);
  const cam = ctx.camera; U.uPx.value = 2 * Math.tan(cam.fov * Math.PI / 360) / 1080 * 1.1;
  const sh = ctx.SHOTS.shots.find(x => t >= x.t0 && t < x.t1); cam.getWorldDirection(_d); _v.copy(A.hero).sub(cam.position);
  U.uDof.value.set(Math.max(.3, _v.dot(_d)), sh ? (sh.lens ?? 35) / 1000 / (sh.fstop ?? 4) / 2 * (sh.dofK ?? 1) : 0, 5.5);
}
