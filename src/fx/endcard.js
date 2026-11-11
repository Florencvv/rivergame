// Stage E4 end card: "Made with Claude Fable 5.2", Cormorant Garamond 500, 82 px at 1080p, letter-spacing .04 em, lining numerals.
// A clip-space quad drawn last in the scene (texel = pixel at 2x, so the type stays crisp through the Lanczos downsample; no AA jitter, no DOF, no mirror).
// Texture channels: R = glyphs, G = tight glow (6 px), B = wide glow (40 px). Per letter: fade + 6 px rise, 25 ms stagger, a light-seed settles into each glyph.
import * as THREE from 'three';
import { s5 } from '../util.js';
export const TEXT = 'Made with Claude Fable 5.2';
export const CX = 570 / 1920, CY = 367 / 1080;            // P1: card centre (x 29.7%, y 34% from the top: centred in the open sky left of the crown with shot 18's 18 mm frame), whole pixels
const W = 2560, H = 640, PX = 164, LS = .04 * PX, T_IN = .26, STAG = .025;
let M = null, U = null;
export const fontReady = (async () => { try { const f = new FontFace('Cormorant Garamond', 'url(fonts/CormorantGaramond-VF.ttf)', { weight: '300 700', featureSettings: '"lnum" 1, "kern" 1' }); await f.load(); document.fonts.add(f); return true; } catch (e) { console.warn('end card font', e); return false; } })();

function layer(blur, x0, yb, font) { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d', { willReadFrequently: true });
  c.font = font; c.letterSpacing = LS + 'px'; c.fontKerning = 'normal'; c.textBaseline = 'alphabetic'; c.fillStyle = '#fff'; if (blur) c.filter = `blur(${blur}px)`; c.fillText(TEXT, x0, yb); return c.getImageData(0, 0, W, H).data; }

export function build(ctx, g) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4;
  const uB = new Float32Array(27), uO = new Float32Array(26), uGl = new Float32Array(26);
  U = { tC: { value: tex }, uT: { value: 0 }, uUWk: ctx.look.U.uUWk, uB: { value: uB }, uO: { value: uO }, uGl: { value: uGl }, uIn: { value: new THREE.Vector4(ctx.TL.endCard[0], T_IN, 0, 0) },
    cText: { value: new THREE.Color('#fff6e0') }, cG1: { value: new THREE.Color('#ffe6a6') }, cG2: { value: new THREE.Color('#ffc870') }, cScrim: { value: new THREE.Color('#1b2452') },
    uK: { value: new THREE.Vector4(.88, .6, .5, .42) }, uRect: { value: new THREE.Vector4(2 * CX - 1, 1 - 2 * CY, W / 3840, H / 2160) } };
  {                                                        // the world awaits fontReady before calling build()
    const font = `500 ${PX}px "Cormorant Garamond", "Cormorant", Georgia, serif`; c.font = font; c.letterSpacing = LS + 'px'; c.fontKerning = 'normal';
    const m = c.measureText(TEXT), tw = m.width - LS, x0 = Math.round((W - tw) / 2), yb = Math.round(H / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 - .04 * PX);
    let n = 0; for (let i = 0; i <= 26; i++) uB[i] = (x0 + c.measureText(TEXT.slice(0, i)).width - LS / 2) / W;
    for (let i = 0; i < 26; i++) { const sp = TEXT[i] === ' '; uGl[i] = sp ? 0 : 1; uO[i] = STAG * (sp ? Math.max(0, n - 1) : n++); }
    const a = layer(0, x0, yb, font), b = layer(6, x0, yb, font), d = layer(40, x0, yb, font), im = c.createImageData(W, H), o = im.data;
    for (let i = 0; i < W * H; i++) { o[i * 4] = a[i * 4 + 3]; o[i * 4 + 1] = b[i * 4 + 3]; o[i * 4 + 2] = Math.min(255, d[i * 4 + 3] * 2.2); o[i * 4 + 3] = 255; }
    c.putImageData(im, 0, 0); tex.needsUpdate = true; window.CARD_INFO = { font: document.fonts.check(font), width1080: +(tw / 2).toFixed(1), x0, yb, last: +(ctx.TL.endCard[0] + uO[25] + T_IN).toFixed(3) };
  }
  const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthTest: false, depthWrite: false, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `uniform vec4 uRect; varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(uRect.xy + position.xy * 2. * uRect.zw, 0., 1.); }`,
    fragmentShader: `uniform sampler2D tC; uniform float uT, uB[27], uO[26], uGl[26]; uniform vec4 uUWk, uIn, uK; uniform vec3 cText, cG1, cG2, cScrim; varying vec2 vUv;
      void main(){ if (uUWk.w > .5) discard; const vec2 SZ = vec2(${W}., ${H}.); float e = 5. / SZ.x, tr = 0., sg = 0., lt = uT - uIn.x;
        for (int i = 0; i < 26; i++) { float w = smoothstep(uB[i] - e, uB[i] + e, vUv.x) - smoothstep(uB[i + 1] - e, uB[i + 1] + e, vUv.x); tr += w * uO[i];
          float xi = (lt - uO[i] + .1) / (uIn.y + .06); if (uGl[i] > .5 && xi > 0. && xi < 1.) { float f = 1. - xi; vec2 pc = vec2(.5 * (uB[i] + uB[i + 1]), .5) + vec2(26., 78.) / SZ * f * f;
            vec2 dd = (vUv - pc) * SZ; float rr = 9. + 13. * f; sg += exp(-dot(dd, dd) / (rr * rr)) * sin(3.14159 * pow(xi, .7)) ; } }
        tr += (1. - smoothstep(uB[0] - e, uB[0] + e, vUv.x)) * uO[0] + smoothstep(uB[26] - e, uB[26] + e, vUv.x) * uO[25];
        float x = clamp((lt - tr) / uIn.y, 0., 1.), a = 1. - pow(1. - x, 3.);
        vec3 t3 = texture2D(tC, vUv + vec2(0., (1. - a) * 12. / SZ.y)).rgb; float aT = t3.r * a, g1 = t3.g * a, g2 = t3.b * a;
        vec2 q = (vUv - .5) / vec2(.48, .46); float sIn = clamp((lt + .15) / .6, 0., 1.), sm = (1. - smoothstep(.2, 1., length(q))) * uK.w * sIn * sIn * (3. - 2. * sIn);
        vec3 col = cText * uK.x * aT + (cG1 * uK.y * g1 + cG2 * uK.z * g2) * (1. - .85 * aT) + cG1 * 1.5 * sg + cScrim * sm * (1. - aT);
        gl_FragColor = vec4(col, 1. - (1. - aT) * (1. - sm)); }` });
  M = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); M.frustumCulled = false; M.renderOrder = 60; M.name = 'endCard'; M.visible = false; g.add(M);
  return M;
}
export function update(ctx, t) { if (!M) return; U.uT.value = t;
  { const asp = ctx.RW / ctx.RH, k = W / H; let hw = W / 3840, hh = H / 2160; if (asp < 16 / 9) hh = hw * asp / k; else hw = hh * k / asp; U.uRect.value.z = hw; U.uRect.value.w = hh; }   // GAME: keep the aspect at any window shape
  M.visible = t > ctx.TL.endCard[0] - .2; }
