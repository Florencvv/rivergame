// POST PIPELINE (films 16-40, verbatim from _work/40/post_pipeline.js): accumulation target (subframe MB + DOF), bloom, tone, 2x Lanczos.
// film 41 additions: grade tint (matTone.tint) and the realm VEIL (POST.veil 0..1 dissolves the whole frame to POST.veilC, Kevin's idea).
// stage C grade (set by look.js): matTone.{sat, con, hal (warm halation of the bloom), knee (shoulder start), blk (lifted-black colour)}, matLV.grain.
import * as THREE from 'three';
export function makePost(renderer, RW, RH, W1, W2, FLOATBLEND) {
const FT = FLOATBLEND ? THREE.FloatType : THREE.HalfFloatType;
const rtOpt = (type) => ({ type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
const rtScene = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 });
const rtAcc = new THREE.WebGLRenderTarget(2, 2, rtOpt(FT));   // GAME: unused (single sample)
const rtLdr = new THREE.WebGLRenderTarget(RW, RH, rtOpt(THREE.HalfFloatType));
const rtH = new THREE.WebGLRenderTarget(2, 2, rtOpt(THREE.HalfFloatType));   // GAME: unused (no Lanczos)
const bloomRT = []; { let w = RW >> 1, h = RH >> 1; for (let i = 0; i < 6; i++) { bloomRT.push(new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), rtOpt(THREE.HalfFloatType))); w >>= 1; h >>= 1; } }
const bloomUp = bloomRT.map(r => new THREE.WebGLRenderTarget(r.width, r.height, rtOpt(THREE.HalfFloatType)));
const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); const qScene = new THREE.Scene(); const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); qScene.add(quad);
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }`;
const sh = (fs, uni, blend) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: uni, depthTest: false, depthWrite: false, blending: blend || THREE.NoBlending, transparent: !!blend });
const matAdd = sh(`uniform sampler2D tex; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tex, vUv); }`, { tex: { value: null } }, THREE.AdditiveBlending);
matAdd.blending = THREE.CustomBlending; matAdd.blendEquation = THREE.AddEquation; matAdd.blendSrc = THREE.OneFactor; matAdd.blendDst = THREE.OneFactor;
const matBright = sh(`uniform sampler2D tex; uniform float k, th; varying vec2 vUv; uniform vec2 px;
  void main(){ vec3 c = vec3(0.); for(int i=0;i<4;i++){ vec2 o = vec2(i==1||i==3?1.:-1., i>1?1.:-1.)*px*0.5; c += texture2D(tex, vUv+o).rgb; } c *= 0.25*k;
  float l = max(c.r, max(c.g, c.b)); float w = smoothstep(th, th*1.6, l); gl_FragColor = vec4(min(c*w, vec3(12.)), 1.); }`, { tex: { value: null }, k: { value: 1 }, th: { value: 1.25 }, px: { value: new THREE.Vector2() } });
const matDown = sh(`uniform sampler2D tex; uniform vec2 px; varying vec2 vUv; void main(){ vec3 c = texture2D(tex,vUv+px*vec2(-1,-1)).rgb+texture2D(tex,vUv+px*vec2(1,-1)).rgb+texture2D(tex,vUv+px*vec2(-1,1)).rgb+texture2D(tex,vUv+px*vec2(1,1)).rgb; gl_FragColor = vec4(c*0.25,1.); }`, { tex: { value: null }, px: { value: new THREE.Vector2() } });
const matUp = sh(`uniform sampler2D tex, low; uniform vec2 px; varying vec2 vUv; void main(){ vec3 s = vec3(0.);
  s += texture2D(low, vUv+px*vec2(-1,-1)).rgb + texture2D(low, vUv+px*vec2(1,-1)).rgb + texture2D(low, vUv+px*vec2(-1,1)).rgb + texture2D(low, vUv+px*vec2(1,1)).rgb;
  s += 2.*(texture2D(low, vUv+px*vec2(0,-1)).rgb + texture2D(low, vUv+px*vec2(0,1)).rgb + texture2D(low, vUv+px*vec2(-1,0)).rgb + texture2D(low, vUv+px*vec2(1,0)).rgb) + 4.*texture2D(low, vUv).rgb;
  gl_FragColor = vec4(texture2D(tex, vUv).rgb + .36*s/16., 1.); }`, { tex: { value: null }, low: { value: null }, px: { value: new THREE.Vector2() } });
const matTone = sh(`uniform sampler2D tex, bloom; uniform float k, exposure, bloomK, vig, lift, veil, sat, con, hal, knee; uniform vec3 tint, veilC, blk; varying vec2 vUv;
  vec3 neutral(vec3 color){ float startCompression = knee; const float desaturation = 0.15;
    float peak = max(color.r, max(color.g, color.b)); if (peak < startCompression) return color; float d = 1. - startCompression; float newPeak = 1. - d * d / (peak + d - startCompression); color *= newPeak / peak;
    float g = 1. - 1. / (desaturation * (peak - newPeak) + 1.); return mix(color, newPeak * vec3(1, 1, 1), g); }
  void main(){ vec3 bl = texture2D(bloom, vUv).rgb * bloomK * exposure; vec3 c = texture2D(tex, vUv).rgb * k * exposure + bl * (1. + hal * vec3(1.6, .5, .12));
    vec2 q = (vUv - 0.5) * vec2(1.0, 0.62); float v = 1. - vig * smoothstep(0.18, 0.72, length(q)); c *= v;
    c = c * c / max(c + vec3(lift), vec3(1e-5)) * (1. + lift); c *= tint;
    c = pow(max(c, 0.) / .18, vec3(con)) * .18; c = max(mix(vec3(dot(c, vec3(.2126, .7152, .0722))), c, sat), 0.);   // film 41 grade: contrast about mid grey, saturation
    c = neutral(c); c += blk * (1. - c);                                                                             // filmic shoulder (knee), lifted blacks
    gl_FragColor = vec4(mix(c, veilC, veil), 1.); }`, { tex: { value: null }, bloom: { value: null }, k: { value: 1 }, exposure: { value: 1 }, bloomK: { value: 0.09 }, vig: { value: 0.5 }, lift: { value: 0 }, tint: { value: new THREE.Color(1, 1, 1) }, veil: { value: 0 }, veilC: { value: new THREE.Color(1, 1, 1) },
  sat: { value: 1 }, con: { value: 1 }, hal: { value: 0 }, knee: { value: .76 }, blk: { value: new THREE.Color(0, 0, 0) } });
const lanczos = (vertical, final) => sh(`uniform sampler2D tex; uniform vec2 srcSize; uniform float frame, grain; varying vec2 vUv;
  float L3(float x){ x = abs(x); if (x < 1e-5) return 1.; if (x >= 3.) return 0.; float px = 3.14159265*x; return 3.*sin(px)*sin(px/3.)/(px*px); }
  float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
  vec3 toSRGB(vec3 c){ c = max(c, 0.); return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - 0.055, step(0.0031308, c)); }
  void main(){ vec2 o = gl_FragCoord.xy - 0.5; ${vertical ? 'float cen = (o.y)*2. + 1.;' : 'float cen = (o.x)*2. + 1.;'}
    vec3 s = vec3(0.); float ws = 0.;
    for (int i = -5; i <= 6; i++) { float idx = floor(cen) + float(i) - 1.; float d = (idx + 0.5 - cen) * 0.5; float w = L3(d);
      ${vertical ? 'vec2 uv = vec2(gl_FragCoord.x, idx + 0.5) / srcSize;' : 'vec2 uv = vec2(idx + 0.5, gl_FragCoord.y) / srcSize;'}
      s += texture2D(tex, clamp(uv, 0.5/srcSize, 1.-0.5/srcSize)).rgb * w; ws += w; }
    vec3 c = max(s / ws, 0.);
    ${final ? `vec3 e = toSRGB(c); float n = (hash(gl_FragCoord.xy + frame*17.13) + hash(gl_FragCoord.xy*1.37 + frame*7.7) - 1.0);
      float l = dot(e, vec3(0.299,0.587,0.114)); e += n * grain * (0.35 + 0.65*4.*l*(1.-l));
      e += (hash(gl_FragCoord.xy*0.73 + frame*3.1) - hash(gl_FragCoord.xy*1.91 + frame*5.3)) / 255.;
      gl_FragColor = vec4(clamp(e, 0., 1.), 1.);` : 'gl_FragColor = vec4(c, 1.);'} }`, { tex: { value: null }, srcSize: { value: new THREE.Vector2() }, frame: { value: 0 }, grain: { value: 0.008 } });
const matLH = lanczos(false, false), matLV = lanczos(true, true);
const matCopyOut = sh(`uniform sampler2D tex; varying vec2 vUv; vec3 toSRGB(vec3 c){ c = max(c, 0.); return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - 0.055, step(0.0031308, c)); } void main(){ gl_FragColor = vec4(toSRGB(texture2D(tex,vUv).rgb),1.); }`, { tex: { value: null } });
function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }
const POST = { exposure: 1.0, bloomK: 0.06, veil: 0, veilC: new THREE.Color(1, 1, 1) };
function post(nSamples, frameIdx, src = rtAcc.texture) {   // GAME: src = a single-sample scene texture (no accumulation pass)
  matBright.uniforms.tex.value = src; matBright.uniforms.k.value = 1 / nSamples * POST.exposure; matBright.uniforms.px.value.set(1 / RW, 1 / RH); pass(matBright, bloomRT[0]);
  for (let i = 1; i < bloomRT.length; i++) { matDown.uniforms.tex.value = bloomRT[i - 1].texture; matDown.uniforms.px.value.set(0.5 / bloomRT[i - 1].width, 0.5 / bloomRT[i - 1].height); pass(matDown, bloomRT[i]); }
  let low = bloomRT[bloomRT.length - 1];
  for (let i = bloomRT.length - 2; i >= 0; i--) { matUp.uniforms.tex.value = bloomRT[i].texture; matUp.uniforms.low.value = low.texture; matUp.uniforms.px.value.set(1 / low.width, 1 / low.height); pass(matUp, bloomUp[i]); low = bloomUp[i]; }
  matTone.uniforms.tex.value = src; matTone.uniforms.bloom.value = low.texture; matTone.uniforms.k.value = 1 / nSamples; matTone.uniforms.exposure.value = POST.exposure; matTone.uniforms.bloomK.value = POST.bloomK; matTone.uniforms.veil.value = POST.veil; matTone.uniforms.veilC.value.copy(POST.veilC); pass(matTone, rtLdr);
  if (RW === W2) { matLH.uniforms.tex.value = rtLdr.texture; matLH.uniforms.srcSize.value.set(RW, RH); pass(matLH, rtH); matLV.uniforms.tex.value = rtH.texture; matLV.uniforms.srcSize.value.set(W1, RH); matLV.uniforms.frame.value = frameIdx; pass(matLV, null); }
  else { matCopyOut.uniforms.tex.value = rtLdr.texture; pass(matCopyOut, null); } }

// GAME: resize every target (RW == W1: plain copy out, no Lanczos)
function setSize(w, h) { RW = w; RH = h; rtScene.setSize(w, h); rtLdr.setSize(w, h);
  let bw = w >> 1, bh = h >> 1; for (let i = 0; i < bloomRT.length; i++) { bloomRT[i].setSize(Math.max(2, bw), Math.max(2, bh)); bloomUp[i].setSize(Math.max(2, bw), Math.max(2, bh)); bw >>= 1; bh >>= 1; } }
function setSamples(n) { if (rtScene.samples !== n) { rtScene.samples = n; rtScene.dispose(); } }
return { rtScene, rtAcc, pass, post, POST, matTone, matBright, matAdd, matLV, setSize, setSamples };
}
