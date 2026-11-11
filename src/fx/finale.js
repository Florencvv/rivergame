// Stage E4 finale fx (Still Lake, 35.5-45 s). Everything is closed form in t (GPU poses every sprite from attributes + uT + a few per-frame uniforms).
//   gathering 35.5-37.5: four ribbons of motes rise in front of the hovering bow, braid down it and settle into one white-gold arrow
//   flight TL.finale.arrow: flash at the bow, low arc to the trunk, ribbon trail, light line on the water
//   impact -> veins up the tree (material patch, by distance from the hit) -> jade leaves + gold-white blossom -> crown glow
//   ring on the lake (lotus lanterns surface lit, her light flips warm), light-seeds fill the sky, petals fall, end card (fx/endcard.js)
import { sprites, patch, KT, lin, THREE, mulberry, s5, sst, TAU, hsh, clamp } from './e1kit.js';
import * as CARD from './endcard.js';

const RIB = ['#ffd27a', '#5fe8d8', '#9a8cff', '#ff5a6a'];          // gold (marsh), turquoise (court), cyan-violet (grotto), crimson (gorge)
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const CR = `vec3 cr(vec3 a, vec3 b, vec3 c, vec3 d, float u){ return .5 * ((2. * b) + (-a + c) * u + (2. * a - 5. * b + 4. * c - d) * u * u + (-a + 3. * b - 3. * c + d) * u * u * u); }`;
const DIM = (k) => `if (uUWk.w < .5) { vec2 sc = (gl_FragCoord.xy / uCk.yz - uCard.xy) / uCard.zw; col *= 1. - ${k.toFixed(2)} * uCk.x * (1. - smoothstep(.55, 1.15, length(sc))); }`;   // dim inside the end-card scrim
let F = null;
export const INFO = {};
export const ready = CARD.fontReady;

