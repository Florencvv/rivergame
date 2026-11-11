// FINALE: the dead white world-tree; a light arrow flies from the boat, the tree blooms, the sky fills with light. Effects: fx/finale.js (E4).
// Timing comes from timeline.json "finale": { arrow: [t0, t1], bloom: [t0, t1] }.
import * as THREE from 'three';
import { lanternRoad, proto, scatter, register, beginWorld } from './common.js';
import * as FX from '../fx/finale.js';
export const id = 'finale';
export const path = [[0, -20], [0, 0], [1, 20], [0, 40]];
export const TREE = new THREE.Vector3(0, 0, 55);   // E3: 78 -> 55 so shot 17 can hold it at ~70% of frame height with the boat in frame
export const TREE_INFO = {};               // trunk offset of the GLB (m) and its fitted size
export { road };
export const look = {
  finale: true,                                                                            // wake + bloom follow TL.finale.bloom, not the boat
  palette: { skyTop: '#1b2452', skyMid: '#34428a', skyHorizon: '#5a6fb8', skyBottom: '#1b2452', sun: '#000000', wake: '#ffe6a6' },
  sunDir: [0, .8, .6], sun: { disc: 0, glow: 0 },
  sky: { exp: .8, midH: .3, hazeK: 10, haze: 1 },                                          // empty blue hour, no stars
  fog: { color: '#5a6fb8', density: .008, mist: .005, mistH: 2.5, banks: .2, scatter: 0, scatterC: '#ffd9a0' },
  water: { tint: '#1b2452', deep: '#0c1230', mirror: 1, f0: .7, rough: .015, ripple: .0006, glit: .8, colTh: 1.6, colLen: 1.3, broken: .25, wakeAmp: .5, front: 0 },   // perfect stillness
  light: { key: '#afc2ff', keyI: 2.4, hemiSky: '#8a9ae0', hemiGround: '#2a3670', hemiI: 1.2, rim: '#afc2ff', rimI: 0, faceI: 3 },
  grade: { exposure: 1.25, con: 1.1, conAwake: 1.0, sat: [.7, 1.15], bloom: [.5, .75], bloomPeak: 1.4, lift: .006, asleepEv: 0, asleepTint: '#f0f3ff' },
  awake: { palette: { skyHorizon: '#f2b48c', skyMid: '#5b4c98', skyTop: '#1c2158' }, fog: { color: '#d8a890', scatter: .5 }, light: { key: '#ffe6a6', hemiSky: '#c8b8e0', rim: '#ffe6a6', rimI: 70 } } };
let road;
export async function build(ctx) {
  const P = ctx.path, g = new THREE.Group();
  beginWorld('finale');
  // the 40 m bone-white world tree on a small pale stone island, trunk axis exactly on TREE (shot 17 is a symmetric frame)
  const tp = await proto('world_tree_dead', { h: 40, standIn: [36, 40, 18], color: '#f2f0ea', rough: .85 }), tc = new THREE.Vector3(); let n = 0;
  for (const v of tp.pts) if (v.y > .12 * 40 && v.y < .3 * 40) { tc.add(v); n++; } if (n) tc.divideScalar(n);
  const ig = new THREE.CylinderGeometry(11, 13.5, 1.4, 48, 2), ia = ig.attributes.position;
  for (let i = 0; i < ia.count; i++) { const x = ia.getX(i), z = ia.getZ(i), a = Math.atan2(z, x), k = 1 + .06 * Math.sin(a * 5 + 1) + .04 * Math.sin(a * 11); ia.setX(i, x * k); ia.setZ(i, z * k); } ig.computeVertexNormals();
  const isl = new THREE.Mesh(ig, new THREE.MeshStandardMaterial({ color: '#d9d5cc', roughness: .95 })); isl.position.copy(TREE).setY(-.3); isl.name = 'island'; g.add(register(isl));
  g.add(scatter(tp, [{ p: new THREE.Vector3(TREE.x - tc.x, .35, TREE.z - tc.z), ry: 0 }], { name: 'world_tree' }));
  TREE_INFO.trunkOffset = [+tc.x.toFixed(2), +tc.z.toFixed(2)]; TREE_INFO.size = tp.size.toArray().map(x => +x.toFixed(1));
  road = await lanternRoad(ctx, P, { color: '#ffc66e', s0: 4, world: 'finale' }); g.add(road.group);
  await FX.ready; FX.build(ctx, g, { TREE, tp, off: new THREE.Vector3(TREE.x - tc.x, .35, TREE.z - tc.z), road });   // E4: every finale effect + the end card
  g.userData = { road, TREE };
  return g;
}
export function update(ctx, t) {
  const { s } = ctx.now; FX.pre(ctx, t); road.update(t, s); FX.update(ctx, t);
}
