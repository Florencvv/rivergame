// GAME: glowing light motes floating along each world's river (seeded, inside the safe lane). Steering through one collects it:
// a soft gold burst on the water + a short Web Audio chime on the score's motif (D major: D A F# G E).
import * as THREE from 'three';
import { mulberry, clamp, TAU } from './util.js';
import { clampLat } from './lane.js';
import { pathOf } from './path.js';

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.12, 'rgba(255,255,255,.85)'); g.addColorStop(.35, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t;
}

// windows (film time) where the player steers in each world: motes are met inside them
const WIN = { marsh: [4.6, 11.4], ruins: [13.2, 19.6], grotto: [21.0, 27.6], gorge: [29.0, 32.6] };
const PER = { marsh: 7, ruins: 7, grotto: 7, gorge: 5 };   // 26 in all, about one a second of steering

export function makeMotes(ctx, sched) {
  const tex = glowTex(), list = [], group = new THREE.Group(); group.name = 'gameMotes';
  const gold = new THREE.Color('#ffd27a');
  let n = 0;
  for (const w in WIN) {
    const r = mulberry(4100 + w.length * 13 + w.charCodeAt(0)), [a, b] = WIN[w], P = pathOf(w);
    let prev = 0;
    for (let i = 0; i < PER[w]; i++) {
      const t = a + (b - a) * (i + .3 + .4 * r()) / PER[w], s = sched.sAt(t).s, L = clampLat(w, s) * .82;
      let lat = (r() * 2 - 1) * L; if (Math.abs(lat - prev) < .55 * L) lat = clamp(prev + Math.sign(lat - prev || 1) * (.6 + .4 * r()) * L, -L, L);   // make the player move
      prev = lat;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: gold.clone().multiplyScalar(3.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color('#fff4d8').multiplyScalar(9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      halo.scale.setScalar(.95); core.scale.setScalar(.22); halo.renderOrder = core.renderOrder = 7;
      const m = new THREE.Group(); m.add(halo, core); m.visible = false; group.add(m);
      const pos = P.sideAt(s, lat, 1.0);
      list.push({ id: n++, world: w, s, lat, t, pos, obj: m, halo, core, ph: r() * TAU, got: false, gotT: -1 });
    }
  }
  // bursts: a pool of gold sparks + a ring flash on the water
  const NB = 4, NS = 28, spP = new Float32Array(NB * NS * 3), spC = new Float32Array(NB * NS * 3), sparkG = new THREE.BufferGeometry();
  sparkG.setAttribute('position', new THREE.BufferAttribute(spP, 3)); sparkG.setAttribute('color', new THREE.BufferAttribute(spC, 3));
  const sparks = new THREE.Points(sparkG, new THREE.PointsMaterial({ size: .2, map: tex, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  sparks.frustumCulled = false; sparks.renderOrder = 7;   // additive points: an unused spark is simply black (adds nothing)
  const setSpark = (i, p, c) => { spP.set([p.x, p.y, p.z], i * 3); spC.set([c.r, c.g, c.b], i * 3); }, BLACK = new THREE.Color(0, 0, 0), O = new THREE.Vector3();
  const ringMat = () => new THREE.MeshBasicMaterial({ map: ringTex(), color: gold.clone().multiplyScalar(4), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const flashes = []; for (let i = 0; i < NB; i++) { const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: gold.clone().multiplyScalar(9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); f.visible = false; f.renderOrder = 8; group.add(f); flashes.push(f); }
  const rings = []; for (let i = 0; i < NB; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), ringMat()); m.visible = false; m.renderOrder = 7; group.add(m); rings.push(m); }
  group.add(sparks);
  const R = mulberry(77), DIRS = []; for (let i = 0; i < NS; i++) { const a = R() * TAU, u = R() * .9 + .1; DIRS.push(new THREE.Vector3(Math.cos(a) * Math.sqrt(1 - u * u), u, Math.sin(a) * Math.sqrt(1 - u * u)).multiplyScalar(1.2 + R() * 1.6)); }
  const bursts = []; let nb = 0;
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
  function ringTex() { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 30, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.7, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); }

  let total = list.length, got = 0;
  return {
    group, list, get total() { return total; }, get got() { return list.reduce((n, m) => n + (m.got ? 1 : 0), 0); },
    reset() { list.forEach(m => { m.got = false; m.gotT = -1; }); got = 0; bursts.length = 0; rings.forEach(r => r.visible = false); flashes.forEach(f => f.visible = false); spC.fill(0); sparkG.attributes.color.needsUpdate = true; },
    // per frame: world, boat arc length + lateral offset, film time t, real clock (s). Returns the motes collected this frame.
    update(world, sB, latB, t, clock, lowFx = false) {
      const hits = [];
      for (const m of list) {
        const ds = m.s - sB, near = m.world === world && ds < 13 && ds > -5;   // they appear out of the air ~13 m ahead
        m.obj.visible = near && !m.got;
        if (!m.obj.visible) continue;
        const bob = .08 * Math.sin(clock * 1.7 + m.ph), pulse = .85 + .15 * Math.sin(clock * 3.1 + m.ph * 2), k = clamp((13 - ds) / 4) * clamp((ds + 5) / 3);
        m.obj.position.set(m.pos.x, m.pos.y + bob, m.pos.z); m.halo.scale.setScalar(.62 * pulse * k); m.core.scale.setScalar((.15 + .03 * pulse) * k);
        if (ds < 2.3 && ds > -1 && Math.abs(m.lat - latB) < .78) {   /* the bow (2.1 m ahead of the centre) reaches it */ m.got = true; m.gotT = clock; got++; hits.push(m); m.obj.visible = false;
          bursts.push({ k: nb++ % NB, p: m.obj.position.clone(), t0: clock }); }
      }
      // bursts
      for (let b = bursts.length - 1; b >= 0; b--) { const B = bursts[b], age = clock - B.t0, ring = rings[B.k];
        if (age > 1.1) { bursts.splice(b, 1); ring.visible = false; flashes[B.k].visible = false; for (let i = 0; i < NS; i++) setSpark(B.k * NS + i, O, BLACK); continue; }
        const f = clamp(age / 1.1), fade = (1 - f) * (1 - f);
        for (let i = 0; i < NS; i++) { if (lowFx && i % 2) { setSpark(B.k * NS + i, O, BLACK); continue; }
          const d = DIRS[i]; _p.copy(B.p).addScaledVector(d, age * (1 - .45 * f)); _p.y -= 1.2 * age * age; _p.y = Math.max(_p.y, .02);
          setSpark(B.k * NS + i, _p, _c.copy(gold).multiplyScalar(14 * fade)); }
        { const fl = flashes[B.k], g = clamp(age / .5); fl.visible = g < 1; fl.position.copy(B.p); fl.scale.setScalar(.5 + 2.6 * Math.sqrt(g)); fl.material.opacity = (1 - g) * (1 - g); }
        ring.visible = true; ring.position.set(B.p.x, .03, B.p.z); ring.scale.setScalar(.6 + 3.4 * Math.sqrt(f)); ring.material.opacity = fade; }
      sparkG.attributes.position.needsUpdate = sparkG.attributes.color.needsUpdate = true;
      return hits;
    },
  };
}

// a short chime: two sine partials + a soft bell overtone through a small feedback delay. Notes walk the film's harp motif.
const MOTIF = [74, 81, 78, 79, 76, 86, 83, 81, 78];   // D5 A5 F#5 G5 E5 D6 B5 A5 F#5 (D major)
export function makeChime(actx) {
  if (!actx) return () => {};
  const out = actx.createGain(); out.gain.value = .32;
  const dl = actx.createDelay(1); dl.delayTime.value = .23; const fb = actx.createGain(); fb.gain.value = .32; const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
  out.connect(actx.destination); out.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(actx.destination);
  let k = 0;
  return () => {
    const m = MOTIF[k++ % MOTIF.length], f = 440 * Math.pow(2, (m - 69) / 12), t = actx.currentTime + .005;
    for (const [mul, amp, dec] of [[1, .55, 1.4], [2, .16, .7], [3.01, .07, .35], [.5, .1, 1.1]]) {
      const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = f * mul;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .008); g.gain.exponentialRampToValueAtTime(.0005, t + dec);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + .05); }
  };
}
