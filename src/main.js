// The Waking River: the playable web version of film 41. The film engine (ride/) is a pure function of film time t; here t is driven by the
// score's audio clock at 1.0x (Esc / P pause both), and the player adds a lateral offset (path.js GAMEOFF), a chase camera and light motes.
// Debug / QA: window.GAME (seek, qaFrame, stats). ?qa keeps the drawing buffer for screenshots.
import * as THREE from 'three';
import { FPS, clamp, s5, sst, V3, DEG } from './util.js';
import { makePost } from './post.js';
import { makeLook, pathCoords } from './look.js';
import { makeCameraRig } from './camera.js';
import { definePath, pathOf, boatAt, boatSchedule, GAMEOFF } from './path.js';
import { makeBoat, makeHero } from './hero.js';
import { loadAsset } from './assets.js';
import { LANE, clampLat } from './lane.js';
import { makeMotes, makeChime } from './motes.js';
import * as marsh from './worlds/marsh.js';
import * as ruins from './worlds/ruins.js';
import * as grotto from './worlds/grotto.js';
import * as gorge from './worlds/gorge.js';
import * as finale from './worlds/finale.js';
import { CX as CARD_X, CY as CARD_Y } from './fx/endcard.js';
const WORLDS = { marsh, ruins, grotto, gorge, finale };
const $ = (id) => document.getElementById(id);
const ERR = window.ERRORS = []; window.addEventListener('error', e => ERR.push(String(e.message))); window.addEventListener('unhandledrejection', e => ERR.push(String(e.reason && e.reason.stack || e.reason)));
const fail = (msg) => { const e = $('err'); e.textContent = msg; e.classList.remove('hidden'); };
const QS = new URLSearchParams(location.search), QA = QS.has('qa');
const TOUCH = matchMedia('(pointer: coarse)').matches;
if (TOUCH) { $('go').textContent = 'tap to set sail'; $('keys').textContent = 'drag sideways to steer · two fingers to look around'; $('resume').textContent = 'tap to sail on'; }

// ------------------------------------------------------------------ 1. preload every GLB + the score with byte progress (into THREE.Cache)
const SIZES = { 'bow_lantern.glb': 2462028, 'branch_bow.glb': 3360892, 'court_arch.glb': 4750408, 'court_colonnade.glb': 1747648, 'court_statue.glb': 3760216, 'gorge_bridge.glb': 2121220,
  'gorge_cliff.glb': 1804124, 'gorge_maple.glb': 2843860, 'gorge_maple_far.glb': 964944, 'grotto_mushrooms.glb': 1117772, 'grotto_mushrooms_far.glb': 400132, 'grotto_root_arch.glb': 1684928,
  'heroine.glb': 7092392, 'leaf_boat.glb': 5585688, 'lotus_lantern_far.glb': 370748, 'marsh_reeds.glb': 1034748, 'marsh_reeds_far.glb': 384440, 'marsh_waymarker.glb': 2662204,
  'marsh_willow.glb': 1865516, 'world_tree_dead.glb': 6085740, 'score.m4a': 1094798 };
const TOTAL = Object.values(SIZES).reduce((a, b) => a + b, 0), got = {};
const fill = (f, note) => { $('fill').style.width = (100 * clamp(f)).toFixed(1) + '%'; if (note) $('note').textContent = note; };
const progress = () => fill(.8 * Object.values(got).reduce((a, b) => a + b, 0) / TOTAL);
async function fetchBytes(name) {
  const r = await fetch('./assets/' + name); if (!r.ok) throw new Error(name + ' ' + r.status);
  if (!r.body || !r.body.getReader) { const b = await r.arrayBuffer(); got[name] = SIZES[name]; progress(); return b; }
  const rd = r.body.getReader(), parts = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; got[name] = Math.min(n, SIZES[name]); progress(); }
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } got[name] = SIZES[name]; progress(); return out.buffer;
}
THREE.Cache.enabled = true;
let scoreBytes = null;
try {
  await Promise.all(Object.keys(SIZES).map(async (n) => { const b = await fetchBytes(n); if (n.endsWith('.glb')) THREE.Cache.add('./assets/' + n, b); else scoreBytes = b; }));
} catch (e) { fail('The river could not be loaded (' + e.message + '). Serve this folder over http and reload.'); throw e; }

