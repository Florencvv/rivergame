// River paths: one centripetal Catmull-Rom spline per world on the water plane (y = 0), with an arc-length table.
// boatAt(world, s, t) -> boat pose at arc length s (metres) plus a closed-form bob / roll / pitch in t.
// boatSchedule(shots) -> sAt(t): arc length per shot from shots.json "boat": { speed, speed1?, s0? } (closed form, no sim).
import * as THREE from 'three';
import { clamp } from './util.js';

const PATHS = {};
const N = 2048;

export class RiverPath {
  constructor(pts) {
    this.curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    this.u = new Float64Array(N + 1); this.len = new Float64Array(N + 1);
    let prev = this.curve.getPoint(0), L = 0;
    for (let i = 0; i <= N; i++) { const u = i / N, p = this.curve.getPoint(u); L += p.distanceTo(prev); prev = p; this.u[i] = u; this.len[i] = L; }
    this.length = L;
  }
  uAt(s) { s = clamp(s, 0, this.length); let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.len[m] < s) lo = m; else hi = m; }
    const a = this.len[lo], b = this.len[hi], f = b > a ? (s - a) / (b - a) : 0; return this.u[lo] + (this.u[hi] - this.u[lo]) * f; }
  pointAt(s, out = new THREE.Vector3()) { return out.copy(this.curve.getPoint(this.uAt(s))); }
  tangentAt(s, out = new THREE.Vector3()) { return out.copy(this.curve.getTangent(this.uAt(s))).setY(0).normalize(); }
  headingAt(s) { const d = this.tangentAt(s); return Math.atan2(d.x, d.z); }               // yaw so local +z points downstream
  // point offset sideways from the river centre line: side > 0 = left bank (local +x of the boat)
  sideAt(s, side, y = 0, out = new THREE.Vector3()) { const p = this.pointAt(s, out), h = this.headingAt(s); return p.set(p.x + Math.cos(h) * side, y, p.z - Math.sin(h) * side); }
}

export function definePath(world, pts) { PATHS[world] = new RiverPath(pts); return PATHS[world]; }
export const pathOf = (world) => PATHS[world];

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
// GAME: the player's steering. lat = lateral offset off the river line (m, + = boat's left), yaw / bank (rad) of the hull. Set once per frame by main.js.
export const GAMEOFF = { lat: 0, yaw: 0, bank: 0 };
// boat pose. frame = smooth pose without bob (cameras ride this); pos/quat include the gentle bob.
export function boatAt(world, s, t) {
  const P = PATHS[world], heading = P.headingAt(s), p = P.sideAt(s, GAMEOFF.lat);
  const bob = .022 * Math.sin(1.31 * t) + .012 * Math.sin(2.17 * t + 1.1) + .006 * Math.sin(3.7 * t + .4);
  const roll = .018 * Math.sin(.93 * t + .5) + .008 * Math.sin(1.71 * t + 2.0);
  const pitch = .010 * Math.sin(1.13 * t + 2.2) + .005 * Math.sin(2.6 * t);
  const quat = new THREE.Quaternion().setFromEuler(_e.set(pitch, heading + GAMEOFF.yaw, roll + GAMEOFF.bank, 'YXZ'));
  return { s, heading, roll, pitch, bob, pos: p.clone().setY(bob), quat, frame: { pos: p, heading, quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading) } };
}

// speed profile. Each shot: boat = { speed (m/s at t0), speed1 (m/s at t1, default = speed), s0 (optional absolute arc length at t0) }.
// Without s0 a shot continues where the previous shot of the same world stopped (first shot of a world starts at 0).
export function boatSchedule(shots) {
  const segs = [], endOf = {};
  for (const sh of shots) {
    const b = sh.boat || {}, v0 = b.speed ?? 1.2, v1 = b.speed1 ?? v0, D = sh.t1 - sh.t0;
    const s0 = b.s0 ?? endOf[sh.world] ?? 0;
    segs.push({ t0: sh.t0, t1: sh.t1, world: sh.world, s0, v0, v1, D });
    endOf[sh.world] = s0 + (v0 + v1) * .5 * D;
  }
  const sAt = (t) => { let g = segs[0]; for (const x of segs) if (t >= x.t0) g = x; const dt = clamp(t - g.t0, 0, g.D);
    return { world: g.world, s: g.s0 + g.v0 * dt + .5 * (g.v1 - g.v0) / g.D * dt * dt }; };
  return { sAt, segs, endOf };
}
