// Shots from shots.json. Each shot:
//   { name, t0, t1, world, lens (mm, full frame 16:9), fstop, dofK (default 1, scales the physical aperture),
//     space: 'boat' | 'world' | 'lock' | 'tree'   (space of p keys), qSpace (space of q keys, default = space),
//       boat  = rides the boat frame (no bob); lock = the boat frame frozen at shot time lockU (default .5): a locked camera that stays right
//       when a world's path changes; tree = world axes with the origin at the finale TREE (worlds/finale.js); world = absolute.
//     keys: [{ u (0..1 within the shot), p: [x,y,z], q: [x,y,z] }, ...]   eased with smootherstep between keys,
//     focus: 'hero' | 'boat' | 'lantern' | 'q' | [x,y,z] (in qSpace), rack: { to: same kinds as focus, u: [u0, u1] } (focus distance eases),
//     sway (m, closed-form handheld, default .015), boat: {speed, speed1, s0} }
// Boat space: +z downstream (bow), +x = boat's left, y up from the water; rides the boat frame WITHOUT bob (no camera shake).
// Hard cuts between shots; cutClamp keeps motion-blur sub-samples inside the shot of the frame.
import * as THREE from 'three';
import { fovOf, s5, clamp } from './util.js';
import * as FIN from './worlds/finale.js';

export function makeCameraRig(SHOTS, anchors, LEN) {
  const shots = SHOTS.shots;
  const shotAt = (t) => { let s = shots[0]; for (const x of shots) if (t >= x.t0 - 1e-9) s = x; return s; };
  const toWorld = (v, space, fr, lk) => {
    if (space === 'world') return new THREE.Vector3(...v);
    if (space === 'tree') return new THREE.Vector3(...v).add(FIN.TREE || new THREE.Vector3());
    const F = space === 'lock' ? lk : fr; return new THREE.Vector3(...v).applyQuaternion(F.quat).add(F.pos); };
  const keyAt = (keys, u, field) => { if (keys.length === 1) return keys[0][field];
    let i = 0; while (i < keys.length - 2 && u > keys[i + 1].u) i++; const a = keys[i], b = keys[i + 1], f = s5(a.u, b.u, u);
    return a[field].map((x, k) => x + (b[field][k] - x) * f); };
  const target = (fo, A, q, qs, fr, lk) => Array.isArray(fo) ? toWorld(fo, qs, fr, lk) : fo === 'q' ? q.clone() : (A[fo] || A.hero).clone();
  function camAt(t) {
    const sh = shotAt(t), A = anchors(t), fr = A.boatFrame, u = clamp((t - sh.t0) / (sh.t1 - sh.t0));
    const sp = sh.space || 'boat', qs = sh.qSpace || sp;
    const lk = (sp === 'lock' || qs === 'lock') ? anchors(sh.t0 + (sh.lockU ?? .5) * (sh.t1 - sh.t0)).boatFrame : null;
    const p = toWorld(keyAt(sh.keys, u, 'p'), sp, fr, lk), q = toWorld(keyAt(sh.keys, u, 'q'), qs, fr, lk);
    const sw = sh.sway ?? .015;   // handheld breathing: a few incommensurate sines, closed form
    p.x += sw * (Math.sin(t * .71 + 1.3) + .5 * Math.sin(t * 1.53)); p.y += sw * (Math.sin(t * .93 + .2) + .4 * Math.sin(t * 1.87 + 2)); q.x += sw * .6 * Math.sin(t * .61 + 2.4); q.y += sw * .6 * Math.sin(t * .83 + .7);
    let f = target(sh.focus ?? 'hero', A, q, qs, fr, lk);
    if (sh.rack) { const g = target(sh.rack.to, A, q, qs, fr, lk), k = s5(sh.rack.u[0], sh.rack.u[1], u), dir = q.clone().sub(p).normalize();
      const d0 = f.clone().sub(p).dot(dir), d1 = g.clone().sub(p).dot(dir); f = p.clone().addScaledVector(dir, d0 + (d1 - d0) * k); }
    const mm = sh.lens ?? 35, ap = (mm / 1000) / (sh.fstop ?? 4) / 2 * (sh.dofK ?? 1);
    return { name: sh.name, world: sh.world, p, q, f, fov: fovOf(mm), ap, mm };
  }
  const cutClamp = (t, tc) => { const s = shotAt(tc); return Math.min(Math.max(t, s.t0, 0), Math.min(s.t1, LEN) - 1e-4); };
  // QA probe (stage E3): screen position (0..1, y down) of her feet / head / crown / lantern and the tree; frac = her height / frame height
  if (typeof window !== 'undefined') { window.CAMSHOTS = shots; window.CAMANCH = anchors; }
  if (typeof window !== 'undefined') window.CAMPROBE = (t) => { const c = camAt(t), A = anchors(t), fr = A.boatFrame, P = new THREE.PerspectiveCamera(c.fov, 16 / 9, .05, 2000);
    P.position.copy(c.p); P.up.set(0, 1, 0); P.lookAt(c.q); P.updateMatrixWorld(); P.updateProjectionMatrix();
    const pr = (v) => { const w = v.clone().project(P); return [+((w.x + 1) / 2).toFixed(3), +((1 - w.y) / 2).toFixed(3)]; };
    const bw = (v) => new THREE.Vector3(...v).applyQuaternion(fr.quat).add(fr.pos), T = FIN.TREE || new THREE.Vector3();
    const feet = pr(bw([0, .18, -.35])), crown = pr(bw([0, 1.92, -.33])), chin = pr(bw([0, 1.62, -.28]));
    return { name: c.name, feet, crown, head: pr(A.hero), lantern: pr(A.lantern), frac: +(feet[1] - crown[1]).toFixed(3), face: +(chin[1] - crown[1]).toFixed(3),
      treeBase: pr(T.clone().setY(0)), treeTop: pr(T.clone().setY(40)), dist: +c.p.distanceTo(A.hero).toFixed(2) }; };
  return { shots, shotAt, camAt, cutClamp };
}