// audio: one context for the score and the chimes; decoding works while it is still suspended (before the first click)
const AC = window.AudioContext || window.webkitAudioContext;
const actx = AC ? new AC({ latencyHint: 'interactive' }) : null;
let scoreBuf = null; try { if (actx && scoreBytes) scoreBuf = await actx.decodeAudioData(scoreBytes.slice(0)); } catch (e) { ERR.push('score decode: ' + e.message); }
const chime = makeChime(actx);

// ------------------------------------------------------------------ 2. the film engine (as ride/src/main.js, single sample, live size)
fill(.82, 'waking the worlds');
const TL = await (await fetch('./src/data/timeline.json')).json();
const SHOTS = await (await fetch('./src/data/shots.json')).json();
const LEN = TL.frames / FPS;
const canvas = $('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: QA, powerPreference: 'high-performance' }); }
catch (e) { fail('This river needs WebGL 2. Please try a recent Chrome, Edge, Firefox or Safari.'); throw e; }
renderer.setPixelRatio(1); renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.autoClear = false;
const gl = renderer.getContext();
const UNMASKED = (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })();
const FLOATBLEND = !!gl.getExtension('EXT_float_blend');

// quality ladder (auto step-down when a frame takes > 20 ms): render scale, MSAA, reflection divisor, particle fraction
const QL = [{ s: 1, msaa: 0, refl: 2, fx: 1 }, { s: .85, msaa: 0, refl: 2.5, fx: 1 },   /* MSAA on the half-float target leaves dashed seams in the sky: off */ { s: .72, msaa: 0, refl: 3, fx: .5 }, { s: .58, msaa: 0, refl: 3.5, fx: .4 }];
let Q = clamp(+(QS.get('q') || 0), 0, 3) | 0;
const sizeNow = () => { const k = Math.min(window.devicePixelRatio || 1, 1.5) * QL[Q].s; return [Math.max(320, Math.round(innerWidth * k)), Math.max(180, Math.round(innerHeight * k))]; };
let [RW, RH] = sizeNow();
renderer.setSize(RW, RH, false);
const POSTK = makePost(renderer, RW, RH, RW, 1e9, FLOATBLEND); POSTK.setSamples(QL[Q].msaa);
const { rtScene, post, POST } = POSTK;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, RW / RH, .05, 1400); scene.add(camera);
const WORLD = new THREE.Group(); scene.add(WORLD);

for (const id in WORLDS) definePath(id, WORLDS[id].path);
const sched = boatSchedule(SHOTS.shots);
const ctx = { THREE, renderer, scene, camera, WORLD, RW, RH, POSTK, TL, SHOTS, loadAsset, now: {}, path: null, anchors: null, look: null };
const boat = await makeBoat(ctx); WORLD.add(boat.object);
const hero = await makeHero(ctx); boat.deck.add(hero.object);
const HEAD = boat.deck.position.clone().add(hero.headLocal), LANT = boat.lantern.bulb.position.clone();
function anchors(t) {
  const { world, s } = sched.sAt(t), b = boatAt(world, s, t), toW = (v) => v.clone().applyQuaternion(b.quat).add(b.pos);
  return { world, s, b, boatFrame: b.frame, boat: toW(V3(0, .4, 0)), hero: toW(HEAD), lantern: toW(LANT) };
}
ctx.anchors = anchors;
const look = ctx.look = makeLook(ctx); look.resize(RW, RH, QL[Q].refl);
const rig = makeCameraRig(SHOTS, anchors, LEN);
const groups = {}; let wi = 0;
for (const id in WORLDS) { ctx.path = pathOf(id); const g = await WORLDS[id].build(ctx); g.name = id; g.visible = false; WORLD.add(g); groups[id] = g; fill(.82 + .1 * (++wi) / 5); }
THREE.Cache.clear(); THREE.Cache.enabled = false;
const motes = makeMotes(ctx, sched); WORLD.add(motes.group);
$('n').textContent = `0 / ${motes.total}`;

let active = null;
function setTime(t) {
  const A = anchors(t), id = A.world;
  if (id !== active) { for (const k in groups) groups[k].visible = k === id; look.setWorld(WORLDS[id].look); active = id; }
  boat.object.position.copy(A.b.pos); boat.object.quaternion.copy(A.b.quat); boat.setTime(t); hero.setTime(t);
  ctx.now = { t, world: id, s: A.s, boat: A.b }; ctx.path = pathOf(id);
  WORLDS[id].update(ctx, t); look.update(t);
}
function veilAt(t) { let v = 0, c = '#ffffff'; for (const w of SHOTS.veils || []) { const a = (t < w.t ? sst(w.t - (w.in ?? .4), w.t, t) : 1 - sst(w.t, w.t + (w.out ?? .6), t)) * (w.max ?? 1); if (a > v) { v = a; c = w.color; } } return { v, c }; }

