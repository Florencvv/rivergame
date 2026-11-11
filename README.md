# The Waking River (playable)

The film 41 river ride as a small web game: the river carries you at the film's pace (the score drives the clock), you steer the leaf boat
across the river and gather the light motes. Every wake-up effect, veil and the finale land exactly as in the film.

## Run locally
```
cd game
python -m http.server 8742 --bind 127.0.0.1
```
Open http://127.0.0.1:8742/ (a plain static server; opening index.html from disk does not work because of ES modules and fetch).

## Controls
- A / D or Left / Right arrows: steer (touch: drag sideways with one finger)
- Mouse drag: look around the boat (touch: two fingers); it eases back when released
- C: film camera (the film's own shots) / chase camera
- Esc or P: pause (score and river together)

The hook (0-3.15 s) and the finale (from 33.5 s) always play in the film's cameras with no steering.

## Size
About 55 MB: `assets/` 51 MB of GLB (Tripo web copies) + the 1 MB score (`score.m4a`, AAC 192k), `vendor/` three.js r160 1.4 MB, `fonts/` 1.2 MB.

## Files
- `index.html` screens (loading, title, HUD, pause, end) + import map
- `src/main.js` game loop: preload with progress, audio clock, steering, chase camera, quality step-down, `window.GAME` QA handles
- `src/lane.js` safe lane per world (lotus road spacing, steering clamp, chase-camera limits)
- `src/motes.js` the light motes, the gold burst and the chime
- the rest of `src/` = copies of the film engine (`_work/41/ride/src`), edited for live play (lateral offset in `path.js`, resizable `post.js` / `look.js`)
- `vercel.json` static hosting headers (long cache for `assets/`); `.vercelignore` drops `qa/`

## Speed
1x resolution with devicePixelRatio capped at 1.5, no motion blur or DOF. If a frame takes more than 20 ms on average the game steps down
(render scale, MSAA, reflection resolution, particle count). `?q=0..3` pins a quality level.
