// GAME: the safe lane per world. The lotus road is moved out to lotusSide(world, s) (film: 2.5 m) and the boat's lateral offset is clamped
// to clampLat = lotusSide - HULL, where HULL = half beam .62 + yaw sweep 2.1 * sin(.12) + lotus pad radius .4 + margin .13 = 1.4 m.
// Nearest set pieces (from worlds/*.js): marsh reeds >= 3.1 m, court arch legs 4.1 m / guardians 4.4 m, grotto mushrooms >= 2.9 m / root legs 3.8 m,
// gorge banks >= 6.8 m. camMax = how far off the river line the chase camera may swing (orbit shortens its arm instead), pitchMax in degrees.
import { clamp } from './util.js';
export const HULL = 1.4;
export const LANE = {
  marsh:  { lotus: 3.0, camMax: 3.3, pitchMax: 38 },
  ruins:  { lotus: 3.4, camMax: 4.0, pitchMax: 40 },
  grotto: { lotus: 2.8, camMax: 2.5, pitchMax: 24 },
  gorge:  { lotus: 3.4, camMax: 5.2, pitchMax: 40 },
  finale: { lotus: 2.5, camMax: 6.0, pitchMax: 30 },
};
// marsh keeps the film's 2.5 m around the hook (shot 1's water-level camera stands 3.6 m off the line at s ~ 19-22), widens after it
export function lotusSide(world, s) {
  const L = LANE[world] || LANE.finale;
  if (world === 'marsh') return 2.5 + (L.lotus - 2.5) * clamp((s - 26) / 6);
  return L.lotus;
}
export const clampLat = (world, s) => world === 'finale' ? 0 : Math.max(0, lotusSide(world, s) - HULL);