export function build(ctx, g, { TREE, tp, off, road }) {
  const TL = ctx.TL, tRel = TL.finale.arrow[0], tHit = TL.finale.arrow[1], tB = TL.finale.bloom[0], r = mulberry(4141);
  const BOAT = ctx.anchors(tHit).b.pos.clone(), bowAt = (t) => ctx.bowAnchor(Math.max(t, TL.bowLift[1]));
  // ---- tree vertices (world), hit point on the trunk front, distance metric d = |y - hitY| + .9 * (r - 2.5)
  const VX = []; let H = 0;
  for (const p of tp.parts) { const a = p.geometry.attributes.position; for (let i = 0; i < a.count; i++) { VX.push(a.getX(i) + off.x, a.getY(i) + off.y, a.getZ(i) + off.z); H = Math.max(H, a.getY(i) + off.y); } }
  const NV = VX.length / 3, hitY = .25 * H; let zf = TREE.z;
  for (let i = 0; i < NV; i++) if (Math.abs(VX[i * 3 + 1] - hitY) < .9 && Math.abs(VX[i * 3] - TREE.x) < 1) zf = Math.min(zf, VX[i * 3 + 2]);
  const HIT = V3(TREE.x, hitY, zf - .04);
  const dOf = (x, y, z) => Math.abs(y - hitY) + .9 * Math.max(0, Math.hypot(x - TREE.x, z - TREE.z) - 2.5);
  const crown = []; let dMax = 1, cR = 1;
  for (let i = 0; i < NV; i++) { const x = VX[i * 3], y = VX[i * 3 + 1], z = VX[i * 3 + 2], rr = Math.hypot(x - TREE.x, z - TREE.z); const d = dOf(x, y, z); dMax = Math.max(dMax, d);
    if (y > .55 * H || (rr > 4.5 && y > .32 * H)) { crown.push(i); cR = Math.max(cR, rr); } }
  const TV0 = tB, TV = .5, tF = (d) => TV0 + TV * Math.pow(clamp(d / dMax), .8);       // the vein front reaches distance d at tF
  const CC = V3(TREE.x, .68 * H, TREE.z);
  INFO.tree = { H: +H.toFixed(1), verts: NV, crown: crown.length, dMax: +dMax.toFixed(1), cR: +cR.toFixed(1), hit: HIT.toArray().map(x => +x.toFixed(2)), boat: BOAT.toArray().map(x => +x.toFixed(2)) };

  const uCard = { value: new THREE.Vector4(CARD.CX, 1 - CARD.CY, .31, .14) }, uCk = { value: new THREE.Vector4(0, ctx.RW, ctx.RH, 0) };
  // ---- veins: gold sap runs up the spiral of the trunk and along every branch
  const uHit = { value: new THREE.Vector4(HIT.x, HIT.y, HIT.z, dMax) }, uTr = { value: new THREE.Vector4(TREE.x, TREE.z, TV0, TV) };
  const mats = new Set(tp.parts.map(p => p.material));
  for (const m of mats) patch(ctx, m, { uniforms: { fHit: uHit, fTr: uTr, fCard: uCard, fCk: uCk, fGold: { value: lin('#ffc65a') }, fWarm: { value: lin('#fff0d2') } },
    fhead: 'uniform vec4 fHit, fTr, fCard, fCk; uniform vec3 fGold, fWarm;',
    femis: `{ vec3 w = vec3(vMW.x, abs(vMW.y), vMW.z); vec2 rv = w.xz - fTr.xy; float rr = length(rv), an = atan(rv.y, rv.x);
      float d = abs(w.y - fHit.y) + .9 * max(0., rr - 2.5), age = eT - (fTr.z + fTr.w * pow(clamp(d / fHit.w, 0., 1.), .8));
      float lit = smoothstep(0., .06, age), front = exp(-age * age / .0025) + .5 * exp(-max(age, 0.) * 6.) * step(0., age);
      float q = an * 3. / 6.2832 + w.y * .2 + .5 * eVn(vec2(sin(an) * 2.3 + 3., w.y * .33)), line = pow(1. - abs(2. * fract(q) - 1.), 9.);
      float n2 = eVn(vec2(w.x * .9 + w.z * .7, w.y * .8) + 7.), ridge = pow(1. - abs(2. * n2 - 1.), 10.), n3 = eVn(vec2(w.x * 2.3 - w.z * 1.7, w.y * 2.1 + w.z) + 31.), fine = pow(1. - abs(2. * n3 - 1.), 14.);
      float veins = max(line * (1. - smoothstep(3., 7., rr)), max(ridge, .6 * fine)), sap = .8 + .2 * sin(d * 2.2 - eT * 7.), settle = 1. - .6 * smoothstep(.8, 3., age);
      float spark = exp(-dot(w - fHit.xyz, w - fHit.xyz) * mix(5., .5, smoothstep(0., .25, eT - fTr.z))) * smoothstep(-.14, -.06, eT - fTr.z) * exp(-max(eT - fTr.z, 0.) * 2.);
      float fill = smoothstep(.12, .55, age), cd = 1.; if (vMW.y > 0.) { vec2 sc = (gl_FragCoord.xy / fCk.yz - fCard.xy) / fCard.zw; cd = 1. - .82 * fCk.x * (1. - smoothstep(.6, 1.2, length(sc))); }
      totalEmissiveRadiance += (fGold * (front * (.5 + 4. * veins) + lit * veins * 4.5 * sap * settle + spark * 5.) + fWarm * diffuseColor.rgb * fill * (.42 + .2 * settle)) * cd; diffuseColor.rgb *= .35 + .65 * cd; }` });

  // ---- crown: jade leaves (opaque) + gold-white blossom (additive) on the branch points, popped by the vein front
  const pick = () => crown[Math.floor(r() * crown.length)] * 3;
  const NLf = 17000, LA = new Float32Array(NLf * 4), LB = new Float32Array(NLf * 4);
  for (let i = 0; i < NLf; i++) { const j = pick(), x = VX[j] + (r() - .5) * .9, y = VX[j + 1] + (r() - .5) * .9 + .2, z = VX[j + 2] + (r() - .5) * .9;
    LA.set([x, y, z, tF(dOf(x, y, z)) + .03 + .07 * r()], i * 4); LB.set([.45 + .6 * r() * r(), r(), r(), r()], i * 4); }
  const leaves = sprites(ctx, { n: NLf, A: LA, B: LB, additive: false, order: 1, name: 'crownLeaves',
    uniforms: { uCard, uCk, uJ0: { value: lin('#3fae7c') }, uJ1: { value: lin('#a4eec4') }, uJ2: { value: lin('#fff3c8') } }, head: 'uniform vec3 uJ0, uJ1, uJ2; uniform vec4 uCard, uCk;',
    vs: `float ts = uT - aA.w, sd = aB.y, k = q5(0., .2, ts) * (1. + .45 * exp(-max(ts, 0.) * 7.));
      float a1 = sd * 43.98, a2 = aB.w * 81.7; AX = normalize(vec3(cos(a1), .5 * sin(a2), sin(a1))); AY = normalize(cross(AX, vec3(sin(a2), .9, cos(a2))) + AX * .14 * sin(uT * 1.3 + sd * 40.)); ori = 1.;
      S = vec2(aB.x * .5, aB.x) * k; vec3 jade = aB.z > .88 ? uJ2 * 1.25 : mix(uJ0, uJ1, aB.z / .88);
      K = vec4(jade * (.82 + .36 * sin(sd * 90.)) + uJ2 * .6 * exp(-max(ts, 0.) * 3.5), 1.);`,
    fs: `float e = abs(uv.x) / max(.02, 1. - uv.y * uv.y); A = e < 1. ? 1. : 0.; col = vK.rgb * (.7 + .3 * uv.y) * (1. + .3 * exp(-abs(uv.x) * 9.)); ${DIM(.75)}` });
  const NBl = 9000, BA = new Float32Array(NBl * 4), BB = new Float32Array(NBl * 4), o = V3();
  for (let i = 0; i < NBl; i++) { const j = pick(), puff = i > 6500; o.set(VX[j] - CC.x, (VX[j + 1] - CC.y) * 1.3 + 2, VX[j + 2] - CC.z).normalize().multiplyScalar(puff ? 1 + 2.4 * r() : .2 + 1.1 * r());
    const x = VX[j] + o.x + (r() - .5) * .7, y = VX[j + 1] + o.y + (r() - .5) * .7, z = VX[j + 2] + o.z + (r() - .5) * .7;
    BA.set([x, y, z, tF(dOf(VX[j], VX[j + 1], VX[j + 2])) + .1 + .1 * r()], i * 4); BB.set([(puff ? .9 + .9 * r() : .3 + .5 * r()), r(), r(), puff ? .28 : 1], i * 4); }
  const blossom = sprites(ctx, { n: NBl, A: BA, B: BB, order: 4, name: 'crownBlossom',
    uniforms: { uCard, uCk, uG0: { value: lin('#ffd98a') }, uG1: { value: lin('#fff6e4') }, uG2: { value: lin('#ffc4d6') } }, head: 'uniform vec3 uG0, uG1, uG2; uniform vec4 uCard, uCk;',
    vs: `float ts = uT - aA.w, sd = aB.y, k = q5(0., .16, ts), pop = exp(-max(ts, 0.) * 4.5) * step(0., ts), tw = .82 + .18 * sin(uT * (1.7 + 2. * sd) + sd * 50.);
      S = vec2(aB.x * (k + .9 * pop)); C.y += .1 * sin(uT * .7 + sd * 30.) * k; C.x += .08 * sin(uT * .5 + sd * 70.) * k;
      vec3 c = aB.z > .8 ? uG2 : mix(uG0, uG1, aB.z / .8); K = vec4(c * aB.w * (.62 + 1.3 * pop) * tw * k, 1.);`,
    fs: `float d = length(uv); A = .55 * pow(max(0., 1. - d), 2.2) + 1.4 * pow(max(0., 1. - d * 2.2), 2.); ${DIM(.7)}` });
  // soft volumetric glow (replaces the flat halo sphere): gaussian billboards through the crown + one tall flame on the trunk axis
  const GLW = []; for (let i = 0; i < 12; i++) { const a = r() * TAU, rr = Math.sqrt(r()) * cR * .62; GLW.push([CC.x + Math.cos(a) * rr, .52 * H + r() * .42 * H, CC.z + Math.sin(a) * rr, 9 + 7 * r(), .055 + .04 * r(), i % 3 ? 0 : 1]); }
  GLW.push([CC.x, .7 * H, CC.z, 30, .075, 0], [CC.x, .5 * H, CC.z, 34, .06, 2]);
  const GA = new Float32Array(GLW.length * 4), GB = new Float32Array(GLW.length * 4); GLW.forEach((e, i) => { GA.set(e.slice(0, 4), i * 4); GB.set([e[4], r(), e[5], 0], i * 4); });
  const uBl = { value: new THREE.Vector4() };
  const glow = sprites(ctx, { n: GLW.length, A: GA, B: GB, order: 3, name: 'crownGlow',
    uniforms: { uBl, uCard, uCk, uW0: { value: lin('#ffd9a0') }, uW1: { value: lin('#bff5d2') }, uW2: { value: lin('#ffe9c0') } }, head: 'uniform vec4 uBl, uCard, uCk; uniform vec3 uW0, uW1, uW2;',
    vs: `float br = 1. + .06 * sin(uT * 1.1 + aB.y * 30.); S = (aB.z > 1.5 ? vec2(.55, 1.5) : vec2(1.)) * aA.w * 2. * br * (.6 + .4 * uBl.x) * step(.001, uBl.x);
      K = vec4((aB.z > 1.5 ? uW2 : aB.z > .5 ? uW1 : uW0) * aB.x * (uBl.x + .8 * uBl.y), 1.);`,
    fs: `float d2 = dot(uv, uv); A = max(0., exp(-d2 * 3.6) - .0273) * 1.03; ${DIM(.7)}` });

  // ---- the gathering: four ribbons rise in front of the bow, loop over its tip, braid down the limb and settle on the arrow line
  const NG = 4800, QA = new Float32Array(NG * 4), QB = new Float32Array(NG * 4);
  for (let i = 0; i < NG; i++) { const k = i % 4, h = r(); QA.set([r(), r(), tRel - .78 + .56 * h + .03 * (r() - .5), r()], i * 4); QB.set([k, -.1 + .6 * r(), .004 + .0065 * r() * r(), r()], i * 4); }
  const uBow = { value: V3() }, uDir = { value: V3(0, 0, 1) }, uBoat = { value: BOAT.clone() }, uGt = { value: new THREE.Vector4(tRel, .74, 35.5, 0) }, uRC = { value: RIB.map(c => lin(c)) }, uWG = { value: lin('#fff1c8') };
  const gather = sprites(ctx, { n: NG, A: QA, B: QB, order: 5, name: 'gather', uniforms: { uBow, uDir, uBoat, uGt, uRC, uWG }, head: `uniform vec3 uBow, uDir, uBoat, uRC[4], uWG; uniform vec4 uGt; ${CR}`,
    vs: `float x = uT - aA.z, sd = aA.w, rb = aB.x, side = rb < 1.5 ? -1. : 1., odd = mod(rb, 2.);
      vec3 up = vec3(0., 1., 0.), fw = normalize(vec3(uDir.x, 0., uDir.z)), rt = vec3(fw.z, 0., -fw.x);
      vec3 G = uBow, T2 = G + up * (uGt.y + .16) + fw * .07, R0 = G + fw * (.2 + .05 * odd) - up * .3 + rt * side * .08;
      vec3 M = vec3(uBoat.x, .75, uBoat.z) + rt * side * (1.05 + .25 * odd) - fw * .7, S0 = M - fw * (8. + 5. * aA.x) + rt * side * (1.5 + 3. * odd + aA.y); S0.y = .3;
      vec3 pos; if (x < -1.65) pos = cr(S0, S0, M, R0, clamp((x + 2.25) / .6, 0., 1.)); else if (x < -1.3) pos = cr(S0, M, R0, T2, (x + 1.65) / .35);
      else if (x < -.6) pos = cr(M, R0, T2, G, (x + 1.3) / .7); else pos = cr(R0, T2, G, G, clamp((x + .6) / .6, 0., 1.));
      float th = rb * 1.5708 + x * 9. + sd * .9, vert = smoothstep(-1.55, -1.25, x), rad = mix(.28, .055, smoothstep(-1.9, -1.2, x)) * (1. - smoothstep(-.14, 0., x)) + .01 * sd;
      pos += rad * (rt * cos(th) + mix(up, fw, vert) * sin(th));
      float set = q5(0., .25, x); pos += uDir * aB.y * set;
      C = pos; float vis = q5(-2.25, -2.05, x) * step(uGt.z, uT) * step(uT, uGt.x + .02), tw = .7 + .3 * sin(uT * 23. * (.5 + sd) + sd * 60.);
      S = vec2(aB.z * 2. * vis * (1. - .35 * set)); K = vec4(mix(mix(uRC[int(rb)], uWG, .18) * 2.3, uWG * 1.6, smoothstep(-.5, .2, x)) * tw * (1. - .8 * set), 1.); Z = .02;`,   // P1: settled motes dim + shrink (no flat white bar in the 85 mm close-up)
    fs: `float d = length(uv); A = pow(max(0., 1. - d), 2.4) + pow(max(0., 1. - d * 3.), 2.);` });

  // ---- the arrow (core + head flare + glow), release flash, impact point
  const uAP = { value: V3() }, uAD = { value: V3(0, 0, 1) }, uAK = { value: new THREE.Vector4() }, uAL = { value: new THREE.Vector4() }, uFl = { value: new THREE.Vector4() }, uA0 = { value: V3() }, uA1 = { value: HIT.clone() };
  const AB = new Float32Array(5 * 4); for (let i = 0; i < 5; i++) AB[i * 4] = i;
  const arrow = sprites(ctx, { n: 5, A: new Float32Array(20), B: AB, order: 6, name: 'arrow', uniforms: { uAP, uAD, uAK, uAL, uFl, uA0, uA1, uWG, uGd: { value: lin('#ffd27a') } }, head: 'uniform vec3 uAP, uAD, uA0, uA1, uWG, uGd; uniform vec4 uAK, uAL, uFl;',
    vs: `vec3 vd = normalize(cameraPosition - uAP); AX = normalize(uAD); AY = normalize(cross(AX, vd)); P.x = aB.x;
      if (aB.x < .5) { ori = 1.; C = uAP - AX * uAL.x * .5; S = vec2(uAL.x * 1.08, uAL.y) * step(.001, uAK.x); K = vec4(uWG * uAK.x, 1.); }
      else if (aB.x < 1.5) { C = uAP; S = vec2(uAL.z) * step(.001, uAK.y); K = vec4(uWG * uAK.y, 1.); Z = .03; }
      else if (aB.x < 2.5) { C = uAP - AX * uAL.x * .4; S = vec2(uAL.w) * step(.001, uAK.z); K = vec4(uGd * uAK.z, 1.); }
      else if (aB.x < 3.5) { C = uA0; S = vec2(uFl.y) * step(.001, uFl.x); K = vec4(uWG * uFl.x, 1.); Z = .3; }
      else { C = uA1; S = vec2(uFl.w) * step(.001, uFl.z); K = vec4(uWG * uFl.z, 1.); Z = .25; }`,
    fs: `float d = length(uv); if (vP.x < .5) { float e = uv.y * uv.y; A = (exp(-e * 14.) * .3 + exp(-e * 160.)) * (1. - smoothstep(.55, 1., uv.x)) * smoothstep(-1., .1, uv.x); }   // P1: tapered tip, no flat end
      else if (vP.x > 2.5 && vP.x < 3.5) A = exp(-d * d * 4.) * (1. - smoothstep(.5, 1., d)) + .8 * exp(-d * d * 30.);                                        // P1: round soft release flash (no horizontal streak)
      else if (vP.x < 1.5 || vP.x > 3.5) A = pow(max(0., 1. - d), 3.) + 2. * pow(max(0., 1. - d * 4.), 2.) + .5 * exp(-abs(uv.y) * 46.) * pow(max(0., 1. - abs(uv.x)), 2.) + .3 * exp(-abs(uv.x) * 46.) * pow(max(0., 1. - abs(uv.y)), 2.);
      else A = max(0., exp(-d * d * 3.6) - .0273);` });

  // ---- flight trail (four braided ribbons shed by the arrow) + the line of light on the water under it
  const NT = 2600, TA = new Float32Array(NT * 4); for (let i = 0; i < NT; i++) TA.set([r(), i % 4, r(), .05 + .09 * r() * r()], i * 4);
  const uArc = { value: new THREE.Vector4(2.2, tRel, tHit - tRel, 1.1) };
  const ARC = `uniform vec3 uA0, uA1, uRC[4], uWG; uniform vec4 uArc; vec3 arcP(float u){ vec3 p = mix(uA0, uA1, u); p.y += uArc.x * 4. * u * (1. - u); return p; }`;
  const trail = sprites(ctx, { n: NT, A: TA, order: 5, name: 'arrowTrail', uniforms: { uA0, uA1, uArc, uRC, uWG }, head: ARC,
    vs: `float u = aA.x, sd = aA.z, age = uT - (uArc.y + uArc.z * pow(u, 1. / uArc.w)); vec3 fw = normalize(uA1 - uA0), rt = normalize(cross(fw, vec3(0., 1., 0.))), upv = cross(rt, fw);
      float th = aA.y * 1.5708 + u * 46. + sd * .7, rad = .05 + (.2 + .55 * sd) * max(age, 0.); C = arcP(u) + (rt * cos(th) + upv * sin(th)) * rad; C.y = max(.04, C.y - .22 * age * age);
      float f = exp(-max(age, 0.) * (1.3 + 1.6 * sd)); S = vec2(age < 0. ? 0. : aA.w * (.7 + 1.1 * f)); K = vec4(mix(uRC[int(aA.y)] * 2.4, uWG * 5., f * f * f) * f * (.7 + .3 * sin(uT * 19. + sd * 50.)), 1.);`,
    fs: `float d = length(uv); A = pow(max(0., 1. - d), 2.4) + pow(max(0., 1. - d * 3.), 2.);` });
  const NW = 56, WA = new Float32Array(NW * 4); for (let i = 0; i < NW; i++) WA.set([(i + .5) / NW, r(), 0, 0], i * 4);
  const uIsl = { value: new THREE.Vector4(TREE.x, TREE.z, 14.5, 0) };
  const wline = sprites(ctx, { n: NW, A: WA, order: 2, mirror: 0, name: 'arrowWater', uniforms: { uA0, uA1, uArc, uRC, uWG, uIsl }, head: ARC + ' uniform vec4 uIsl;',
    vs: `float u = aA.x, age = uT - (uArc.y + uArc.z * pow(u, 1. / uArc.w)); vec3 p = mix(uA0, uA1, u), fw = normalize(vec3(uA1.x - uA0.x, 0., uA1.z - uA0.z)); float L = length(uA1.xz - uA0.xz);
      C = vec3(p.x, .012, p.z); ori = 1.; AX = fw; AY = vec3(fw.z, 0., -fw.x); float f = exp(-max(age, 0.) * 2.4), on = step(0., age) * step(uIsl.z, length(p.xz - uIsl.xy));
      S = vec2(L / ${NW}. * 3.4, .5 + 1.6 * (1. - f)) * on; K = vec4(mix(uRC[0], uWG, .4) * (.12 + 1.1 * f * f) * f * (.6 + .8 * aA.y), 1.);`,
    fs: `A = exp(-uv.y * uv.y * 5.) * exp(-uv.x * uv.x * 2.6) * (.55 + .45 * sin(vW.x * 9. + vW.z * 13. + uT * 5.)) * (uUWk.w > .5 ? 0. : 1.);` });

  // ---- the ring on the lake + lotus lanterns that surface lit where it passes
  const D0 = Math.hypot(BOAT.x - TREE.x, BOAT.z - TREE.z), R0 = 13, tR0 = tB + .8, tR1 = tB + 1.6, vR = (D0 - R0) / (tR1 - tR0), RMAX = 190;
  const tRing = (x, z) => tR0 + (Math.hypot(x - TREE.x, z - TREE.z) - R0) / vR;
  const uRg = { value: new THREE.Vector4(0, 1.2, RMAX, 0) };
  const ring = sprites(ctx, { n: 1, A: new Float32Array([TREE.x, .014, TREE.z, 0]), order: 2, mirror: 0, name: 'lakeRing', uniforms: { uRg, uRc0: { value: lin('#ffe6a6') }, uRc1: { value: lin('#fff6e0') } }, head: 'uniform vec4 uRg; uniform vec3 uRc0, uRc1;',
    vs: `ori = 1.; AX = vec3(1., 0., 0.); AY = vec3(0., 0., 1.); S = vec2(2. * uRg.z) * step(.001, uRg.w); K = vec4(uRg.w); P = uRg;`,
    fs: `float rr = length(uv) * vP.z, e = rr - vP.x, w = vP.y * (1. + rr * .012); float edge = exp(-e * e / (w * w)), tail = step(e, 0.) * exp(e / (9. + rr * .1)) * .22, fine = exp(-e * e / (.05 * w * w));
      col = mix(uRc0, uRc1, fine) * (1.1 * edge + 2.6 * fine + tail) * vK.w; A = step(${R0.toFixed(1)}, rr) * (uUWk.w > .5 ? 0. : 1.);` });
  const NLo = 190, LO = []; let guard = 0;
  while (LO.length < NLo && guard++ < 20000) { const a = r() * TAU, rr = 17 + 110 * Math.pow(r(), 1.5), x = TREE.x + Math.cos(a) * rr, z = TREE.z + Math.sin(a) * rr, pc = ctx.look.pathCoords('finale', x, z);
    if (Math.abs(pc.lat) < 4.2 && z < TREE.z - 12) continue; if (Math.hypot(x - BOAT.x, z - BOAT.z) < 6 || Math.hypot(x - BOAT.x + 4.7, z - BOAT.z + 8.4) < 12) continue; if (LO.some(q => Math.hypot(q[0] - x, q[1] - z) < 3.2)) continue; LO.push([x, z, tRing(x, z) - .02, r()]); }
  const PA = new Float32Array(LO.length * 12), PB = new Float32Array(LO.length * 12); LO.forEach((L, i) => { for (let k = 0; k < 3; k++) { PA.set([L[0], L[2], L[1], L[3]], (i * 3 + k) * 4); PB.set([k, .8 + .5 * hsh(i, 3), 0, 0], (i * 3 + k) * 4); } });
  const lotus = sprites(ctx, { n: LO.length * 3, A: PA, B: PB, order: 3, name: 'lakeLotus', uniforms: { uLc: { value: lin('#ffc66e') } }, head: 'uniform vec3 uLc;',
    vs: `float ts = uT - aA.y, sd = aA.w, k = q5(0., .3, ts), pulse = step(0., ts) * exp(-max(ts, 0.) * 2.4), fl = 1. + .05 * sin(uT * 9. + sd * 40.), bob = .02 * sin(uT * 1.1 + sd * 50.); P.x = aB.x;
      if (aB.x < .5) { C = vec3(aA.x, mix(-.3, .2, k) + bob, aA.z); S = vec2(.2, .3) * aB.y * k; K = vec4(uLc * 5. * fl, 1.); }
      else if (aB.x < 1.5) { C = vec3(aA.x, mix(-.3, .22, k) + bob, aA.z); S = vec2((.9 + 1.6 * pulse) * aB.y) * k; K = vec4(uLc * (.55 + 1.5 * pulse) * fl, 1.); Z = .2; }
      else { C = vec3(aA.x, .013, aA.z); ori = 1.; AX = vec3(1., 0., 0.); AY = vec3(0., 0., 1.); S = vec2(3.4 + 2.4 * pulse) * k; K = vec4(uLc * (.3 + .7 * pulse), 1.); }`,
    fs: `float d = length(uv); A = vP.x < .5 ? smoothstep(1., .5, d) : vP.x < 1.5 ? pow(max(0., 1. - d), 2.6) : pow(max(0., 1. - d), 2.) * (uUWk.w > .5 ? 0. : 1.);` });
  const DA = new Float32Array(LO.length * 4); LO.forEach((L, i) => DA.set([L[0], L[2], L[1], L[3]], i * 4));
  const pads = sprites(ctx, { n: LO.length, A: DA, additive: false, order: 1, mirror: 0, name: 'lakePads', uniforms: { uPc: { value: lin('#3f6650') }, uLc: { value: lin('#ffc66e') } }, head: 'uniform vec3 uPc, uLc;',
    vs: `float k = q5(0., .3, uT - aA.y); C = vec3(aA.x, mix(-.3, .02, k), aA.z); ori = 1.; R = aA.w * 6.28; AX = vec3(1., 0., 0.); AY = vec3(0., 0., 1.); S = vec2(.95) * k;`,
    fs: `float d = length(uv), an = atan(uv.y, uv.x); A = (d < 1. && !(abs(an) < .16 && d > .25)) ? 1. : 0.; col = uPc * (.28 + .3 * d) + uLc * 1.2 * exp(-d * d * 6.); if (uUWk.w > .5) A = 0.;` });
  const roadT = road.items.map(L => tRing(L.pos.x, L.pos.z));

  // ---- the sky fills: light-seeds leave the crown in a rising column and fan out; soft discs, 3 sizes, mostly gold
  const NS = 7600, SA = new Float32Array(NS * 4), SB = new Float32Array(NS * 4), camB = V3(BOAT.x, 0, BOAT.z - 8), cam17 = V3(TREE.x - 8, 0, TREE.z - 58); let ns = 0; guard = 0;
  while (ns < NS && guard++ < 100000) { const a = r() * TAU, el = Math.asin(-.32 + 1.32 * r()), rho = 5 + 150 * Math.pow(r(), 1.7), x = CC.x + Math.cos(a) * Math.cos(el) * rho * 1.25, z = CC.z + Math.sin(a) * Math.cos(el) * rho, y = CC.y + Math.sin(el) * rho * .8;
    if (y < 1.2 || y > 95) continue; const nb = Math.min(Math.hypot(x - camB.x, z - camB.z), Math.hypot(x - cam17.x, z - cam17.z)), nboat = Math.hypot(x - BOAT.x, z - BOAT.z);
    if (nb < 7 && y < 9) continue; const h = r(), sz = (nboat < 14 || h < .62) ? .1 + .08 * r() : h < .92 ? .22 + .12 * r() : .42 + .22 * r(), cz = r(), ci = cz < .88 ? 0 : cz < .92 ? 1 : cz < .96 ? 2 : 3;
    SA.set([x, y, z, tB + 1.1 + .25 * Math.min(rho, 60) / 60 + 3.6 * Math.pow(r(), 2.4)], ns * 4); SB.set([sz, r(), ci, .5 * H + r() * .35 * H], ns * 4); ns++; }
  const seeds = sprites(ctx, { n: ns, A: SA, B: SB, order: 4, name: 'skySeeds', uniforms: { uCard, uCk, uTre: { value: CC.clone() }, uSC: { value: ['#ffd98a', '#7df0e0', '#b0a0ff', '#ff7a88'].map(c => lin(c)) } }, head: 'uniform vec4 uCard, uCk; uniform vec3 uTre, uSC[4];',
    vs: `float tau = uT - aA.w, sd = aB.y, e = 1. - exp(-2.3 * max(tau, 0.)), eh = pow(e, 2.3); vec3 src = vec3(uTre.x + (sd - .5) * 7., aB.w, uTre.z + (fract(sd * 7.31) - .5) * 7.);
      C.xz = mix(src.xz, aA.xz, eh); C.y = mix(src.y, aA.y, eh) + 20. * (e - eh) + .3 * max(tau - 1., 0.); C.x += .5 * sin(uT * .45 + sd * 40.) * e; C.z += .5 * cos(uT * .38 + sd * 23.) * e;
      float tw = .78 + .22 * sin(uT * (1.4 + 2.2 * sd) + sd * 60.); S = vec2(tau < 0. ? 0. : 2. * aB.x * (.45 + .55 * e)); K = vec4(uSC[int(aB.z)] * (aB.z > .5 ? 1.15 : 1.) * tw * (.9 + 2.6 * exp(-max(tau, 0.) * 1.8)), 1.); P.x = aB.x;`,
    fs: `float d = length(uv); A = .32 * smoothstep(1., .5, d) + 1.1 * pow(max(0., 1. - d), 3.);
      ${DIM(.5)}` });

  // ---- petals: three ash-white ones drift in the quiet, then the first petals rain from the crown
  const NP = 520, EA = new Float32Array(NP * 4), EB = new Float32Array(NP * 4);
  for (let i = 0; i < NP; i++) { if (i < 3) { EA.set([BOAT.x + [-3.5, 2.5, 5][i], [1.3, 2.1, .9][i], BOAT.z + [9, 15, 24][i], -1], i * 4); EB.set([.07, r(), r(), 0], i * 4); continue; }
    const j = pick(), toB = r() < .3; EA.set([VX[j] + (r() - .5) * 3 + (toB ? (BOAT.x - VX[j]) * r() * .8 : 0), VX[j + 1] + r() * 2, VX[j + 2] + (toB ? (BOAT.z - VX[j + 2]) * r() * .85 : 0), tB + 1.4 + 4.2 * Math.pow(r(), 1.3) - (toB ? 1.5 : 0)], i * 4); EB.set([.1 + .1 * r(), r(), r(), 1], i * 4); }
  const petals = sprites(ctx, { n: NP, A: EA, B: EB, additive: false, order: 1, name: 'petals', uniforms: { uP0: { value: lin('#f4f1ea') }, uP1: { value: lin('#ffd9e4') }, uP2: { value: lin('#fff0c8') }, uBl }, head: 'uniform vec3 uP0, uP1, uP2; uniform vec4 uBl;',
    vs: `float sd = aB.y, a1 = sd * 43. + uT * (.8 + sd), a2 = aB.z * 70. + uT * 1.3; ori = 1.; AX = normalize(vec3(cos(a1), .6 * sin(a2), sin(a1))); AY = normalize(cross(AX, vec3(sin(a2), .7, cos(a2))));
      if (aB.w < .5) { C = vec3(aA.x + .35 * uT * .25 + .3 * sin(uT * .5 + sd * 9.), aA.y + .25 * sin(uT * .4 + sd * 20.), aA.z + .2 * sin(uT * .33 + sd * 5.)); S = vec2(aB.x, aB.x * .7); K = vec4(mix(uP0 * .8, uP2 * 1.2, uBl.x), 1.); }
      else { float tau = uT - aA.w, v = 1.1 + .8 * sd; C = vec3(aA.x + .9 * sin(tau * .7 + sd * 30.) + .25 * tau, aA.y - v * tau, aA.z + .7 * cos(tau * .6 + aB.z * 30.));
        S = vec2(aB.x, aB.x * .72) * q5(0., .3, tau) * step(.05, C.y); K = vec4((aB.z > .5 ? uP1 : uP2) * (1.1 + .5 * sin(a2 * 2.)), 1.); }`,
    fs: `float d = length(uv * vec2(1., 1.15) + vec2(0., .1 * uv.x * uv.x)); A = d < 1. ? 1. : 0.; col = vK.rgb * (.85 + .15 * uv.y);` });

  // ---- her light flips cold -> warm when the ring reaches the boat
  const warm = new THREE.PointLight('#ffcf8a', 0, 26, 1.6); warm.position.copy(BOAT).add(V3(0, 3.4, 4.5)); warm.name = 'ringWarm';
  g.add(leaves, blossom, glow, gather, arrow, trail, wline, ring, pads, lotus, seeds, petals, warm);
  const card = CARD.build(ctx, g);
  F = { TL, tRel, tHit, tB, TREE, HIT, BOAT, bowAt, uBow, uDir, uGt, uAP, uAD, uAK, uAL, uFl, uA0, uArc, uRg, uBl, uCk, tR0, tR1, vR, R0, D0, road, roadT, warm, card, seeds, lotus, pads, ring, leaves, blossom, glow, gather, trail, wline, petals, arrow };
  INFO.ring = { D0: +D0.toFixed(1), vR: +vR.toFixed(1), lotus: LO.length, seeds: ns };
  window.FINALE = INFO;
  return F;
}