// ------------------------------------------------------------------ 3. cameras
const UP = V3(0, 1, 0);
// vertical fov for a 16:9 lens; narrower windows keep the horizontal field instead (capped)
const fitFov = (v) => { const a = RW / RH; if (a >= 16 / 9) return v; return Math.min(100, 2 * Math.atan(Math.tan(v * DEG / 2) * (16 / 9) / a) / DEG); };
function filmCam(t) { const c = rig.camAt(t); camera.fov = fitFov(c.fov); camera.aspect = RW / RH; camera.position.copy(c.p); camera.up.set(0, 1, 0); camera.lookAt(c.q); camera.clearViewOffset(); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); }
const CH = { lat: 0, yaw: 0, pitch: 0, drag: false, idle: 0 };            // chase: smoothed lateral, orbit offsets (deg)
const _f = V3(), _l = V3(), _b = V3(), _piv = V3(), _look = V3();
function chaseCam(t, dt, yawDeg = CH.yaw, pitchDeg = CH.pitch) {
  const A = anchors(t), w = A.world, P = pathOf(w), Ln = LANE[w] || LANE.finale, h = A.boatFrame.heading;
  CH.lat += (GAMEOFF.lat - CH.lat) * (1 - Math.exp(-dt * 2.4));
  _f.set(Math.sin(h), 0, Math.cos(h)); _l.set(Math.cos(h), 0, -Math.sin(h));
  P.sideAt(A.s, CH.lat, 0, _piv); _piv.y = 1.3;
  const yaw = clamp(yawDeg, -120, 120) * DEG, pitch = clamp(13 + pitchDeg, -1, Ln.pitchMax) * DEG;
  _b.copy(_f).negate().applyAxisAngle(UP, yaw);
  let D = 7.2; const latPer = _b.dot(_l) * Math.cos(pitch);
  if (Math.abs(latPer) > 1e-3) D = Math.min(D, Math.max(2.2, (Ln.camMax - Math.sign(latPer) * CH.lat) / Math.abs(latPer)));
  camera.position.copy(_piv).addScaledVector(_b, Math.cos(pitch) * D); camera.position.y += Math.sin(pitch) * D;
  const pc = pathCoords(w, camera.position.x, camera.position.z); if (Math.abs(pc.lat) > Ln.camMax) camera.position.addScaledVector(_l, Math.sign(pc.lat) * Ln.camMax - pc.lat);   // river bends: stay over the water
  camera.position.y = Math.max(camera.position.y, .55);
  const ahead = Math.max(0, Math.cos(yaw)); _look.copy(_piv).addScaledVector(_f, 3.6 * ahead); _look.y = 1.3 - .45 * ahead;
  camera.fov = fitFov(40); camera.aspect = RW / RH; camera.up.set(0, 1, 0); camera.lookAt(_look); camera.clearViewOffset(); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}

// ------------------------------------------------------------------ 4. one frame
function draw(t, useFilm, dt, titleClock = null, yaw = CH.yaw, pitch = CH.pitch) {
  if (useFilm) filmCam(t); else chaseCam(t, dt, yaw, pitch);
  setTime(t);
  if (titleClock != null) { look.U.time.value = t + titleClock; look.U.uMist.value.w = t + titleClock; }   // the title holds a moment but the water keeps moving
  look.renderReflection();
  renderer.setRenderTarget(rtScene); renderer.setClearColor(0, 1); renderer.clear(); renderer.render(scene, camera);
  const V = veilAt(t); POST.veil = V.v; POST.veilC.set(V.c);
  post(1, Math.round(t * FPS), rtScene.texture);
}

