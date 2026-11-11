// Heroine + leaf boat + bow lantern + bow (stage D1). Everything is a pure function of t.
// makeBoat(ctx) -> { object, deck, gltf, lantern: { light, bulb, worldPos(out) }, setTime(t) }
//   leaf_boat.glb (Tripo) 4.2 m, long axis turned to +z (bow), sunk SINK m. deck = Group on the deck board, slightly aft of centre (z = DECK_Z).
//   Hull reveal (TL.boatReveal): leaves lock on keel -> stem -> hook (object-space dissolve with a gold glint edge; D2's whirl feeds it).
//   Bow lantern hangs from the ring under the crozier hook on a 3-link chain, sways +-4 deg (closed form). Panes glow amber (emissive mask
//   from the base colour: cream panes glow, gold filigree does not). PointLight #FFB45E range 6 m. bulb = rest position of the flame (boat space).
// makeHero(ctx) -> { object, glb, clips, headLocal, setTime(t) }  heroine.glb, 1.72 m, Tripo preset clips ONLY (shots.json hero[]), no bone code.
//   hero[] entry: { t, clip, fade = .6, from = 0, rate = 1, once = false, pp: [a, b] (ping-pong inside [a, b]) }. Entry i fades in over
//   [t, t + fade] and holds until the next entry fades in. Clip time = from + (t - t_i) * rate (wrapped / clamped / ping-ponged).
//   visible from TL.heroIn (shot 1 shows the empty hull being built).
// Bow: branch_bow.glb on her back, pinned to the Spine2 bone (diagonal, top at her left shoulder, string toward her). Finale (TL.bowLift):
//   it lifts off by itself inside a spiral of leaves, arcs over her left shoulder and hovers upright 0.5 m ahead at chest height, turning to
//   face the tree; TL.bowSink: sinks and fades into motes. ctx.bowAnchor(t) -> { pos, dir } world grip centre + direction to the tree.
import * as THREE from 'three';
import { loadGLTF, TABLE } from './assets.js';
import { sst, mod, s5, clamp, mulberry, TAU, col, hsh, bump } from './util.js';
import * as FIN from './worlds/finale.js';

export const HERO_H = 1.72;
const SINK = .2, DECK_Z = -.35, BOAT_L = 4.2, CHAIN = .07;
const LANTERN_H = .35;

// own onBeforeCompile must keep look.js's air (fog/mist/scatter uniforms)
const withAir = (ctx, sh) => { if (ctx.look && ctx.look.air) ctx.look.air(sh); };

