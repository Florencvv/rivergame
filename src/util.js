// shared helpers: everything here is pure (no state), so renderAt(t) stays a function of time
import * as THREE from 'three';
export const FPS = 60, SHUTTER = .45, W1 = 1920, H1 = 1080, W2 = 3840;
export const TAU = Math.PI * 2, DEG = Math.PI / 180;
export const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
export const lerp = (a, b, t) => a + (b - a) * t;
export const s5 = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
export const sst = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const bump = (t, a, b) => (t <= a || t >= b) ? 0 : Math.sin(Math.PI * (t - a) / (b - a));
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const col = (h) => new THREE.Color(h);                       // sRGB hex -> linear working colour
export function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
export const hsh = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };   // closed-form random in [0,1)
export function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }   // seeded, build-time only
export const fovOf = mm => 2 * Math.atan(10.125 / mm) / DEG;          // vertical fov of a full-frame lens cropped to 16:9
export const mod = (a, n) => ((a % n) + n) % n;