// ------------------------------------------------------------------ 5. resize + quality
let dirty = true;
function applySize() {
  const [w, h] = sizeNow(); if (w === RW && h === RH) return;
  RW = ctx.RW = w; RH = ctx.RH = h; renderer.setSize(RW, RH, false); POSTK.setSize(RW, RH); look.resize(RW, RH, QL[Q].refl); dirty = true;
}
const fxMeshes = []; WORLD.traverse(o => { if (o.isMesh && o.geometry && o.geometry.isInstancedBufferGeometry && o.material && o.material.blending === THREE.AdditiveBlending) fxMeshes.push([o, o.geometry.instanceCount]); });
function applyQuality() {
  RW = 0; applySize(); POSTK.setSamples(QL[Q].msaa);
  for (const [m, n] of fxMeshes) m.geometry.instanceCount = Math.max(1, Math.floor(n * QL[Q].fx));
  look.mist.visible = Q < 3; dirty = true;
}
applyQuality();
window.addEventListener('resize', () => applySize());

// ------------------------------------------------------------------ 6. warm-up: compile every world's shaders under the loading screen
{ const shots = rig.shots; for (let i = 0; i < shots.length; i++) { const sh = shots[i]; draw((sh.t0 + sh.t1) / 2, true, 0); if (i % 3 === 2) { fill(.92 + .08 * i / shots.length); await new Promise(r => requestAnimationFrame(r)); } } }
fill(1, '');

// ------------------------------------------------------------------ 7. game state: clock (locked to the score), steering, input
let state = 'title', src = null, t0A = 0, perf0 = 0, pausedT = 0, useAudio = !!scoreBuf, filmMode = false, endT = LEN - 1e-3;
const lat = { x: 0, v: 0 };
const latency = () => actx ? (actx.outputLatency || actx.baseLatency || 0) : 0;
function clockT() {
  if (state === 'pause' || state === 'end') return pausedT;
  if (useAudio) return Math.max(0, actx.currentTime - t0A - latency());
  return Math.max(0, performance.now() / 1000 - perf0);
}
function stopSrc() { if (src) { try { src.stop(); } catch (e) {} src.disconnect(); src = null; } }
function playFrom(t) {
  stopSrc();
  if (useAudio) { src = actx.createBufferSource(); src.buffer = scoreBuf; src.connect(actx.destination); const when = actx.currentTime + .06; src.start(when, Math.min(t, scoreBuf.duration - .01)); t0A = when - t + latency(); }
  else perf0 = performance.now() / 1000 - t;
}
async function start() {
  if (state !== 'title') return;
  if (actx) { try { await actx.resume(); } catch (e) {} }
  if (useAudio && actx.state !== 'running') useAudio = false;           // no audio device / blocked: run on the wall clock
  $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
  lat.x = lat.v = 0; CH.lat = 0; CH.yaw = CH.pitch = 0; motes.reset(); $('n').textContent = `0 / ${motes.total}`;
  state = 'play'; playFrom(0); qReset(); canvas.focus();
  if (useAudio) setTimeout(() => { if (state === 'play' && actx.state !== 'running') { const t = clockT(); useAudio = false; perf0 = performance.now() / 1000 - t; } }, 1500);
}
function pause() { if (state !== 'play') return; pausedT = clockT(); state = 'pause'; if (useAudio) actx.suspend(); $('pause').classList.remove('hidden'); }
async function resume() { if (state !== 'pause') return; $('pause').classList.add('hidden');
  if (useAudio) await actx.resume(); else perf0 = performance.now() / 1000 - pausedT;   // the suspended context froze both the score and the clock
  state = 'play'; qReset(); }