// before road.update: road lanterns ahead of the boat light when the ring passes
export function pre(ctx, t) { if (!F) return; const g = F.road.glow; for (let i = 0; i < g.length; i++) g[i] = sst(F.roadT[i] - .02, F.roadT[i] + .12, t) * (1 + .5 * Math.exp(-Math.max(0, t - F.roadT[i]) * 2.2)); }

const _m = new THREE.Matrix4(), _h = new THREE.Vector3(), _d = new THREE.Vector3();
export function update(ctx, t) {
  if (!F) return; KT.value = t; const { TL, tRel, tHit, tB } = F;
  // bow anchor + arrow line
  const BA = F.bowAt(t), B0 = F.bowAt(tRel), A0 = B0.pos.clone().addScaledVector(B0.dir, .5);
  F.uBow.value.copy(BA.pos); F.uDir.value.copy(BA.dir); F.uA0.value.copy(A0);
  const AK = F.uAK.value, AL = F.uAL.value, FL = F.uFl.value; AK.set(0, 0, 0, 0); FL.set(0, 0, 0, 0);
  if (t >= 35.5 && t < tRel) { const k = s5(tRel - .85, tRel - .2, t), br = 1 + .08 * Math.sin(t * 31);       // the arrow grows on the bow as the ribbons settle
    F.uAP.value.copy(BA.pos).addScaledVector(BA.dir, .5); F.uAD.value.copy(BA.dir); AK.set(1.1 * k * br, 2.0 * k * br, .3 * k, 0); AL.set(.6 * (.3 + .7 * k), .009, .12 + .07 * k, .45); }
  else if (t >= tRel && t < tHit) { const x = (t - tRel) / (tHit - tRel), u = Math.pow(x, F.uArc.value.w), u2 = Math.min(1, u + .004);
    const arc = (u, o) => o.copy(A0).lerp(F.HIT, u).setY(A0.y + (F.HIT.y - A0.y) * u + F.uArc.value.x * 4 * u * (1 - u));
    arc(u, _h); arc(u2, _d).sub(_h).normalize(); F.uAP.value.copy(_h); F.uAD.value.copy(_d); AK.set(16, 10, .22, 0); AL.set(Math.min(3.2, .25 + 40 * (t - tRel)), .12, .85, 2.2); }   // P1: the tail grows with the flight (no bar behind the bow at release)
  { const e = (t - tRel - .012) / .03; FL.x = 1.4 * Math.exp(-e * e); FL.y = 2.4 + 1.4 * clamp((t - tRel + .05) / .12); if (FL.x < .01) FL.x = 0; }      // 4-frame flash covers the release
  if (t >= tHit - .004) { const a = t - tHit, hold = a < tB - tHit ? 1 : Math.exp(-(t - tB) * 3.2); FL.z = (a < tB - tHit ? 7 : 7 + 14 * Math.exp(-(t - tB) * 9)) * hold; FL.w = a < tB - tHit ? .32 : .32 + 3.6 * sst(0, .5, t - tB); if (FL.z < .01) FL.z = 0; }
  // crown: steady glow + burst pulse (peak at bloom + .6)
  const st = s5(tB + .22, tB + .75, t), pk = Math.exp(-Math.pow((t - tB - .6) / .2, 2)); F.uBl.value.set(st * (1 - .25 * s5(tB + 1.2, tB + 3.5, t)), pk * st, 0, 0);
  // ring
  const Rr = F.R0 + F.vR * (t - F.tR0), on = t > F.tR0 - .05 && Rr < 185; F.uRg.value.set(Rr, 1.1, 190, on ? sst(F.tR0 - .05, F.tR0 + .1, t) * (1 - sst(60, 180, Rr)) * 1.6 : 0);
  // road lanterns ahead of the boat stay under water until the ring surfaces them
  const road = F.road, s = ctx.now.s, body = road.group.children[0];
  for (let i = 0; i < road.items.length; i++) { if (road.items[i].s - .4 < s) continue; const dy = -.75 * (1 - s5(F.roadT[i] - .04, F.roadT[i] + .3, t)); if (dy > -1e-4) continue;
    for (const im of [...body.children, road.bulbs]) { im.getMatrixAt(i, _m); _m.elements[13] += dy; im.setMatrixAt(i, _m); im.instanceMatrix.needsUpdate = true; } }
  // warm wash when the ring reaches her
  const a = t - F.tR1; F.warm.intensity = a < -.12 ? 0 : sst(-.12, .1, a) * (55 + 150 * Math.exp(-Math.max(0, a) * 2.4));
  // end card (seeds dim 50% inside its scrim)
  F.uCk.value.x = s5(TL.endCard[0] - .15, TL.endCard[0] + .45, t); F.uCk.value.y = ctx.RW; F.uCk.value.z = ctx.RH;   /* GAME: live render size */ CARD.update(ctx, t);
  const v = (o, on) => { o.visible = on; };
  v(F.gather, t > 35.5 && t < tRel + .05); v(F.arrow, t > 35.5 && t < tB + 2); v(F.trail, t > tRel && t < tHit + 3.5); v(F.wline, t > tRel && t < tHit + 4); v(F.ring, on);
  v(F.leaves, t > tB); v(F.blossom, t > tB); v(F.glow, t > tB + .2); v(F.seeds, t > tB + .9); v(F.lotus, t > F.tR0 - .1); v(F.pads, t > F.tR0 - .1);
}