export async function makeBoat(ctx) {
  const object = new THREE.Group(); object.name = 'boat';
  const TL = ctx.TL, rev = TL.boatReveal || [0, .01];
  const gltf = await loadGLTF('leaf_boat');
  const uRev = { value: 1 }, uGlint = { value: col('#ffd890').multiplyScalar(6) };
  let deckY = .18, hang = new THREE.Vector3(0, 1.42, 1.92);
  if (gltf) {
    const s = gltf.scene; const b0 = new THREE.Box3().setFromObject(s), d0 = b0.getSize(new THREE.Vector3()), k = BOAT_L / d0.x;
    // raw file: long axis x (hook at +x), y up from 0. Object-space reveal parameter: keel first (low y), then towards the hook.
    const X0 = b0.min.x, XL = d0.x, Y0 = b0.min.y, YH = d0.y;
    s.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; const m = o.material;
      m.onBeforeCompile = (sh) => { withAir(ctx, sh); sh.uniforms.uRev = uRev; sh.uniforms.uGlint = uGlint;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vObj; uniform float uRev; uniform vec3 uGlint;
          float hRev(vec3 c){ return fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          float revP(){ float a = (vObj.y - ${Y0.toFixed(5)}) / ${YH.toFixed(5)}, b = (vObj.x - ${X0.toFixed(5)}) / ${XL.toFixed(5)};
            return .42 * a + .58 * b * b + .14 * hRev(floor(vObj * 46.)); }`)
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat rP = revP(), rE = uRev * 1.16 - rP; if (rE < 0.) discard;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlint * exp(-rE * 55.) * step(uRev, .999);'); };
      m.customProgramCacheKey = () => 'leafboat-rev'; });
    s.scale.setScalar(k); s.rotation.y = -Math.PI / 2; s.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(s); s.position.set(-(b.min.x + b.max.x) / 2, -b.min.y - SINK, -(b.min.z + b.max.z) / 2);
    const hull = new THREE.Group(); hull.add(s); object.add(hull); object.updateMatrixWorld(true);
    // deck height under her feet (first hit straight down) and the ring's lowest point (hang point), measured on the mesh
    const rc = new THREE.Raycaster(); rc.set(new THREE.Vector3(0, 3, DECK_Z), new THREE.Vector3(0, -1, 0)); const hit = rc.intersectObject(hull, true); if (hit.length) deckY = hit[0].point.y;
    let low = null; const v = new THREE.Vector3();
    s.traverse(o => { if (!o.isMesh) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.z > 1.78 && v.y > 1.0 && v.y < 1.75 && (!low || v.y < low.y)) low = v.clone(); } });
    if (low) hang.copy(low).setX(0);
  } else {   // fallback: plain hull
    const wood = new THREE.MeshStandardMaterial({ color: '#d8cbb0', roughness: .7 });
    const hullM = new THREE.Mesh(new THREE.CapsuleGeometry(.5, 3.1, 6, 16).rotateX(Math.PI / 2).scale(1.2, .5, 1), wood); hullM.position.y = .05; object.add(hullM);
  }
  const deck = new THREE.Group(); deck.position.set(0, deckY, DECK_Z); object.add(deck);

  // ---- bow lantern on a short chain
  const pivot = new THREE.Group(); pivot.position.copy(hang); object.add(pivot);
  const gold = new THREE.MeshStandardMaterial({ color: '#c9a14a', metalness: 1, roughness: .32 });
  const linkG = new THREE.TorusGeometry(.011, .0032, 6, 14);
  for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(linkG, gold); l.position.y = -.012 - i * .02; l.rotation.y = i % 2 ? Math.PI / 2 : 0; pivot.add(l); }
  const lanG = await loadGLTF('bow_lantern');
  const uGlow = { value: new THREE.Color(0, 0, 0) };
  let flameY = -CHAIN - .19;
  if (lanG) { const L = lanG.scene.clone(true); const b0 = new THREE.Box3().setFromObject(L), d0 = b0.getSize(new THREE.Vector3()), k = LANTERN_H / d0.y; L.scale.setScalar(k); L.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(L); L.position.set(-(b.min.x + b.max.x) / 2, -CHAIN - b.max.y, -(b.min.z + b.max.z) / 2); pivot.add(L);
    flameY = -CHAIN - LANTERN_H * .54;
    L.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; const m = o.material = o.material.clone();
      m.onBeforeCompile = (sh) => { withAir(ctx, sh); sh.uniforms.uGlow = uGlow;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uGlow;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            { vec3 sc = pow(max(diffuseColor.rgb, 0.), vec3(.4545)); float mx = max(sc.r, max(sc.g, sc.b)), mn = min(sc.r, min(sc.g, sc.b)), sat = (mx - mn) / max(mx, 1e-3);
              float pane = smoothstep(.56, .38, sat) * smoothstep(.35, .6, mx); totalEmissiveRadiance += uGlow * pane * (.35 + .65 * sc); }`); };
      m.customProgramCacheKey = () => 'bowlantern-glow'; }); }
  else { const bud = new THREE.Mesh(new THREE.SphereGeometry(.08, 20, 14).scale(1, 1.4, 1), new THREE.MeshStandardMaterial({ color: '#e8c890', emissive: '#ffb45e', emissiveIntensity: 0 })); bud.position.y = flameY; pivot.add(bud); }
  const seedMat = new THREE.MeshBasicMaterial({ color: '#000000' });
  const seed = new THREE.Mesh(new THREE.SphereGeometry(.018, 14, 10), seedMat); seed.position.y = flameY; pivot.add(seed);
  const light = new THREE.PointLight('#ffb45e', 0, 6, 2); light.position.y = flameY; pivot.add(light);
  const bulb = new THREE.Object3D(); bulb.position.copy(hang).add(new THREE.Vector3(0, flameY, 0)); object.add(bulb);   // rest position (anchors)
  const amber = col('#ffb45e'), core = col('#fff1c8');
  return { object, deck, gltf: !!gltf, deckY, hang, lantern: { light, bulb, pivot, worldPos: (out = new THREE.Vector3()) => bulb.getWorldPosition(out) },
    setTime(t) {
      const on = s5(TL.lanternOn[0], TL.lanternOn[1], t), flick = 1 + .04 * Math.sin(t * 13.1) + .03 * Math.sin(t * 7.3 + 1);
      uGlow.value.copy(amber).multiplyScalar(on * flick * 1.6); seedMat.color.copy(core).multiplyScalar(.1 + 14 * on * flick);
      light.intensity = 7 * on * flick;
      const D = Math.PI / 180;   // sway +-4 deg, two incommensurate sines per axis
      pivot.rotation.set(4 * D * (.7 * Math.sin(t * 1.17 + .4) + .3 * Math.sin(t * 2.31 + 1.9)), 0, 4 * D * (.65 * Math.sin(t * .93 + 2.2) + .35 * Math.sin(t * 1.87)));
      uRev.value = rev[1] > rev[0] ? clamp((t - rev[0]) / (rev[1] - rev[0])) : 1; object.visible = uRev.value > 1e-3;
      // the lantern + chain grow from the ring only once the reveal has reached the hook (was floating alone before the hull)
      const g = clamp((uRev.value - .9) / .1), gs = g <= 0 ? 0 : 1 + 2.2 * Math.pow(g - 1, 3) + 1.2 * Math.pow(g - 1, 2);
      pivot.visible = g > 0; pivot.scale.setScalar(Math.max(gs, 1e-4)); } };
}