function end() {
  state = 'end'; pausedT = endT; stopSrc(); dirty = true;
  const n = motes.got, m = motes.total, asp = RW / RH, hh = asp < 16 / 9 ? (2560 / 3840) * asp / 4 : 640 / 2160, txt = .076 * hh / (640 / 2160);
  $('stats').textContent = `${n} / ${m} lights gathered`;
  $('stats').style.left = $('again').style.left = (CARD_X * 100).toFixed(2) + '%';
  $('stats').style.top = ((CARD_Y + txt * .62 + .03) * 100).toFixed(2) + '%'; $('again').style.top = ((CARD_Y + txt * .62 + .095) * 100).toFixed(2) + '%';
  $('hud').classList.add('hidden'); setTimeout(() => { if (state === 'end') $('end').classList.remove('hidden'); }, 400);
}
function again() {
  if (state !== 'end') return; $('end').classList.add('hidden'); $('hud').classList.remove('hidden');
  lat.x = lat.v = 0; CH.lat = 0; motes.reset(); $('n').textContent = `0 / ${motes.total}`; state = 'play'; playFrom(0); qReset();
}
$('title').addEventListener('pointerup', start);
$('pause').addEventListener('pointerup', resume);
$('again').addEventListener('pointerup', (e) => { e.stopPropagation(); again(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

const keys = {};
const showCam = () => { const l = $('camlabel'); l.textContent = filmMode ? 'Film camera' : 'Chase camera'; l.style.opacity = 1; clearTimeout(showCam.h); showCam.h = setTimeout(() => l.style.opacity = 0, 1600); };
window.addEventListener('keydown', (e) => {
  const k = e.code; keys[k] = true;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(k)) e.preventDefault();
  if (e.repeat) return;
  if (k === 'Escape' || k === 'KeyP') { if (state === 'play') pause(); else if (state === 'pause') resume(); }
  else if (k === 'KeyC' && (state === 'play' || state === 'pause')) { filmMode = !filmMode; showCam(); dirty = true; }
  else if ((k === 'Enter' || k === 'Space') && state === 'title') start();
  else if ((k === 'Enter' || k === 'Space') && state === 'end') again();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
// pointer: mouse drag orbits; one finger steers (sideways drag), two fingers orbit
const touches = new Map(); let mouse = null, touchU = 0, steerId = null, steerX0 = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType === 'mouse') { mouse = { x: e.clientX, y: e.clientY }; CH.drag = true; return; }
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 1) { steerId = e.pointerId; steerX0 = e.clientX; } else { steerId = null; touchU = 0; CH.drag = true; }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { if (!mouse) return; CH.yaw = clamp(CH.yaw - (e.clientX - mouse.x) * .3, -120, 120); CH.pitch = clamp(CH.pitch + (e.clientY - mouse.y) * .18, -14, 30); mouse = { x: e.clientX, y: e.clientY }; CH.idle = 0; return; }
  const p = touches.get(e.pointerId); if (!p) return;
  if (touches.size >= 2) { CH.yaw = clamp(CH.yaw - (e.clientX - p.x) * .35 / touches.size, -120, 120); CH.pitch = clamp(CH.pitch + (e.clientY - p.y) * .2 / touches.size, -14, 30); CH.idle = 0; }
  else if (e.pointerId === steerId) touchU = clamp(-(e.clientX - steerX0) / (.16 * innerWidth), -1, 1);
  p.x = e.clientX; p.y = e.clientY;
});
const up = (e) => { if (e.pointerType === 'mouse') { mouse = null; CH.drag = false; return; } touches.delete(e.pointerId); if (e.pointerId === steerId) { steerId = null; touchU = 0; } if (touches.size < 2) CH.drag = false; };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// steering: inertia on the lateral speed, hard clamp to the world's safe lane, bank + yaw from the lateral speed
const VMAX = 1.9, CTRL = [3.15, 32.9], RELEASE = [32.9, 33.5];
function steer(t, dt, A) {
  const ctl = t >= CTRL[0] && t < CTRL[1] ? 1 : 0;
  const u = ctl ? clamp((keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0) + touchU, -1, 1) : 0;
  lat.v += (u * VMAX - lat.v) * (1 - Math.exp(-dt * 3.2));
  lat.x += lat.v * dt;
  const L = clampLat(A.world, A.s);
  if (lat.x > L) { lat.x = Math.max(L, lat.x - 3 * dt); lat.v = Math.min(lat.v, 0); }
  if (lat.x < -L) { lat.x = Math.min(-L, lat.x + 3 * dt); lat.v = Math.max(lat.v, 0); }
  const k = 1 - s5(RELEASE[0], RELEASE[1], t);
  GAMEOFF.lat = lat.x * k; GAMEOFF.yaw = clamp(lat.v * .075, -.12, .12) * k; GAMEOFF.bank = -clamp(lat.v * .028, -.05, .05) * k;
}
const filmNow = (t) => filmMode || t < CTRL[0] || t >= 33.5;   // the hook and the finale are always the film's own shots

// quality monitor: mean frame time over 60 frames; > 20 ms -> one step down (never back up)
const QM = { n: 0, sum: 0, hold: 0 }; const qReset = () => { QM.n = QM.sum = 0; QM.hold = 1.5; };
const FR = []; // recent frame times (ms) for GAME.stats
function qTick(dt) {
  FR.push(dt * 1000); if (FR.length > 600) FR.shift();
  if (QM.hold > 0) { QM.hold -= dt; return; }
  QM.n++; QM.sum += dt; if (QM.n < 60) return;
  const ms = QM.sum / QM.n * 1000; QM.n = QM.sum = 0;
  if (ms > 20 && Q < QL.length - 1 && !QS.has('q')) { Q++; applyQuality(); QM.hold = 2.5; }
}

