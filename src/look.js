// ============================================================ LOOK (Fable, stage C): water, wake, sky, air, light rig, grade. See ride/LOOK.md.
//
// makeLook(ctx) -> { setWorld(params), update(t), renderReflection(), water, sky, key, hemi, heroLights, flare, mist, shafts, wakeAt, pathCoords, U, air }
//   ctx = { THREE, renderer, scene, camera, WORLD, RW, RH, POSTK, TL, SHOTS, now, anchors(t) }
//     renderer : WebGLRenderer, linear output (outputColorSpace = Linear, NoToneMapping); everything is HDR linear until post.
//     scene    : root. camera lives in scene. WORLD (Group in scene) holds EVERYTHING that reflects (worlds, boat, hero, sky, lights).
//     camera   : PerspectiveCamera, already set (jittered for AA/DOF) for the current sub-sample when update/renderReflection run.
//     RW, RH   : internal render size (3840x2160 final, 1920x1080 at ?res=1x, 960x540 at ?res=half).
//     POSTK    : post.js. POST.veil / POST.veilC are owned by main.js (realm veil) - never set here.
//   setWorld(params) : called once when the active world changes (always on a hard cut under a full veil). params = world module `look`
//                      (schema + defaults: DEF below; every field optional).
//   update(t)        : per sub-sample, pure function of t (and of the camera main.js has just set). No accumulated state.
//   renderReflection(): per sub-sample BEFORE the main draw: renders the mirrored WORLD into the reflection target.
//   wakeAt(world, pos, t = ctx.now.t) -> 0 asleep .. 1 awake. Also a module export. The visible ring on the water IS this edge.
// Rules: no state carried between calls (renderAt(t) must be pure), no specular except water + lamps, one palette per world.
import * as THREE from 'three';
import { col, s5, sst, clamp, lerp, mulberry } from './util.js';
import { pathOf, boatSchedule, GAMEOFF } from './path.js';

export const FRONT = 4.0;    // m behind the boat centre (= 2 m behind the stern): where the world wakes
export const BOW = .03;      // the front bows forward off-axis (a shallow U she drags behind her): s_front = sBoat - FRONT + BOW * lat^2

// ------------------------------------------------------------------ world defaults (a world's `look` overrides any leaf)
const DEF = {
  palette: { skyTop: '#6a8ab0', skyMid: null, skyHorizon: '#f0d8b0', skyBottom: '#806850', sun: '#ffe0a0', cloud: '#ffffff', cloudShade: '#8fa4b8', streak: '#ffffff', wake: '#ffc878', wakeGlow: '#000000',
    ceilGlow: '#000000', star: '#bff8ff', lantern: '#ffb45e', lanternCore: '#fff1c8' },
  sunDir: [0, .2, 1],
  sun: { size: .03, disc: 6, glow: .6 },                         // radians, HDR disc, halo
  sky: { exp: .55, midH: .18, cumulus: 0, streaks: 0, streakU: 2, streakV: 18, ceil: 0, stars: 0, hazeK: 7, haze: 1 },
  fog: { color: '#ffffff', density: .01, mist: 0, mistH: 1.5, banks: .5, scatter: 0, scatterC: '#ffffff' },   // exp2 + height mist (per m at y=0) + sun in-scatter
  mist: { count: 0, color: '#ffffff', opacity: .3, size: [34, 4.5], side: [6, 22] },                         // soft billboards on the water
  shafts: { count: 0, color: '#fff6dc', k: .5, r: [1.2, 2.6], len: 30, side: [2, 9], every: 7, s0: 14 },
  water: { tint: '#304040', deep: '#101818', mirror: .95, f0: .35, rough: .03, ripple: .004, rippleScale: 1, swell: 0, glit: .5, colTh: 2.6, colLen: 1, broken: .8,
    clarity: 0, caust: 0, caustC: '#bfefe4', carpet: 0, leafAsleep: '#6a3028', leafAwake: '#c8102e', wakeAmp: 1, front: 1 },
  light: { key: '#ffffff', keyI: 2, hemiSky: '#ffffff', hemiGround: '#404040', hemiI: .8, rim: '#ffffff', rimI: 60, faceI: 4 },
  grade: { exposure: 1, con: 1, sat: [.65, 1.1], bloom: [.7, .8], vig: .25, lift: .01, tint: '#ffffff', hal: 0, blk: '#000000', knee: .76, asleepEv: .4, asleepTint: '#e9f0ff', wakeT: [.6, 3.6], grain: .03 },
  awake: null,                                                   // optional { palette, fog, light, water, mist } overrides reached at full wake
  finale: false,                                                 // the Still Lake: wake + bloom follow TL.finale instead of the boat
};
const merge = (d, o) => { const r = { ...d }; if (o) for (const k in o) r[k] = (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) ? merge(d[k], o[k]) : o[k]; return r; };

