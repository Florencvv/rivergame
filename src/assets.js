// GLB assets by name from _work/41/tripo/web/<name>.glb (served as ../tripo/web/ from ride/). Web-ready copies (stage D1): textures webp
// (hero/near 2048, heroine 4096, far 1024), far props decimated; list + true sizes in tripo/web/ASSETS_WEB_READY.
// loadAsset(name, { far }) -> Promise<Object3D>, fitted to TABLE[name].size (height drives the scale, base at y = 0, centred in x/z).
// Missing file -> a stand-in box of the right size and colour (userData.standIn = true).
// far: true tries <name>_far.glb first (exists for marsh_reeds, gorge_maple, grotto_mushrooms, lotus_lantern).
// Old Stage B names (reed_clump, ruin_arch, ...) are aliases of the Tripo names (TABLE[old].file).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// size [x, y, z] in metres = true bbox after fitting (y = target height from TRIPO_PROMPTS.md); tris = triangles in the web file
export const TABLE = {
  heroine:          { size: [.94, 1.72, .45],   color: '#c9d6b0', tris: 86020 },             // A-pose bbox (arms out)
  branch_bow:       { size: [.36, 1.45, .15],   color: '#6a4a2a', tris: 79997 },
  leaf_boat:        { size: [4.2, 2.26, 1.24],  color: '#e8e0d0', tris: 149998, length: 4.2 },  // long axis = file X (hero.js turns it to +z)
  bow_lantern:      { size: [.16, .35, .15],    color: '#e0b060', tris: 40004 },
  lotus_lantern:    { size: [.45, .17, .43],    color: '#8a9a6a', tris: 7998, farTris: 2994 },
  world_tree_dead:  { size: [36.6, 40, 18.2],   color: '#e8e2d4', tris: 149998 },
  marsh_reeds:      { size: [1.74, 2.2, 1.45],  color: '#9a8a50', tris: 12002, farTris: 2994 },
  marsh_waymarker:  { size: [1.13, 3.2, 1.05],  color: '#7a6a4a', tris: 50000 },
  marsh_willow:     { size: [8.75, 9, 6.86],    color: '#6a7a4a', tris: 40000 },
  court_arch:       { size: [11.66, 18, 6.0],   color: '#e8e4da', tris: 99996, shape: 'arch' },   // scale x to the 14 m span in the world
  court_colonnade:  { size: [9.22, 8, 2.85],    color: '#dedad0', tris: 39994 },
  court_statue:     { size: [4.08, 10, 4.41],   color: '#d8d4c8', tris: 80000 },
  grotto_mushrooms: { size: [2.39, 3, 1.82],    color: '#5a3a8a', tris: 19994, farTris: 5002 },
  grotto_root_arch: { size: [12.46, 12, 5.69],  color: '#3a2a30', tris: 39996, shape: 'arch' },
  gorge_maple:      { size: [8.98, 8, 5.02],    color: '#a02a20', tris: 59998, farTris: 15002 },
  gorge_cliff:      { size: [15.86, 30, 9.46],  color: '#5a3a34', tris: 49992 },
  gorge_bridge:     { size: [22, 10.52, 6.43],  color: '#cfc6b8', tris: 50002, fitBy: 'x' },  // 22 m span drives the scale
};
const ALIAS = { leafboat: 'leaf_boat', reed_clump: 'marsh_reeds', dead_tree: 'marsh_willow', ruin_arch: 'court_arch', ruin_column: 'court_colonnade', elf_statue: 'court_statue',
  mushroom_big: 'grotto_mushrooms', root_arch: 'grotto_root_arch', maple_tree: 'gorge_maple', cliff_rock: 'gorge_cliff', world_tree: 'world_tree_dead' };
for (const k in ALIAS) TABLE[k] = { ...TABLE[ALIAS[k]], file: ALIAS[k] };
TABLE.leafboat.deckY = .16;   // legacy field (hero.js measures the real deck)
const fileOf = (name) => TABLE[name]?.file || name;
export const decimationHint = (name) => 1;

const loader = new GLTFLoader();
const cache = new Map();
export const STAND_INS = new Set();

async function tryGLB(url) { try { return await loader.loadAsync(url); } catch (e) { return null; } }
export async function loadGLTF(name) {             // raw gltf (scene + animations) or null; used by hero.js for skinned clips
  const f = fileOf(name.replace(/_far$/, '')) + (name.endsWith('_far') ? '_far' : '');
  if (!cache.has(f)) cache.set(f, tryGLB(`./assets/${f}.glb`));
  return cache.get(f);
}

function fit(obj, size, by = 'y') {
  obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj), d = b.getSize(new THREE.Vector3());
  const ax = by === 'x' ? 0 : 1, k = size[ax] / Math.max(by === 'x' ? d.x : d.y, 1e-6); obj.scale.multiplyScalar(k); obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y;
  const g = new THREE.Group(); g.add(obj); return g;
}

export function standIn(name) {
  const T = TABLE[name] || { size: [1, 1, 1], color: '#ff00ff' };
  const mat = new THREE.MeshStandardMaterial({ color: T.color, roughness: .85 }), g = new THREE.Group(), [X, Y, Z] = T.size;
  const box = (w, h, d, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, 0); g.add(m); };
  if (T.shape === 'arch') { const p = X * .14; box(p, Y, Z, -X / 2 + p / 2, Y / 2); box(p, Y, Z, X / 2 - p / 2, Y / 2); box(X, Y * .14, Z, 0, Y * .93); }   // spans the river: never block the boat
  else box(X, Y, Z, 0, Y / 2); g.userData.standIn = true; g.name = name; STAND_INS.add(name); return g;
}

// returns a fresh instance each call (static props: plain clone shares geometry/materials)
export async function loadAsset(name, opts = {}) {
  const T = TABLE[name]; let gltf = null;
  if (opts.far) gltf = await loadGLTF(name + '_far');
  if (!gltf) gltf = await loadGLTF(name);
  if (!gltf) return standIn(name);
  const g = fit(gltf.scene.clone(true), T ? T.size : [1, 1, 1], T?.fitBy); g.name = name;
  g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = false; } });
  return g;
}