// ------------------------------------------------------------------ 8. loop
let last = performance.now(), lastWorld = null, titleT0 = performance.now();
const TITLE_T = +(QS.get('tt') || 5.6);   // shot 3, the gold glide: the film's first hero image under the title
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (QA && window.__qaHold) return;
  if (state === 'title') { const c = (now - titleT0) / 1000; draw(TITLE_T, true, 1, c); return; }
  if (state === 'pause') { if (dirty) { draw(pausedT, filmNow(pausedT), 0); dirty = false; } return; }
  if (state === 'end') { if (dirty) { draw(endT, true, 0); dirty = false; } return; }
  // play
  let t = clockT(); if (t >= LEN - .02) { end(); draw(endT, true, 0); return; }
  const A0 = sched.sAt(t); steer(t, dt, A0);
  if (A0.world !== lastWorld) { lastWorld = A0.world; QM.hold = Math.max(QM.hold, 1); }
  if (!CH.drag) { CH.idle += dt; if (CH.idle > .5) { const e = Math.exp(-dt * 1.8); CH.yaw *= e; CH.pitch *= e; } }
  const hits = motes.update(A0.world, A0.s, GAMEOFF.lat, t, now / 1000, Q >= 2);
  if (hits.length) { hits.forEach(() => chime()); const c = $('count'); $('n').textContent = `${motes.got} / ${motes.total}`; c.classList.add('pop'); setTimeout(() => c.classList.remove('pop'), 260); }
  draw(t, filmNow(t), dt);
  qTick(dt);
}
$('loading').classList.add('hidden'); $('title').classList.remove('hidden');
requestAnimationFrame(frame);

// ------------------------------------------------------------------ 9. QA / debug handles
window.GAME = {
  get state() { return state; }, get t() { return clockT(); }, get Q() { return Q; }, get size() { return [RW, RH]; }, motes, LANE, clampLat, renderer: UNMASKED, errors: ERR, audio: () => ({ useAudio, ctx: actx && actx.state }),
  start, pause, resume, again,
  seek(t) { if (state !== 'play') return; playFrom(t); qReset(); },
  setFilm(v) { filmMode = !!v; },
  stats() { const a = FR.slice(-180); if (!a.length) return null; const m = a.reduce((x, y) => x + y, 0) / a.length; const s = [...a].sort((x, y) => x - y); return { fps: +(1000 / m).toFixed(1), meanMs: +m.toFixed(2), p95: +s[Math.floor(s.length * .95)].toFixed(2), Q, size: [RW, RH] }; },
  // render one deterministic frame: { t, lat, film, yaw, pitch, collect: clock seconds after a collect burst }
  qaFrame(o = {}) { window.__qaHold = true; $('title').classList.add('hidden'); $('hud').classList.remove('hidden'); filmMode = !!o.film; const t = o.t ?? 10; const A = sched.sAt(t), L = clampLat(A.world, A.s);
    const lx = o.lat === 'L' ? L : o.lat === 'R' ? -L : (o.lat ?? 0); lat.x = lx; lat.v = 0; GAMEOFF.lat = lx; GAMEOFF.yaw = o.yawBoat ?? 0; GAMEOFF.bank = o.bank ?? 0; CH.lat = lx;
    if (o.mote != null) { const m = motes.list[o.mote]; motes.reset(); motes.update(m.world, m.s - 2.25, m.lat, m.t, 100); motes.update(A.world, A.s, lx, t, 100 + (o.after ?? .25)); }
    else motes.update(A.world, A.s, lx, t, 100);
    draw(t, !!o.film || t >= 33.5, 0, null, o.yaw ?? 0, o.pitch ?? 0); $('n').textContent = `${motes.got} / ${motes.total}`;
    return { world: A.world, s: +A.s.toFixed(2), lat: +lx.toFixed(2), clamp: +L.toFixed(2) }; },
  qaTitle() { window.__qaHold = true; draw(TITLE_T, true, 1, 2); },
  qaEnd(n = 23) { window.__qaHold = true; state = 'end'; pausedT = endT; motes.list.forEach((m, i) => m.got = i < n); draw(endT, true, 0); const g = motes.got; end(); return g; },
  release() { window.__qaHold = false; },
};
window.READY = true;