// ------------------------------------------------------------------ the wake (closed form: schedule + path table)
let CTX = null, SCHED = null;
function boatState(world, t) {
  let g = null, first = null; for (const x of SCHED.segs) if (x.world === world) { first = first || x; if (t >= x.t0 - 1e-9) g = x; }
  if (!g) return { s: first ? first.s0 : 0, v: 0, t0: first ? first.t0 : 0 };
  const dt = clamp(t - g.t0, 0, g.D), k = (g.v1 - g.v0) / g.D; return { s: g.s0 + g.v0 * dt + .5 * k * dt * dt, v: t > g.t1 ? 0 : g.v0 + k * dt, t0: first.t0 };
}
const TABLES = {};
function tableOf(world) {
  if (TABLES[world]) return TABLES[world];
  const P = pathOf(world), N = 256, a = new Float32Array(N * 4), p = new THREE.Vector3(), tg = new THREE.Vector3(), z0 = P.pointAt(0).z, z1 = P.pointAt(P.length).z;
  for (let i = 0; i < N; i++) { const z = z0 + (z1 - z0) * i / (N - 1); let lo = 0, hi = P.length; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (P.pointAt(m, p).z < z) lo = m; else hi = m; }
    const s = (lo + hi) / 2; P.pointAt(s, p); P.tangentAt(s, tg); a.set([p.x, s, tg.x, 0], i * 4); }
  const tex = new THREE.DataTexture(a, N, 1, THREE.RGBAFormat, THREE.FloatType); tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return TABLES[world] = { a, z0, z1, N, tex };
}
// river coordinates of a world point: lat (m off the centre line, + = boat's left) and s (arc length). Same maths as the water shader.
export function pathCoords(world, x, z) {
  const T = tableOf(world), zc = clamp(z, T.z0, T.z1), f = (zc - T.z0) / (T.z1 - T.z0) * (T.N - 1), i = Math.min(T.N - 2, Math.floor(f)), u = f - i, a = T.a, j = i * 4;
  const cx = lerp(a[j], a[j + 4], u), s = lerp(a[j + 1], a[j + 5], u), tx = lerp(a[j + 2], a[j + 6], u), lat = x - cx;
  return { lat: lat * Math.sqrt(Math.max(0, 1 - tx * tx)), s: s + (z - zc) + lat * tx };
}
const finaleWake = (t) => { const tb = CTX.TL.finale.bloom[0]; return s5(tb + .4, tb + 1.6, t); };
// 0 asleep .. 1 awake for a world point (Vector3) or an arc length (number). Eased over .8 s behind the travelling front; never turns off.
export function wakeAt(world, pos, t = CTX.now.t) {
  if (world === 'finale') return finaleWake(t);                 // the lake wakes with the bloom, not with the boat
  const B = boatState(world, t), on = world === 'marsh' ? s5(CTX.TL.lanternOn[0], CTX.TL.lanternOn[1], t) : 1;
  const pc = typeof pos === 'number' ? { lat: 0, s: pos } : pathCoords(world, pos.x, pos.z); if (typeof pos !== 'number') pc.lat -= GAMEOFF.lat;   // GAME: the front bows around the steered boat
  return on * s5(0, 1, (B.s - pc.s - FRONT + BOW * pc.lat * pc.lat) / Math.max(.8 * B.v, .3));
}

// ------------------------------------------------------------------ shared GLSL: tiled value noise + the air (fog) used by EVERY material
const NOISE = `uniform sampler2D tN;
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return texture2D(tN, (i + f + .5) / 256.).r; }
  vec4 h4(vec2 c){ return texture2D(tN, (c + .5) / 256.); }
  float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + vec2(17.3, 9.1); a *= .5; } return s / .9375; }`;
// exp2 distance fog + a mist layer hugging the water (analytic height integral, slow banks) + sun in-scatter. All zero -> plain FogExp2.
const AIR = `uniform vec4 uMist; uniform vec4 uSunF; uniform vec3 uSunC; uniform vec4 uUW; uniform vec4 uUWk;
  vec3 lookFog(vec3 c, vec3 wp, vec3 fogC, float dens){
    vec3 v = wp - cameraPosition; if (uUWk.w > .5) v.y = -v.y; float d = length(v), f = 1. - exp(-dens*dens*d*d);
    float y0 = cameraPosition.y * uMist.y, y1 = abs(wp.y) * uMist.y, dy = y1 - y0, I = abs(dy) > 1e-3 ? (exp(-y0) - exp(-y1)) / dy : exp(-y0);
    float bank = 1. + uMist.z * sin(wp.x*.11 + uMist.w*.13 + 2.*sin(wp.z*.07 + uMist.w*.05)) * sin(wp.z*.083 - uMist.w*.09);
    f = 1. - (1. - f) * exp(-uMist.x * d * I * max(bank, 0.));
    float s = pow(max(dot(v / max(d, 1e-4), uSunF.xyz), 0.), 5.) * uSunF.w;
    return mix(c, fogC + uSunC * s, f); }`;
const FOGU = { uMist: { value: new THREE.Vector4(0, 1, 0, 0) }, uSunF: { value: new THREE.Vector4(0, 1, 0, 0) }, uSunC: { value: new THREE.Color(0, 0, 0) },
  uUW: { value: new THREE.Vector4(0, 0, 0, 0) }, uUWk: { value: new THREE.Vector4(0, .33, 0, 0) } };   // uUW rgb = deep colour, a = on; uUWk = (caustics, 1/depth, 0, mirrorPass)
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG\n varying float vFogDepth; varying vec3 vFogW;\n#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogW = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;\n#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogW;\n #ifdef FOG_EXP2\n uniform float fogDensity;\n #else\n uniform float fogNear; uniform float fogFar;\n #endif\n ${AIR}\n#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float lkDens = fogDensity;
  #else
    float lkDens = 1.5 / fogFar;
  #endif
  if (uUW.a > .5 && uUWk.w < .5 && vFogW.y < 0.) {   // anything under the surface: depth tint + crawling caustics (main pass only)
    float uwD = -vFogW.y, uwT = uMist.w; vec2 uwP = vFogW.xz * 1.4;
    float uwC = pow(.5 + .5 * sin(uwP.x * 1.7 + 1.3 * sin(uwP.y * 1.1 + uwT * .6)) * sin(uwP.y * 1.9 + 1.2 * sin(uwP.x * 1.3 - uwT * .5)), 5.);
    gl_FragColor.rgb = mix(gl_FragColor.rgb * (1. + uUWk.x * 3. * uwC), uUW.rgb, 1. - exp(-uwD * uUWk.y)); }
  gl_FragColor.rgb = lookFog(gl_FragColor.rgb, vFogW, fogColor, lkDens);
#endif`;
// every material (built-in or not) gets the shared air uniforms; a material with its own onBeforeCompile should call look.air(shader) too.
THREE.Material.prototype.onBeforeCompile = function (sh) { Object.assign(sh.uniforms, FOGU); };