// ---------------------------------------------------------------------------------------------- heroine
function leafGeo() { const s = new THREE.Shape(); s.moveTo(0, -.045); s.quadraticCurveTo(.03, -.01, 0, .05); s.quadraticCurveTo(-.03, -.01, 0, -.045); const g = new THREE.ShapeGeometry(s, 4); g.rotateX(-Math.PI / 2); return g; }
function blobTex() { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(.45, 'rgba(0,0,0,0.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); }

export async function makeHero(ctx) {
  const object = new THREE.Group(); object.name = 'hero';
  const TL = ctx.TL, heroIn = TL.heroIn ?? 0;
  const gltf = await loadGLTF('heroine');
  // soft contact shadow on the deck
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(.62, .46).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: .8, fog: false }));
  blob.position.set(0, .006, .02); blob.renderOrder = 1; object.add(blob);
  if (!gltf) {   // stand-in: capsule + nose
    const m = new THREE.MeshStandardMaterial({ color: '#d9dcc4', roughness: .55 });
    const cap = new THREE.Mesh(new THREE.CapsuleGeometry(.2, HERO_H - .4, 6, 16), m); cap.position.y = HERO_H / 2; object.add(cap);
    ctx.bowAnchor = () => ({ pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1) });
    return { object, glb: false, clips: [], headLocal: new THREE.Vector3(0, HERO_H - .15, 0), setTime(t) { object.visible = t >= heroIn; } };
  }
  const root = gltf.scene; root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root), d = b.getSize(new THREE.Vector3()); root.scale.multiplyScalar(HERO_H / d.y);
  root.updateMatrixWorld(true); const b2 = new THREE.Box3().setFromObject(root); root.position.y -= b2.min.y; object.add(root);
  root.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; const m = o.material;
    m.onBeforeCompile = (sh) => { withAir(ctx, sh); sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, .45);'); };
    m.customProgramCacheKey = () => 'heroine-rough45'; });
  const mixer = new THREE.AnimationMixer(root), clips = gltf.animations;
  const find = (name) => clips.find(c => c.name === name) || clips.find(c => c.name.toLowerCase().includes(String(name).toLowerCase())) || clips.find(c => c.name === 'idle') || clips[0];
  const sched = (ctx.SHOTS.hero || [{ t: 0, clip: 'idle' }]).map(e => ({ ...e, fade: e.fade ?? .6, from: e.from ?? 0, rate: e.rate ?? 1, once: !!e.once, clip: find(e.clip) }));
  sched.forEach(e => { e.action = mixer.clipAction(e.clip.clone()); e.action.setLoop(THREE.LoopRepeat, Infinity); e.action.play(); });
  const clipTime = (e, t) => { const D = e.clip.duration, lt = (t - e.t) * e.rate;
    if (e.pp) { const [a, c] = e.pp, L = c - a, u = mod(e.from - a + lt, 2 * L); return a + (u < L ? u : 2 * L - u); }
    return e.once ? clamp(e.from + lt, 0, D - 1e-4) : mod(e.from + lt, D); };
  const bones = {}; root.traverse(o => { if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o; });
  const pose = (t) => { sched.forEach((e, i) => { const nx = sched[i + 1], w = (i === 0 ? 1 : sst(e.t, e.t + e.fade, t)) * (nx ? 1 - sst(nx.t, nx.t + nx.fade, t) : 1);
    e.action.setEffectiveWeight(w); e.action.time = clipTime(e, t); }); mixer.update(0); };
  // bone matrix relative to `object` (hero space), from local TRS only: independent of where the boat is this sub-sample
  const relM = (bone, out) => { out.identity(); for (let o = bone; o && o !== object; o = o.parent) { o.updateMatrix(); out.premultiply(o.matrix); } return out; };

  // ---- the bow on her back (Spine2), then the finale flight
  const spine = bones.Spine2 || bones.Spine1 || bones.Spine;
  const bowG = new THREE.Group(); bowG.name = 'bow'; bowG.matrixAutoUpdate = false; object.add(bowG);
  const bowGL = await loadGLTF('branch_bow'); const bowMats = [];
  if (bowGL) { const B = bowGL.scene.clone(true); const bb = new THREE.Box3().setFromObject(B), bd = bb.getSize(new THREE.Vector3()), k = 1.45 / bd.y; B.scale.setScalar(k); B.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(B).getCenter(new THREE.Vector3()); B.position.sub(c); bowG.add(B);
    B.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material = o.material.clone(); bowMats.push(o.material); } }); }
  // on-back pose in hero space (she faces +z, her left = +x): the bow lies flat on her back (its curve in the plane of the back), limb axis
  // tilted BOW_TILT from vertical with the upper tip over her left shoulder, grip between the shoulder blades just outside the cloak.
  const BACK = (() => { const a = (ctx.SHOTS.bowTilt ?? 22) * Math.PI / 180, Y = new THREE.Vector3(Math.sin(a), Math.cos(a), 0), X = new THREE.Vector3(Math.cos(a), -Math.sin(a), 0), Z = new THREE.Vector3(0, 0, 1);
    return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(...(ctx.SHOTS.bowBack || [.0, 1.2, -.135])); })();
  pose(0); const M0 = relM(spine, new THREE.Matrix4()); const OFF = M0.clone().invert().multiply(BACK);   // bow pose in the bone's frame
  // finale: hover pose (hero space) + leaves + motes
  const LIFT = TL.bowLift || [35.7, 37.1], SINKT = TL.bowSink || [41.8, 44.6], FADE = TL.bowFade || [42.6, 44.8];
  const HOVER = new THREE.Vector3(0, 1.25, .5), UPV = new THREE.Vector3(0, 1, 0);
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _mb = new THREE.Matrix4(), _v = new THREE.Vector3();
  const deckOff = () => (object.parent ? object.parent.position : new THREE.Vector3(0, .18, DECK_Z));
  const treeDir = (t, out) => {   // direction to the tree in hero space (boat frame without bob), horizontal
    const A = ctx.anchors(t), fr = A.boatFrame, T = FIN.TREE || new THREE.Vector3(0, 0, 80);
    out.copy(T).sub(fr.pos).applyQuaternion(_q2.copy(fr.quat).invert()).sub(deckOff()).sub(HOVER).setY(0);
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1); return out.normalize(); };
  const hoverM = (t, out) => { const dir = treeDir(t, _v.set(0, 0, 0)), Z = new THREE.Vector3().crossVectors(dir, UPV);
    const sink = .36 * s5(SINKT[0], SINKT[1], t), bob = .012 * Math.sin(t * 1.3 + .4) * s5(LIFT[1] - .3, LIFT[1] + .5, t);
    out.makeBasis(dir, UPV, Z); const roll = .025 * Math.sin(t * .9 + 1.1); out.multiply(_mb.makeRotationAxis(new THREE.Vector3(1, 0, 0), roll));
    return out.setPosition(HOVER.x, HOVER.y + bob - sink, HOVER.z); };
  const bezier = (a, c, e, u, out) => out.copy(a).multiplyScalar((1 - u) * (1 - u)).addScaledVector(c, 2 * u * (1 - u)).addScaledVector(e, u * u);
  const ARC = new THREE.Vector3(-.5, 3.4, -.4), ARC2 = new THREE.Vector3(-.2, 3.4, .7);   // P1: cubic path, up behind her head (out of shot 15's frame) and down into the hover ahead of her face, never across it
  const bowPose = (t, out) => {   // hero-space matrix of the bow at t (pose(t) must already be applied for the on-back part)
    const u = s5(LIFT[0], LIFT[1], t);
    if (u <= 0) return out.multiplyMatrices(relM(spine, _m), OFF);
    const Mh = hoverM(t, new THREE.Matrix4()); if (u >= 1) return out.copy(Mh);
    const Mb = new THREE.Matrix4().multiplyMatrices(relM(spine, _m), OFF);
    const pa = new THREE.Vector3(), qa = new THREE.Quaternion(), pb = new THREE.Vector3(), qb = new THREE.Quaternion();
    Mb.decompose(pa, qa, _s); Mh.decompose(pb, qb, _s);
    const w = 1 - u, pos = new THREE.Vector3().copy(pa).multiplyScalar(w * w * w).addScaledVector(ARC, 3 * w * w * u).addScaledVector(ARC2, 3 * w * u * u).addScaledVector(pb, u * u * u); const q = qa.slerp(qb, s5(.15, .95, u));
    q.premultiply(_q.setFromAxisAngle(UPV, .5 * Math.sin(Math.PI * u)));   // a turn while it climbs
    return out.compose(pos, q, _s.set(1, 1, 1)); };
  // leaf spiral around the lifting bow
  const NL = 44, rl = mulberry(4101), LD = []; for (let i = 0; i < NL; i++) LD.push({ a: rl() * TAU, h: rl() * 1.5 - .75, r: .2 + rl() * .16, sp: .8 + rl() * .7, sz: .7 + rl() * .7, tw: rl() * TAU });
  const leaves = new THREE.InstancedMesh(leafGeo(), new THREE.MeshStandardMaterial({ color: '#d9b45a', emissive: '#ffc86a', emissiveIntensity: 1.2, roughness: .55, side: THREE.DoubleSide }), NL);
  leaves.frustumCulled = false; leaves.visible = false; object.add(leaves);
  // motes leaving the fading bow
  const NM = 90, rm = mulberry(4102), MD = [];
  const bowPts = []; bowG.traverse(o => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < 400; i++) bowPts.push(new THREE.Vector3().fromBufferAttribute(p, Math.floor(rm() * p.count)).applyMatrix4(o.matrix)); } });
  for (let i = 0; i < NM; i++) MD.push({ p: bowPts.length ? bowPts[i % bowPts.length] : new THREE.Vector3(0, rm() * 1.4 - .7, 0), tb: FADE[0] - .3 + rm() * (FADE[1] - FADE[0] + .1), v: .18 + rm() * .25, ph: rm() * TAU, sz: .006 + rm() * .008 });
  const motes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }), NM); motes.frustumCulled = false; motes.visible = false; object.add(motes);
  for (let i = 0; i < NM; i++) motes.setColorAt(i, new THREE.Color(0, 0, 0));
  const moteC = col('#ffe2a0'), _c = new THREE.Color(), _M = new THREE.Matrix4();
  let bowOp = 1;
  const setBowOpacity = (op) => { if (op === bowOp) return; const tr = op < 1; bowMats.forEach(m => { if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = op; }); bowOp = op; };

  ctx.bowAnchor = (t) => {   // world grip centre + aim direction of the hovering bow (closed form; valid from TL.bowLift[1])
    const A = ctx.anchors(t), M = hoverM(t, new THREE.Matrix4()), p = new THREE.Vector3().setFromMatrixPosition(M).add(deckOff());
    const dir = new THREE.Vector3().setFromMatrixColumn(M, 0).normalize();
    return { pos: p.applyQuaternion(A.b.quat).add(A.b.pos), dir: dir.applyQuaternion(A.b.quat) }; };

  const head = bones.Head || null;
  return { object, glb: true, clips: clips.map(c => c.name), bones, headBone: head, headLocal: new THREE.Vector3(0, 1.58, .05), bow: bowG,
    pose, bowPose,
    setTime(t) {
      object.visible = t >= heroIn; pose(t);
      bowPose(t, bowG.matrix); bowG.matrixWorldNeedsUpdate = true;
      const op = 1 - s5(FADE[0], FADE[1], t); setBowOpacity(op); bowG.visible = op > .003;
      // leaves: spiral in, wrap the bow while it climbs, spin off
      const lv = bump(t, LIFT[0] - .35, LIFT[1] + .45); leaves.visible = lv > 1e-3;
      if (leaves.visible) { const Mb = bowG.matrix, u = clamp((t - LIFT[0] + .35) / (LIFT[1] - LIFT[0] + .8));
        LD.forEach((L, i) => { const r = L.r * (1.9 - 1.1 * sst(0, .35, u) + 1.2 * sst(.75, 1, u)), a = L.a + TAU * L.sp * u * 2.2, h = L.h * (.6 + .4 * sst(0, .4, u));
          _p.set(Math.cos(a) * r, h + .25 * Math.sin(a * .5 + L.tw) * (1 - u), Math.sin(a) * r).applyMatrix4(Mb);
          _q.setFromEuler(new THREE.Euler(L.tw + t * 3 * L.sp, a, .6 * Math.sin(t * 2 + L.tw))); _s.setScalar(L.sz * Math.min(1, lv * 1.6));
          leaves.setMatrixAt(i, _M.compose(_p, _q, _s)); }); leaves.instanceMatrix.needsUpdate = true; }
      // motes: each leaves the bow surface at its birth time and drifts up
      motes.visible = t > FADE[0] - .4 && t < FADE[1] + 2.2;
      if (motes.visible) { const Mn = new THREE.Matrix4();
        MD.forEach((m, i) => { const age = t - m.tb; if (age < 0 || age > 2.2) { motes.setMatrixAt(i, _M.makeScale(0, 0, 0)); return; }
          bowPose(Math.min(t, m.tb), Mn); _p.copy(m.p).applyMatrix4(Mn); _p.y += m.v * age + .05 * age * age; _p.x += .05 * Math.sin(age * 2 + m.ph); _p.z += .05 * Math.cos(age * 1.7 + m.ph);
          const k = sst(0, .15, age) * (1 - sst(1.2, 2.2, age)); motes.setMatrixAt(i, _M.compose(_p, _q.identity(), _s.setScalar(m.sz * (.4 + .6 * k)))); motes.setColorAt(i, _c.copy(moteC).multiplyScalar(9 * k)); });
        motes.instanceMatrix.needsUpdate = true; if (motes.instanceColor) motes.instanceColor.needsUpdate = true; }
    } };
}