export function makeLook(ctx) {
  const { renderer, scene, camera, WORLD, RW, RH, POSTK, TL, SHOTS } = ctx;
  CTX = ctx; SCHED = boatSchedule(SHOTS.shots);
  const { POST, matTone, matBright, matLV } = POSTK;

  // ---- shared uniforms
  const nz = new Uint8Array(256 * 256 * 4), rnd = mulberry(4141); for (let i = 0; i < nz.length; i++) nz[i] = rnd() * 256;
  const tN = new THREE.DataTexture(nz, 256, 256, THREE.RGBAFormat); tN.wrapS = tN.wrapT = THREE.RepeatWrapping; tN.minFilter = tN.magFilter = THREE.LinearFilter; tN.needsUpdate = true;
  scene.fog = new THREE.FogExp2('#ffffff', .01);
  const U = { time: { value: 0 }, tN: { value: tN }, fogC: { value: scene.fog.color }, fogD: { value: .01 }, ...FOGU };
  const C = () => ({ value: new THREE.Color() }), V4 = () => ({ value: new THREE.Vector4() });

  // ---- sky: dome in WORLD; colour from OBJECT-space direction so the mirrored copy shows the right sky in the water
  const skyU = { top: C(), mid: C(), hor: C(), bot: C(), sun: C(), sunDir: { value: new THREE.Vector3(0, .2, 1) }, sunP: V4(), cloudC: C(), cloudS: C(), streakC: C(), ceilG: C(), starC: C(),
    cl: V4(), ceilP: V4(), hazeP: { value: new THREE.Vector2(7, 1) }, gexp: { value: .55 }, time: U.time, tN: U.tN, fogC: U.fogC, uSunF: U.uSunF, uSunC: U.uSunC };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top, mid, hor, bot, sun, sunDir, cloudC, cloudS, streakC, ceilG, starC, fogC, uSunC; uniform vec4 sunP, cl, ceilP, uSunF; uniform vec2 hazeP; uniform float gexp, time; varying vec3 vD;
      ${NOISE}
      void main(){ vec3 d = normalize(vD); float h = d.y;
        vec3 c = h > sunP.w ? mix(mid, top, pow(clamp((h - sunP.w) / (1. - sunP.w), 0., 1.), gexp)) : h > 0. ? mix(hor, mid, smoothstep(0., 1., h / sunP.w)) : mix(hor, bot, pow(clamp(-h * 3., 0., 1.), .7));
        vec2 az = normalize(d.xz + vec2(1e-5)); float cd = dot(d, sunDir), sd = max(cd, 0.);
        if (cl.y > 0. && h > 0.) {                                    // thin high streaks (cirrus / rose strips)
          float sk = fbm(vec2(dot(az, vec2(.8, .6)) * cl.z + time * .003, h * cl.w + az.y * 1.7));
          sk = smoothstep(.46, .72, sk) * smoothstep(.015, .1, h) * (1. - smoothstep(.45, .95, h)); c = mix(c, streakC, sk * cl.y); }
        if (cl.x > 0. && h > -.02) {                                  // tall soft cumulus standing on the horizon
          float tw = fbm(az * 1.7 + 5.), tp = cl.x * smoothstep(.3, .72, tw) * .85 + .015, bil = fbm(vec2(az.x * 6. + h * 9., az.y * 6. - h * 7.) + time * .002);
          float e = tp + .13 * (bil - .5) - h, cm = smoothstep(0., .05, e) * smoothstep(.02, .06, tp + .1 * bil);
          float sh = clamp(h / max(tp, 1e-3), 0., 1.); vec3 cc = mix(cloudS, cloudC, clamp(.2 + sh * (.45 + 1.1 * bil), 0., 1.));
          c = mix(c, cc, cm * .94); }
        if (ceilP.x > 0.) {                                           // the Underroot: a root ceiling with glow veins and glow-worm stars
          vec2 p = d.xz / max(h + .3, .08); float rn = fbm(p * 1.3 + 3.), ve = pow(1. - abs(2. * vn(p * 2.6 + rn * 2.) - 1.), 6.);
          vec3 cc = top * (.45 + 1.3 * rn) + ceilG * ve * (.12 + .5 * ceilP.w);
          vec2 sg = p * 30.; vec4 hh = h4(floor(sg)); vec2 sp = fract(sg) - (.25 + .5 * hh.xy);
          float st = exp(-dot(sp, sp) * 260.) * step(.55, hh.z) * (.55 + .45 * sin(time * (1. + hh.w * 2.) + hh.w * 40.)) * (1. - smoothstep(ceilP.z * .6, ceilP.z, length(p)));
          cc += starC * st * 2.2 * ceilP.y; c = mix(c, cc, ceilP.x * smoothstep(-.08, .1, h)); }
        vec3 fc = fogC + uSunC * pow(sd, 5.) * uSunF.w; c = mix(c, fc, clamp(exp(-max(h, 0.) * hazeP.x) * hazeP.y, 0., 1.));   // the horizon dissolves into the air
        c += sun * (smoothstep(cos(sunP.x * 1.5), cos(sunP.x * .7), cd) * sunP.y + pow(sd, 160.) * sunP.z + pow(sd, 12.) * sunP.z * .2);
        gl_FragColor = vec4(c, 1.); }` }));
  sky.renderOrder = -10; sky.frustumCulled = false; WORLD.add(sky);

  // ---- light rig (in WORLD so it mirrors with the geometry). Count never changes: no recompiles between worlds.
  const hemi = new THREE.HemisphereLight('#ffffff', '#404040', .8); WORLD.add(hemi);
  const key = new THREE.DirectionalLight('#ffffff', 2); WORLD.add(key); WORLD.add(key.target);
  const rim = new THREE.SpotLight('#ffffff', 0, 14, .5, 1, 1.4); WORLD.add(rim); WORLD.add(rim.target);        // camera-locked edge light on her (az +150, 35 deg up)
  const face = new THREE.SpotLight('#ffb45e', 0, 6, .34, 1, 1.2); WORLD.add(face); WORLD.add(face.target);     // hidden soft face light on the camera side, 20 deg above her eye line
  const flareU = { colA: C(), colB: C(), k: { value: 0 }, size: { value: .95 } };
  const flare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: flareU, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: `uniform float size; varying vec2 vU; void main(){ vU = position.xy * 2.; vec4 mv = modelViewMatrix * vec4(0., 0., 0., 1.); mv.xy += position.xy * size; mv.z += .22; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 colA, colB; uniform float k; varying vec2 vU;
      void main(){ float r = length(vU), disc = exp(-r * r * 150.), halo = exp(-r * 5.5) * .16;
        float sv = exp(-abs(vU.x) * 34.) * exp(-abs(vU.y) * 5.5), shz = exp(-abs(vU.y) * 30.) * exp(-abs(vU.x) * 2.8);
        vec3 c = colB * disc * 2.4 + colA * (halo + sv * .3 + shz * .45); gl_FragColor = vec4(c * k * (1. - smoothstep(.75, 1., r)), 1.); }` }));
  flare.frustumCulled = false; flare.renderOrder = 6; WORLD.add(flare);
  const heroLights = { rim, face, flare };

  // ---- water: planar mirror at y = 0 (mirror RT at half res, sampled in screen space)
  let REFL = 2;   // GAME: reflection target = render size / REFL (quality step-down raises it)
  const rtRefl = new THREE.WebGLRenderTarget(RW >> 1, RH >> 1, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const wU = { tRefl: { value: rtRefl.texture }, tStreak: { value: null }, tPath: { value: null }, res: { value: new THREE.Vector2(RW, RH) }, uVP: { value: new THREE.Matrix4() }, time: U.time, tN: U.tN, fogC: U.fogC, fogD: U.fogD,
    uMist: U.uMist, uSunF: U.uSunF, uSunC: U.uSunC, uUW: U.uUW, uUWk: U.uUWk,
    tint: C(), deep: C(), wakeC: C(), wakeGlow: C(), caustC: C(), leafA: C(), leafB: C(), leafL: C(),
    wp: V4(),       // mirror, f0, rough, ripple
    wq: V4(),       // rippleScale, swell, glit, colTh
    wr: V4(),       // colLen, broken, clarity, caust
    ws: V4(),       // carpet, wakeAmp, front intensity, asleep saturation
    wt: V4(),       // whole water awake (finale), lantern lit, dither seed, GAME: boat lateral offset
    pathZ: V4(), boat: V4(), ring: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] } };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: wU, fog: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D tRefl, tStreak, tPath; uniform vec2 res; uniform mat4 uVP; uniform float time, fogD;
      uniform vec3 tint, deep, fogC, wakeC, wakeGlow, caustC, leafA, leafB, leafL; uniform vec4 wp, wq, wr, ws, wt, pathZ, boat, ring[3]; varying vec3 vW;
      ${NOISE}
      ${AIR}
      vec2 wav(vec2 p, vec2 k, float w, float ph){ return k * cos(dot(p, k) * w + time * ph); }
      vec2 pathAt(vec2 p){ float zc = clamp(p.y, pathZ.x, pathZ.z); vec4 t = texture2D(tPath, vec2((zc - pathZ.x) * pathZ.y + pathZ.w, .5)); float lat = p.x - t.r;
        return vec2(lat * sqrt(max(1. - t.b * t.b, 0.)), t.g + (p.y - zc) + lat * t.b); }                      // (lateral m, arc length m)
      vec2 tapUV(float a){ vec2 q = cameraPosition.xz + (vW.xz - cameraPosition.xz) * (1. + a); vec4 c = uVP * vec4(q.x, 0., q.y, 1.); return c.xy / c.w * .5 + .5; }
      float lum(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
      float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
      float openV(float lat, float dB){ float d = dB + 2.3; if (d < 0.) return 0.;                             // the dark V the hull cuts into the leaf carpet
        float w = d < 2.3 ? .8 * sqrt(d / 2.3) : .8 + .2 * (d - 2.3); w = min(w, 3.4) * (1. - smoothstep(26., 48., dB)); return 1. - smoothstep(w - .1, w + .1, abs(lat)); }
      float caustic(vec2 p){ vec2 q = p + .7 * vec2(vn(p * .7 + time * .11), vn(p * .7 + 31. - time * .13));
        float a = abs(vn(q * 1.9 + time * vec2(.07, .05)) - .5) * 2., b = abs(vn(q * 2.7 - time * vec2(.05, .08) + 11.) - .5) * 2.; return pow(1. - min(a, b), 7.); }
      void main(){
        vec3 V = cameraPosition - vW; float dist = length(V); V /= dist; float cosT = clamp(V.y, .001, 1.);
        vec2 pc = pathAt(vW.xz); float lat = pc.x - wt.w, dB = boat.x - pc.y, al = abs(lat), spd = smoothstep(.03, .7, boat.y), ease = max(.8 * boat.y, .3);
        // ---- wake height: bow V + transverse wavelets + two slow rings left on the path behind her
        float hW = 0., crest = 0., dv = dB + 1.9;
        if (dv > 0.) { float arm = al - (.22 + .3 * dv), w = .1 + .035 * dv; crest = exp(-arm * arm / (w * w)) * exp(-dv / 16.) * smoothstep(0., .8, dv);
          hW += crest * cos(arm * 7. / (1. + .04 * dv));
          hW += .35 * (1. - smoothstep(-.6, 0., arm)) * sin(dv * 5.2 - al * 1.5) * exp(-dv / 7.) * smoothstep(2.5, 4.5, dv); }
        for (int i = 0; i < 3; i++) { float r = length(vW.xz - ring[i].xy) - ring[i].z, g = ring[i].w * exp(-r * r * 5.); hW += g * cos(r * 9.); crest += g * .6; }
        hW *= spd * ws.y; crest *= spd * ws.y;
        vec2 dx = dFdx(vW.xz), dy = dFdy(vW.xz); float hx = dFdx(hW), hy = dFdy(hW), det = dx.x * dy.y - dx.y * dy.x;
        vec2 gW = abs(det) > 1e-12 ? vec2(hx * dy.y - hy * dx.y, hy * dx.x - hx * dy.x) / det : vec2(0.); gW *= (1. - smoothstep(30., 90., dist)) / max(1., length(gW) * .25);
        // ---- surface normal: closed-form ripple + slow swell + micro noise + wake
        vec2 p = vW.xz * wq.x;
        vec2 n = (wav(p, vec2(.8,.6), 1.7, 1.3) + .6 * wav(p, vec2(-.5,.86), 2.9, 1.9) + .35 * wav(p, vec2(.95,-.3), 5.3, 2.7) + .2 * wav(p, vec2(-.2,-.98), 9.1, 3.4)) * wp.w;
        n += wq.y * (wav(vW.xz, vec2(.3,.95), .35, .5) + .5 * wav(vW.xz, vec2(-.6,.8), .6, .7)) + (vn(p * 9. + time * vec2(.3, .2)) - .5) * wp.w * .8 + gW * .007;
        vec2 suv = gl_FragCoord.xy / res, off = n * vec2(1., 1.6) / (1. + .08 * dist);
        // ---- mirror: roughness smear along the view line (5 taps) ...
        float rr = wp.z * 3., dth = ign(gl_FragCoord.xy + wt.z * 211.) - .5;                                    // per-sub-sample dither: taps melt into a smear
        vec3 r = texture2D(tRefl, suv + off).rgb * .34 + texture2D(tRefl, tapUV((-.45 + .5 * dth) * rr) + off).rgb * .18 + texture2D(tRefl, tapUV((.5 + .5 * dth) * rr) + off).rgb * .2
               + texture2D(tRefl, tapUV((1.1 + .7 * dth) * rr) + off).rgb * .16 + texture2D(tRefl, tapUV((2. + 1.1 * dth) * rr) + off).rgb * .12;
        // ---- ... and every light / bright pixel pulled toward the eye into a long column (tStreak: bright-pass smeared down the screen), cut into dashes by ripples
        vec3 colm = texture2D(tStreak, suv + off * 1.5 + vec2((vn(vW.xz * 2.3) - .5) * .004, 0.)).rgb; colm /= 1. + lum(colm) / 5.;
        vec2 vd = normalize(vW.xz - cameraPosition.xz), mp = vec2(dot(vW.xz, vec2(vd.y, -vd.x)) * 1.1, dot(vW.xz, vd) * 6.) * wq.x;
        colm *= mix(1., smoothstep(.36, .6, vn(mp + time * vec2(.1, .5))), wr.y * (1. - smoothstep(.25, .9, fwidth(mp.y))));
        float F = wp.x * mix(wp.y, 1., pow(1. - cosT, 4.));
        vec3 body = mix(tint, deep, pow(cosT, .8));
        if (wr.w > 0.) body += caustC * caustic(vW.xz * .55) * wr.w * (.3 + .7 * cosT);
        vec3 c = mix(body, r, F) + colm * wq.z * F;
        // ---- asleep ahead of the front, awake behind it (.8 s ease). wt.x = whole lake awake (finale), wt.y = lantern lit
        float dF = dB - boat.z + boat.w * lat * lat, aw = mix(smoothstep(0., ease, dF) * wt.y, 1., wt.x);
        c = mix(mix(vec3(lum(c)), c, ws.w) * vec3(.9, .97, 1.06) * .84, c, aw);
        // ---- leaf carpet (Ember Gorge): whole leaves, parted by the hull into a dark V, brown-red asleep -> crimson awake
        float fa = 0.; vec3 lc = vec3(0.);
        if (ws.x > 0.) { const float LS = .3; vec2 g = vW.xz / LS, ci = floor(g); float best = -1.;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 cc = ci + vec2(float(i), float(j)); vec4 h = h4(cc); vec2 ctr = cc + .2 + .6 * h.xy, l = g - ctr;
            vec2 dc = (ctr - g) * LS; float latC = lat + dc.x, dBC = dB - dc.y;
            float vis = step(h.z, ws.x * (1. - openV(latC, dBC)) * 1.02);
            float ang = h.w * 6.283, cs = cos(ang), sn = sin(ang); vec2 q = vec2(cs * l.x + sn * l.y, cs * l.y - sn * l.x) / (.46 + .26 * h.x);
            float rq = length(q), R = .4 + .6 * pow(abs(cos(atan(q.x, q.y) * 2.5)), 2.2), in_ = (1. - smoothstep(R - .14, R, rq)) * vis, pri = fract(h.x * 7.3 + h.y * 3.1);
            if (in_ > 0. && pri > best) { best = pri; float awC = mix(smoothstep(0., ease, dBC - boat.z + boat.w * latC * latC) * wt.y, 1., wt.x);
              vec3 lf = mix(leafA, leafB, awC) * (.55 + .9 * h.z) * mix(vec3(1.), vec3(1.5, .72, .3), step(.74, fract(h.w * 5.)));
              lc = lf * (1. - .4 * (1. - smoothstep(0., .07, abs(q.x)))) * (.75 + .25 * (1. - smoothstep(0., R, rq))); fa = in_; } }
          float lod = smoothstep(.3, 1.1, length(fwidth(g)));
          lc = mix(lc, mix(leafA, leafB, aw) * 1.02, lod) * leafL; fa = mix(fa, ws.x * (1. - openV(lat, dB)) * .86, lod); }
        c = mix(c, lc, fa);
        // ---- the wake front: a thin bright edge with a soft tail and settling sparks, travelling FRONT m behind her
        float lf2 = exp(-lat * lat / 200.), spark = .55 + .9 * vn(vW.xz * 7. + time * vec2(.4, 1.1));
        float core = exp(-dF * dF / .009) * 1.5, tail = dF > 0. ? exp(-dF / .55) * .3 : exp(dF / .1) * .3;
        float shim = dF > 0. ? exp(-dF / 1.7) * pow(vn(vW.xz * 24. + time * vec2(.7, .3)), 12.) * 5. : 0.;
        c += wakeC * ws.z * lf2 * ((core * 1.6 + tail) * spark + shim * .22);
        c += wakeGlow * crest * (.1 + 1.1 * pow(vn(vW.xz * 16. + time * vec2(.5, .9)), 3.));
        c = lookFog(c, vW, fogC, fogD);
        gl_FragColor = vec4(c, 1. - wr.z * cosT * (1. - F) * (1. - fa)); }` }));
  water.renderOrder = -5; WORLD.add(water);
  // a pale bed 3.5 m down, only under clear water (the air chunk tints it by depth and crawls caustics over it)
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff' })); bed.position.y = -3.5; bed.visible = false; WORLD.add(bed);
  water.onBeforeRender = (r, s, cam) => { wU.uVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); const e = cam.projectionMatrix.elements;
    wU.wt.value.z = (Math.abs(e[8]) * 91173.1 + Math.abs(e[9]) * 71919.7 + Math.abs(cam.position.x) * 613.7) % 1; };   // dither seed from this sub-sample's jitter (pure)

  // ---- mist banks: soft billboards standing on the water (they mirror), lit by the sun through them
  const MQ = 24, mPos = new Float32Array(MQ * 18), mC = new Float32Array(MQ * 18), mS = new Float32Array(MQ * 24), QC = [[-.5, 0], [.5, 0], [.5, 1], [-.5, 0], [.5, 1], [-.5, 1]];
  for (let i = 0; i < MQ * 6; i++) { mPos[i * 3] = QC[i % 6][0]; mPos[i * 3 + 1] = QC[i % 6][1]; }
  const mistG = new THREE.BufferGeometry(); mistG.setAttribute('position', new THREE.BufferAttribute(mPos, 3)); mistG.setAttribute('aC', new THREE.BufferAttribute(mC, 3)); mistG.setAttribute('aS', new THREE.BufferAttribute(mS, 4));
  const mistU = { time: U.time, tN: U.tN, fogC: U.fogC, fogD: U.fogD, uMist: U.uMist, uSunF: U.uSunF, uSunC: U.uSunC, uUW: U.uUW, uUWk: U.uUWk, color: C(), opacity: { value: .3 } };
  const mist = new THREE.Mesh(mistG, new THREE.ShaderMaterial({ uniforms: mistU, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: `attribute vec3 aC; attribute vec4 aS; uniform float time; varying vec2 vU; varying vec3 vW; varying float vSeed;
      void main(){ vec3 c = aC + vec3(sin(time * .05 + aS.z * 6.) * 2., 0., cos(time * .04 + aS.z * 4.) * 2.5); vec3 tc = cameraPosition - c; vec3 rt = normalize(vec3(tc.z, 0., -tc.x));
        vec3 lp = c + rt * position.x * aS.x + vec3(0., position.y * aS.y, 0.); vec4 w = modelMatrix * vec4(lp, 1.); vW = w.xyz; vU = position.xy; vSeed = aS.z; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 color, fogC; uniform float opacity, time, fogD; varying vec2 vU; varying vec3 vW; varying float vSeed;
      ${NOISE}
      ${AIR}
      void main(){ float e = (1. - smoothstep(.12, .5, abs(vU.x))) * pow(1. - vU.y, 1.6);
        float n = fbm(vec2(vU.x * 5. + vSeed * 13. + time * .015, vU.y * 1.6 + vSeed * 7.)); vec3 v = vW - cameraPosition; float d = length(v); if (uUWk.w > .5) v.y = -v.y;
        float a = opacity * e * smoothstep(.2, .7, n) * smoothstep(3., 11., d);
        vec3 c = color + uSunC * pow(max(dot(v / d, uSunF.xyz), 0.), 5.) * uSunF.w; c = lookFog(c, vW, fogC, fogD * .6);
        gl_FragColor = vec4(c, a); }` }));
  mist.frustumCulled = false; mist.renderOrder = 4; WORLD.add(mist);

  // ---- light shafts: additive cones from the sun with slow dust (they mirror too)
  const SN = 12, shG = new THREE.CylinderGeometry(.5, 1, 1, 28, 1, true).translate(0, .5, 0); shG.setAttribute('aPh', new THREE.InstancedBufferAttribute(new Float32Array(SN).map((_, i) => i * .618 % 1), 1));
  const shU = { time: U.time, tN: U.tN, uUWk: U.uUWk, color: C(), k: { value: .5 } };
  const shafts = new THREE.InstancedMesh(shG, new THREE.ShaderMaterial({ uniforms: shU, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false,
    vertexShader: `attribute float aPh; varying vec3 vW, vN, vU;
      void main(){ mat4 m = modelMatrix * instanceMatrix; vec4 w = m * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(m) * vec3(position.x, 0., position.z)); vU = vec3(normalize(position.xz), position.y + aPh * 7.); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 color; uniform float k, time; uniform vec4 uUWk; varying vec3 vW, vN, vU;
      ${NOISE}
      void main(){ vec3 v = cameraPosition - vW; float d = length(v), y = fract(vU.z), nv = abs(dot(normalize(vN), v / d));
        float a = nv * nv * smoothstep(0., .1, y) * (1. - smoothstep(.4, 1., y)) * smoothstep(1.5, 6., d) * smoothstep(0., .9, uUWk.w > .5 ? -vW.y : vW.y);
        float st = .5 + .5 * vn(vU.xy * 1.6 + vec2(vU.z * 1.3, -vU.z * .8 + time * .012));
        float du = pow(vn(vU.xy * 22. + vec2(vU.z * 50., time * .1)), 9.) * 3.;
        gl_FragColor = vec4(color * k * a * (st + du), 1.); }` }), SN);
  shafts.frustumCulled = false; shafts.renderOrder = 5; shafts.count = 0; WORLD.add(shafts);

  // ---- streaks: bright-pass of the mirror image, smeared straight down the screen in three hops (1, 6, 36 steps) = long soft columns for one tap in the water
  const rtS = [0, 1].map(() => new THREE.WebGLRenderTarget(RW >> 2, RH >> 2, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
  const QVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`, qm = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: QVS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  const matSB = qm(`uniform sampler2D tex; uniform vec2 px; uniform float th; varying vec2 vUv;
    void main(){ vec3 c = vec3(0.); for (int i = 0; i < 4; i++) { vec2 o = vec2(i == 1 || i == 3 ? .5 : -.5, i > 1 ? .5 : -.5) * px; vec3 s = min(texture2D(tex, vUv + o).rgb, vec3(16.)); c += s * smoothstep(th, th * 1.8, max(s.r, max(s.g, s.b))); }
      gl_FragColor = vec4(c * .25, 1.); }`, { tex: { value: rtRefl.texture }, px: { value: new THREE.Vector2(2 / RW, 2 / RH) }, th: { value: 2.6 } });
  const matSS = qm(`uniform sampler2D tex; uniform float stp, fall, norm; varying vec2 vUv;
    void main(){ vec3 c = vec3(0.); for (int k = 0; k < 6; k++) { float fk = float(k); c += texture2D(tex, vUv + vec2(0., fk * stp)).rgb * exp(-fk * fall); } gl_FragColor = vec4(c * norm, 1.); }`, { tex: { value: null }, stp: { value: 0 }, fall: { value: 0 }, norm: { value: 1 } });
  const hop = (src, dst, stp, fall, norm) => { matSS.uniforms.tex.value = src.texture; matSS.uniforms.stp.value = stp; matSS.uniforms.fall.value = fall; matSS.uniforms.norm.value = norm; POSTK.pass(matSS, dst); };
  wU.tStreak.value = rtS[1].texture;

  // ---- mirror pass
  const clip = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.005)];
  function renderReflection() {
    const bv = bed.visible; bed.visible = water.visible = false; WORLD.scale.y = -1; WORLD.updateMatrixWorld(true); renderer.clippingPlanes = clip; FOGU.uUWk.value.w = 1;
    renderer.setRenderTarget(rtRefl); renderer.setClearColor(0, 1); renderer.clear(); renderer.render(scene, camera);
    renderer.clippingPlanes = []; WORLD.scale.y = 1; WORLD.updateMatrixWorld(true); water.visible = true; bed.visible = bv; FOGU.uUWk.value.w = 0;
    const cl = cur ? cur.water.colLen : 1, u = cl / 540; matSB.uniforms.th.value = wU.wq.value.w;
    POSTK.pass(matSB, rtS[0]); hop(rtS[0], rtS[1], u, 0, 1 / 6); hop(rtS[1], rtS[0], 6 * u, .085, 1); hop(rtS[0], rtS[1], 36 * u, .5, 1);
  }

  // ---- a world's look: everything static is set here; update(t) only animates
  let cur = null, placed = null, pairs = [], nums = [], rimI = 0;
  const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), sunV = new THREE.Vector3();
  const leafBase = new THREE.Color(), tintA = new THREE.Color(), tintB = new THREE.Color();
  const midOf = (a, b) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), .5).getHexString();
  function setWorld(P0) {
    const W = cur = merge(DEF, P0), pal = W.palette, A = W.awake || {}, Ap = A.palette || {}, Al = A.light || {}, Af = A.fog || {}, Aw = A.water || {}, L = W.light, F = W.fog, Wa = W.water, S = W.sky, G = W.grade;
    placed = null; pairs = [];
    const pc = (tgt, a, b) => pairs.push([tgt, col(a), col(b ?? a)]);
    pc(skyU.top.value, pal.skyTop, Ap.skyTop); pc(skyU.mid.value, pal.skyMid ?? midOf(pal.skyHorizon, pal.skyTop), Ap.skyMid ?? ((Ap.skyHorizon || Ap.skyTop) ? midOf(Ap.skyHorizon ?? pal.skyHorizon, Ap.skyTop ?? pal.skyTop) : undefined)); pc(skyU.hor.value, pal.skyHorizon, Ap.skyHorizon); pc(skyU.bot.value, pal.skyBottom, Ap.skyBottom); pc(skyU.sun.value, pal.sun, Ap.sun);
    pc(skyU.cloudC.value, pal.cloud, Ap.cloud); pc(skyU.cloudS.value, pal.cloudShade, Ap.cloudShade); pc(skyU.streakC.value, pal.streak, Ap.streak);
    pc(scene.fog.color, F.color, Af.color); pc(U.uSunC.value, F.scatterC, Af.scatterC); pc(mistU.color.value, W.mist.color, (A.mist || {}).color);
    pc(key.color, L.key, Al.key); pc(hemi.color, L.hemiSky, Al.hemiSky); pc(hemi.groundColor, L.hemiGround, Al.hemiGround); pc(rim.color, L.rim, Al.rim);
    pc(wU.tint.value, Wa.tint, Aw.tint); pc(wU.deep.value, Wa.deep, Aw.deep);
    nums = [[v => key.intensity = v, L.keyI, Al.keyI ?? L.keyI], [v => hemi.intensity = v, L.hemiI, Al.hemiI ?? L.hemiI], [v => rimI = v, L.rimI, Al.rimI ?? L.rimI],
      [v => scene.fog.density = U.fogD.value = v, F.density, Af.density ?? F.density], [v => U.uSunF.value.w = v, F.scatter, Af.scatter ?? F.scatter], [v => U.uMist.value.x = v, F.mist, Af.mist ?? F.mist]];
    sunV.set(...W.sunDir).normalize(); skyU.sunDir.value.copy(sunV); U.uSunF.value.set(sunV.x, sunV.y, sunV.z, F.scatter);
    skyU.sunP.value.set(W.sun.size, W.sun.disc, W.sun.glow, S.midH); skyU.gexp.value = S.exp; skyU.cl.value.set(S.cumulus, S.streaks, S.streakU, S.streakV); skyU.hazeP.value.set(S.hazeK, S.haze);
    skyU.ceilG.value.set(pal.ceilGlow); skyU.starC.value.set(pal.star);
    key.position.copy(sunV).multiplyScalar(100); key.target.position.set(0, 0, 0);
    U.uMist.value.set(F.mist, 1 / F.mistH, F.banks, 0);
    wU.wakeC.value.set(pal.wake); wU.wakeGlow.value.set(pal.wakeGlow); wU.caustC.value.set(Wa.caustC); wU.leafA.value.set(Wa.leafAsleep); wU.leafB.value.set(Wa.leafAwake);
    wU.wp.value.set(Wa.mirror, Wa.f0, Wa.rough, Wa.ripple); wU.wq.value.set(Wa.rippleScale, Wa.swell, Wa.glit, Wa.colTh); wU.wr.value.set(Wa.colLen, Wa.broken, Wa.clarity, Wa.caust);
    water.material.transparent = bed.visible = Wa.clarity > 0; bed.material.color.set(Wa.bed ?? Wa.tint); U.uUWk.value.set(Wa.caust, 1 / 3, 0, 0);
    mistU.opacity.value = W.mist.opacity; shU.color.value.set(W.shafts.color); shU.k.value = W.shafts.k;
    flareU.colA.value.set(pal.lantern); flareU.colB.value.set(pal.lanternCore); face.color.set(pal.lantern);
    matTone.uniforms.vig.value = G.vig; matTone.uniforms.lift.value = G.lift; matTone.uniforms.hal.value = G.hal; matTone.uniforms.knee.value = G.knee;
    matTone.uniforms.blk.value.set(G.blk); tintB.set(G.tint); tintA.set(G.asleepTint).multiply(tintB); if (matLV) matLV.uniforms.grain.value = G.grain;
  }
  // mist banks + shafts are laid along the world's river once per world (seeded): static config, not time state
  function place(id) {
    placed = id; const W = cur, P = pathOf(id), T = tableOf(id), r = mulberry(977 + id.length * 31 + id.charCodeAt(0));
    wU.tPath.value = T.tex; wU.pathZ.value.set(T.z0, (T.N - 1) / ((T.z1 - T.z0) * T.N), T.z1, .5 / T.N);
    const M = W.mist, n = Math.min(MQ, M.count);
    for (let i = 0; i < n; i++) { const s = P.length * (i + r()) / n, side = (i % 2 ? 1 : -1) * lerp(M.side[0], M.side[1], r()); P.sideAt(s, side, 0, _p);
      const w = M.size[0] * (.7 + .6 * r()), h = M.size[1] * (.7 + .6 * r()), sd = r(); for (let k = 0; k < 6; k++) { mC.set([_p.x, 0, _p.z], (i * 6 + k) * 3); mS.set([w, h, sd, 1], (i * 6 + k) * 4); } }
    mistG.attributes.aC.needsUpdate = mistG.attributes.aS.needsUpdate = true; mistG.setDrawRange(0, n * 6); mist.visible = n > 0;
    const Sh = W.shafts, ns = Math.min(SN, Sh.count); _q.setFromUnitVectors(UP, sunV);
    for (let i = 0; i < ns; i++) { const side = (i % 2 ? 1 : -1) * lerp(Sh.side[0], Sh.side[1], r()), rad = lerp(Sh.r[0], Sh.r[1], r()); P.sideAt(Sh.s0 + i * Sh.every + r() * 2, side, 0, _p);
      _p.addScaledVector(sunV, -1.5); shafts.setMatrixAt(i, _m.compose(_p, _q, _s.set(rad, Sh.len * (.8 + .4 * r()), rad))); }
    shafts.count = ns; shafts.instanceMatrix.needsUpdate = true; shafts.visible = ns > 0;
  }

  function update(t) {
    const W = cur; if (!W) return; const A = ctx.anchors(t), id = A.world; if (placed !== id) place(id);
    const B = boatState(id, t), G = W.grade, Wa = W.water, lan = s5(TL.lanternOn[0], TL.lanternOn[1], t), P = pathOf(id), fr = A.boatFrame;
    const D = window.LOOKCAM;   // debug only (stills of the wake): { p, q (boat space), fov }
    if (D) { camera.position.set(...D.p).applyQuaternion(fr.quat).add(fr.pos); camera.up.set(0, 1, 0); camera.lookAt(_v.set(...D.q).applyQuaternion(fr.quat).add(fr.pos)); if (D.fov) camera.fov = D.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); }
    // ---- how awake the frame is (grade + palette): the world wakes over her first seconds in it, a little more when the camera looks back
    let wG, bloomK = G.bloom[0], dim = 1;
    if (W.finale) { const tb = TL.finale.bloom[0]; wG = finaleWake(t); const pk = s5(tb, tb + .6, t) * (1 - .55 * s5(tb + .6, tb + 2.4, t)); bloomK = lerp(G.bloom[0], G.bloomPeak ?? 1.4, pk); dim = t > tb - .1 && t < tb ? .8 : 1; }
    else { wG = sst(B.t0 + G.wakeT[0], B.t0 + G.wakeT[1], t); camera.getWorldDirection(_v); P.tangentAt(B.s, _p); const hl = Math.hypot(_v.x, _v.z) || 1; wG *= .8 + .2 * (.5 - .5 * (_v.x * _p.x + _v.z * _p.z) / hl); }
    for (const [tgt, a, b] of pairs) tgt.copy(a).lerp(b, wG);
    for (const [set, a, b] of nums) set(lerp(a, b, wG));
    U.time.value = t; U.uMist.value.w = t; U.uUW.value.set(wU.deep.value.r, wU.deep.value.g, wU.deep.value.b, Wa.clarity > 0 ? 1 : 0);
    skyU.ceilP.value.set(W.sky.ceil, W.sky.stars * wG, 1 + 9 * wG, wG);
    // ---- water: boat state, the two slow rings (centres are path history), the front
    const on = id === 'marsh' ? lan : 1;
    wU.boat.value.set(B.s, B.v, W.finale ? 1e4 : FRONT, BOW); wU.wt.value.x = W.finale ? wG : 0; wU.wt.value.y = on; wU.wt.value.w = GAMEOFF.lat;
    wU.ws.value.set(Wa.carpet, Wa.wakeAmp, Wa.front * 2.6 * on * sst(.02, .3, B.v), G.sat[0] / G.sat[1]);
    const RL = 5, sb = B.s - 1.5, k0 = Math.floor(sb / RL);
    for (let i = 0; i < 3; i++) { const si = (k0 - i) * RL, age = sb - si; P.sideAt(si, GAMEOFF.lat, 0, _p); wU.ring.value[i].set(_p.x, _p.z, .25 + .42 * age, .8 * sst(0, 1.5, age) * (1 - sst(2 * RL, 3 * RL, age))); }
    wU.leafL.value.copy(hemi.color).multiplyScalar(hemi.intensity * .55).add(leafBase.copy(key.color).multiplyScalar(key.intensity * .22)).multiplyScalar(2.2 / Math.PI);
    // ---- hero lights: rim locked to the camera (az +150, 35 deg up), hidden face light on the camera side, lantern flare
    const hp = A.hero; _v.subVectors(hp, camera.position).setY(0).normalize().applyAxisAngle(UP, Math.PI / 6);
    rim.position.copy(hp).addScaledVector(_v, 5 * Math.cos(.61)).addScaledVector(UP, 5 * Math.sin(.61)); rim.target.position.copy(hp).addScaledVector(UP, -.35); rim.intensity = rimI;
    _v.subVectors(camera.position, hp).setY(0).normalize().applyAxisAngle(UP, -.45);
    face.position.copy(hp).addScaledVector(_v, 2.2 * Math.cos(.35)).addScaledVector(UP, 2.2 * Math.sin(.35)); face.target.position.copy(hp); face.intensity = W.light.faceI * lan;
    flare.position.copy(A.lantern); flareU.k.value = lan * 1.7 * (1 + .05 * Math.sin(t * 13.1) + .035 * Math.sin(t * 7.3 + 1));
    // ---- grade: asleep = desaturated, cooler, -0.4 stop; awake = the full painting
    POST.exposure = G.exposure * Math.pow(2, -G.asleepEv * (1 - wG)) * dim; POST.bloomK = bloomK * .085; matBright.uniforms.th.value = G.bloom[1] * 1.35;
    matTone.uniforms.sat.value = lerp(G.sat[0], G.sat[1], wG); matTone.uniforms.con.value = lerp(G.con, G.conAwake ?? G.con, wG); matTone.uniforms.tint.value.copy(tintA).lerp(tintB, wG);
  }
  // GAME: live resize (render size changes with the window and the quality level)
  function resize(W, H, refl = REFL) { REFL = refl; rtRefl.setSize(Math.max(2, Math.round(W / REFL)), Math.max(2, Math.round(H / REFL))); rtS.forEach(r => r.setSize(Math.max(2, W >> 2), Math.max(2, H >> 2)));
    wU.res.value.set(W, H); matSB.uniforms.px.value.set(REFL / W, REFL / H); }
  return window.LOOK = { resize, setWorld, update, renderReflection, water, sky, key, hemi, heroLights, flare, mist, shafts, wakeAt, pathCoords, U, FRONT, air: (sh) => Object.assign(sh.uniforms, FOGU) };
}
