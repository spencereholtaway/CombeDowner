// How open water looks: the river, the canal and its locks, ponds, lakes and pools. The surface is
// still one flat sheet of triangles, but each spot on it is drawn rippling in the light: a few
// wind ripples crossing it, and a broken chop carried along with the current, downstream on a river
// (the way its middle line runs in the map) and drifting slowly on still water. Looked at from a
// low angle it mirrors the sky, the same colours and time of day as the sky itself, with the sun
// (or by night the moon) glinting off the ripples; looked straight down into it, it's dark and
// green in the middle. Where it meets the land it laps in a broken white line, and the ground, the
// banks' and locks' stone and bridges' piers are dark and wet just above it (ShoreMap, wetBy). Below
// a weir the water churns white. It's drawn in squares as coarse as the world's own textures.
// Every water mesh shares the one look, so it costs no more draws than flat water did, and the
// Low scenery detail (view.ts) leaves out the finest chop.
//
// Nothing here goes over the network: the water moves on each player's own clock, and the ripples
// are the same pattern for everyone.
import * as THREE from "three";
import { detailLevel } from "./view";
import type { Sky } from "./daylight";

/** How much of the sky the water mirrors at a grazing angle, 0 to 1. */
export const REFLECT = 0.85;
/** The most weirs near you whose white water is drawn at once. */
const WEIRS = 8;
/** How far round you weirs are looked for, metres. */
const WEIR_NEAR = 450;
/** How fast a river's current carries its ripples (m/s), and the canal's barely moving water. */
export const RIVER_FLOW = 0.45, CANAL_FLOW = 0.06;

const U = {
  wTime: { value: 0 },
  wFine: { value: 1 },
  wReflect: { value: REFLECT },
  wSkyTop: { value: new THREE.Color("#6f9fd0") },
  wSkyLow: { value: new THREE.Color("#c9d6df") },
  wLightDir: { value: new THREE.Vector3(0, 1, 0) },
  wLightCol: { value: new THREE.Color() },
  wBank: { value: new THREE.Color() },
  wDeep: { value: new THREE.Color("#2c4a3a") },
  wShallow: { value: new THREE.Color("#6b6547") },
  /** Each weir's crest (data x, y from one end to the other, the lower water on its right). */
  wWeir: { value: Array.from({ length: WEIRS }, () => new THREE.Vector4()) },
  /** How far its white water reaches downstream, metres (0: no weir). */
  wWeirRun: { value: new Array(WEIRS).fill(0) },
  wWeirs: { value: 0 },
};

// ---- the shore: where the water meets everything else -------------------------------------------
// One picture of the ground round you, seen from above, a dot a metre: how high the water stands at
// each dot (on the land beside it too, the level of the water it's beside), how near the water each
// dot of land is, and how near the land each dot of water is. The water reads it for its shallows
// and the white line where it laps at the bank; the ground, the banks' and locks' stonework and
// bridges' piers read it for the dark, wet band just above the water. One picture for all of them,
// painted afresh over a few frames as you move or squares load, so it costs no more however much water there is.
const SHORE = 256, SHORE_STEP = 1, SHORE_LEVEL = 0.1;
function shorePicture() {
  const t = new THREE.DataTexture(new Uint8Array(SHORE * SHORE * 4), SHORE, SHORE, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
const SU = {
  shoreMap: { value: shorePicture() },
  /** The picture's corner (scene x, z), one over its width in metres, and 1 once it's painted. */
  shoreBox: { value: new THREE.Vector4(0, 0, 1, 0) },
  /** The level the picture's lowest step stands for (scene y), and metres a step. */
  shoreBase: { value: new THREE.Vector2(0, SHORE_LEVEL) },
};
const SHORE_DECL = `uniform sampler2D shoreMap; uniform vec4 shoreBox; uniform vec2 shoreBase;
float shHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// the water's level here (scene y), how near the water it is on land (b) and how near land it is on water (a)
vec4 shoreAt(vec3 p) {
  vec2 uv = (p.xz - shoreBox.xy) * shoreBox.z;
  if (shoreBox.w < 0.5 || uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  vec4 t = texture2D(shoreMap, uv);
  return vec4(shoreBase.x + t.r * 255.0 * shoreBase.y, 0.0, t.b, t.a);
}`;

/**
 * The shore picture, for one world. level(x, z): the water's level at scene (x, z) (scene y), or
 * null where there's none.
 */
export class ShoreMap {
  private job: Generator<void> | null = null;
  private cx = NaN; private cz = NaN; private since = 0; private sig = "";
  /** squares(): something that changes when the squares of Bath loaded do. */
  constructor(private level: (x: number, z: number) => number | null, private squares: () => string) {}

  /** Each frame, with where you are. */
  update(px: number, pz: number, dt: number) {
    this.since += dt;
    // (afresh as you move off, and now and then for squares built since and the locks' water)
    const sig = this.squares();
    if (!this.job && (Math.hypot(px - this.cx, pz - this.cz) > SHORE * SHORE_STEP / 6 || this.since > 8 || sig !== this.sig)) {
      this.since = 0; this.sig = sig;
      this.cx = Math.round(px / SHORE_STEP) * SHORE_STEP; this.cz = Math.round(pz / SHORE_STEP) * SHORE_STEP;
      this.job = this.paint(this.cx - SHORE * SHORE_STEP / 2, this.cz - SHORE * SHORE_STEP / 2);
    }
    if (this.job && this.job.next().done) this.job = null;
  }

  private *paint(x0: number, z0: number): Generator<void> {
    const N = SHORE, lv = new Float32Array(N * N).fill(NaN);
    let low = Infinity;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const l = this.level(x0 + (i + 0.5) * SHORE_STEP, z0 + (j + 0.5) * SHORE_STEP);
        if (l !== null) { lv[j * N + i] = l; if (l < low) low = l; }
      }
      if (j % 32 === 31) yield;
    }
    // how far each dot is from the other side of the shore, in dots (up to REACH), and on land
    // the level of the nearest water
    const REACH = 4, toWater = new Uint8Array(N * N).fill(REACH + 1), toLand = new Uint8Array(N * N).fill(REACH + 1), near = new Float32Array(lv);
    for (let k = 0; k < N * N; k++) (Number.isNaN(lv[k]) ? toLand : toWater)[k] = 0;
    for (let pass = 1; pass <= REACH; pass++) {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i;
        for (const [d, o] of [[toWater, 1], [toLand, 0]] as const) {
          if (d[k] <= pass) continue;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
            if (d[jj * N + ii] === pass - 1) { d[k] = pass; if (o && Number.isNaN(near[k])) near[k] = near[jj * N + ii]; }
          }
        }
      }
      yield;
    }
    const tex = SU.shoreMap.value, out = tex.image.data as Uint8Array, base = Number.isFinite(low) ? low - 0.5 : 0;
    const LAND = [255, 200, 120, 50, 0], WATER = [255, 170, 90, 30, 0];
    for (let k = 0; k < N * N; k++) {
      const l = near[k];
      out[k * 4] = Number.isNaN(l) ? 0 : Math.max(1, Math.min(255, Math.round((l - base) / SHORE_LEVEL)));
      out[k * 4 + 1] = 0;
      out[k * 4 + 2] = Number.isNaN(l) ? 0 : LAND[Math.min(toWater[k], REACH)];
      out[k * 4 + 3] = Number.isNaN(lv[k]) ? 255 : WATER[Math.min(toLand[k], REACH)];
    }
    tex.needsUpdate = true;
    SU.shoreBox.value.set(x0, z0, 1 / (N * SHORE_STEP), 1);
    SU.shoreBase.value.set(base, SHORE_LEVEL);
  }
}

// On anything standing at the water's edge: a dark, wet band from the water up, its top ragged in
// the world's own coarse squares, and right at the waterline a green-black stain
const WET_FRAG = `{
    vec4 ws = shoreAt(vWetAt);
    if (ws.b > 0.02) {
      vec3 wq = floor(vWetAt * 8.0);
      float jit = shHash(wq.xz + wq.y * 7.13);
      float h = vWetAt.y - ws.r;
      float wet = step(h, (0.2 + 0.4 * jit) * ws.b) * step(-3.0, h);
      diffuseColor.rgb *= 1.0 - 0.5 * wet;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.08, 0.05), step(abs(h - 0.04), 0.05 + 0.05 * jit) * step(0.6, ws.b) * 0.55);
    }
  }`;
const WET_VERT = `vec4 wetAt = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  wetAt = instanceMatrix * wetAt;
#endif
  vWetAt = (modelMatrix * wetAt).xyz;`;
const wetDone = new WeakSet<THREE.Material>();
/** Give a copy of a material (three.js's clone leaves the wet band behind) the band too, if it had it. */
export const wetLike = <M extends THREE.Material>(from: THREE.Material, to: M): M => wetDone.has(from) ? wetBy(to) : to;
/** Let material m (a Lambert one: ground, stonework) darken where it's wet at the water's edge. */
export function wetBy<M extends THREE.Material>(m: M): M {
  if (wetDone.has(m) || !(m as unknown as THREE.MeshLambertMaterial).isMeshLambertMaterial) return m;
  wetDone.add(m);
  const was = m.onBeforeCompile, ownKey = m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? m.customProgramCacheKey : null;
  m.onBeforeCompile = function (this: THREE.Material, sh, r) {
    was.call(this, sh, r);
    Object.assign(sh.uniforms, SU);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWetAt;")
      .replace("#include <project_vertex>", `#include <project_vertex>\n  ${WET_VERT}`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vWetAt;\n${SHORE_DECL}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n  ${WET_FRAG}`);
  };
  m.customProgramCacheKey = function (this: THREE.Material) { return (ownKey ? ownKey.call(this) : was.toString()) + "|wet"; };
  return m;
}

const VERT_DECL = `attribute vec3 waterC; attribute vec2 waterF;
varying vec3 vWPos; varying vec3 vWC; varying vec2 vWF;`;
const VERT = `vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vWC = vec3((modelMatrix * vec4(waterC.x, transformed.y, waterC.y, 1.0)).xz, waterC.z);
  vWF = (mat3(modelMatrix) * vec3(waterF.x, 0.0, waterF.y)).xz;`;

const FRAG_DECL = `varying vec3 vWPos; varying vec3 vWC; varying vec2 vWF;
uniform float wTime, wFine, wReflect; uniform int wWeirs;
uniform vec3 wSkyTop, wSkyLow, wBank, wLightDir, wLightCol, wDeep, wShallow;
uniform vec4 wWeir[${WEIRS}]; uniform float wWeirRun[${WEIRS}];
${SHORE_DECL}
// (a hash without sin: sin loses its precision on some phones' graphics chips at the map's distances)
float wHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// value noise and its slope
vec3 wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = wHash(i), b = wHash(i + vec2(1.0, 0.0)), c = wHash(i + vec2(0.0, 1.0)), d = wHash(i + vec2(1.0, 1.0));
  float k = a - b - c + d;
  return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * (vec2(b - a, c - a) + k * u.yx));
}
// the chop at p, carried off by flow: two copies half a cycle apart, each fading out before it
// starts again, so the pattern never stretches out where the current bends
vec2 wChop(vec2 p, vec2 flow) {
  float c1 = fract(wTime / 6.0), c2 = fract(wTime / 6.0 + 0.5), w1 = 1.0 - abs(2.0 * c1 - 1.0);
  vec2 o1 = flow * (c1 * 6.0) + vec2(17.3, 5.1) * floor(wTime / 6.0), o2 = flow * (c2 * 6.0) + vec2(3.7, 11.9) * floor(wTime / 6.0 + 0.5);
  vec2 g = (wNoise((p - o1) * 0.55).yz * 0.55) * w1 + (wNoise((p - o2) * 0.55 + 7.0).yz * 0.55) * (1.0 - w1);
  if (wFine > 0.5) g += (wNoise((p - o1) * 1.9 + 3.0).yz * w1 + wNoise((p - o2) * 1.9 + 9.0).yz * (1.0 - w1)) * 0.5;
  return g;
}`;

// After the normal's worked out: the ripples tilt it, and the water's own colour (deep, shallow or
// white) goes in before it's lit
const FRAG_SURFACE = `vec3 wV = cameraPosition - vWPos; float wDist = length(wV); wV /= wDist;
  float wAbove = step(vWPos.y, cameraPosition.y);
  // (sampled in squares of an eighth of a metre, as coarse as the world's own textures, so the
  // water's chunky like everything round it)
  vec2 wp = (floor(vWPos.xz * 8.0) + 0.5) / 8.0;
  vec4 wShore = shoreAt(vec3(wp.x, vWPos.y, wp.y));
  // wind ripples, crossing at three angles
  vec2 wG = vec2(0.0);
  vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.45, 0.89), d3 = vec2(0.97, -0.24);
  wG += d1 * cos(dot(d1, wp) * 2.1 - wTime * 2.3) * 0.02;
  wG += d2 * cos(dot(d2, wp) * 3.3 - wTime * 2.9) * 0.014;
  if (wFine > 0.5) wG += d3 * cos(dot(d3, wp) * 5.7 - wTime * 3.8) * 0.008;
  vec2 wFlow = vWF + vec2(0.04, 0.025);
  // (rippled less far off, where the ripples are smaller than a pixel and would only sparkle)
  float wNear = 1.0 / (1.0 + wDist / 70.0);
  // white water below a weir: churned up where it lands, breaking up as it's carried off
  float wFoam = 0.0;
  vec2 wd = vec2(wp.x, -wp.y);
  for (int i = 0; i < ${WEIRS}; i++) {
    if (i >= wWeirs) break;
    vec2 a = wWeir[i].xy, ab = wWeir[i].zw - a;
    float l = max(length(ab), 0.01); vec2 t = ab / l, r = vec2(t.y, -t.x);
    float s = dot(wd - a, t), dn = dot(wd - a, r), run = wWeirRun[i];
    float side = smoothstep(-2.0, 0.5, s) * smoothstep(-2.0, 0.5, l - s);
    float f = side * step(-0.3, dn) * (1.0 - smoothstep(0.0, run, dn));
    if (f > 0.0) {
      float n = wNoise(vec2(s * 0.7, dn * 0.5 - wTime * 1.1)).x * 0.6 + wNoise(vec2(s * 2.1, dn * 1.4 - wTime * 2.2)).x * 0.4;
      // solid white from the crest, its far edge ragged, then broken lumps carried off downstream
      float band = step(dn + n * 2.0, run * 0.3) * step(n * 0.6 - 0.3, dn);
      wFoam = max(wFoam, f * max(band, step(0.62, n + f * 0.2)) * mix(0.8, 1.0, n));
      wFlow += r * f * 1.2;
    }
  }
  wG += wChop(wp, wFlow) * (0.18 + wFoam * 0.6);
  wG *= mix(0.15, 1.0, wNear);
  vec3 wN = normalize(vec3(-wG.x, 1.0, -wG.y));
  if (wAbove > 0.5) normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
  // deepest in the middle of a river or the canal; over the shallows at the very edge the bed
  // shows through, and the water laps at the bank in a broken white line
  float wEdge = clamp(distance(wp, vWC.xy) / max(vWC.z, 0.5), 0.0, 1.0);
  diffuseColor.rgb = wDeep * mix(0.8, 1.0, smoothstep(0.3, 0.9, wEdge));
  float wSh = wShore.a;
  diffuseColor.rgb = mix(diffuseColor.rgb, wShallow, step(0.5, wSh + wHash(floor(wp * 2.0)) * 0.15) * 0.3);
  float wLap = wNoise(wp * 2.5 + vec2(wTime * 0.3, 0.0)).x + 0.2 * sin(wTime * 1.4 - wSh * 9.0);
  // (a thin line at most: only where the land is right by, and fading out far off where it'd be a white rim)
  wFoam = max(wFoam, step(0.9, wSh + 0.08 * wLap) * step(0.5, wLap) * 0.6 * (1.0 - smoothstep(60.0, 160.0, wDist)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.88, 0.88), wFoam);`;

// Before fog: the sky mirrored at a low angle (Fresnel), and the light glinting off the ripples
const FRAG_SKY = `// (white water shows white even in shade: it's lit by the whole sky)
  outgoingLight = mix(outgoingLight, max(outgoingLight, wSkyLow * 0.7), wFoam);
  if (wAbove > 0.5) {
    vec3 wR = reflect(-wV, wN); wR.y = abs(wR.y);
    float wH = clamp(wR.y * 2.2, 0.0, 1.0);
    // (as the sky shader has it, with a little more of the horizon's colour: its clouds and the glow round a low sun)
    vec3 wSky = mix(wSkyLow, wSkyTop * wSkyTop, pow(wH, 0.7) * 0.8);
    // (low down it's the far bank that's mirrored, trees and walls, not the sky: darker, into the haze far off)
    wSky = mix(mix(wBank, wSkyLow, smoothstep(150.0, 600.0, wDist)), wSky, smoothstep(0.03, 0.3, wR.y));
    float wF = 0.02 + 0.98 * pow(1.0 - max(dot(wN, wV), 0.0), 5.0);
    float wMirror = mix(0.08, 1.0, wF) * wReflect * (1.0 - wFoam);
    outgoingLight = mix(outgoingLight, wSky, wMirror);
    // the glints off the smallest ripples, so near by they sparkle rather than shine in a patch
    vec3 wS = wR;
    if (wFine > 0.5) wS = reflect(-wV, normalize(wN + vec3(wNoise(wp * 4.3 + vec2(0.7, -0.5) * wTime).yz * 0.06 * wNear, 0.0).xzy));
    float wSharp = mix(80.0, 1400.0, wNear);
    outgoingLight += wLightCol * pow(max(dot(wS, wLightDir), 0.0), wSharp) * (wSharp / 400.0) * (1.0 - wFoam);
  }`;

const done = new WeakSet<THREE.Material>();
/** Give material m (a Lambert one, on water meshes made with waterCorners) the water's look. */
export function waterLook<M extends THREE.Material>(m: M): M {
  if (done.has(m)) return m;
  done.add(m);
  const was = m.onBeforeCompile;
  m.onBeforeCompile = function (this: THREE.Material, sh, r) {
    was.call(this, sh, r);
    Object.assign(sh.uniforms, U, SU);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\n${VERT_DECL}`)
      .replace("#include <project_vertex>", `#include <project_vertex>\n  ${VERT}`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\n${FRAG_DECL}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n  ${FRAG_SURFACE}`)
      .replace("#include <opaque_fragment>", `${FRAG_SKY}\n  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => "water";
  return m;
}

/** Each frame: the light now (daylight.ts), the fog's colour (the sky at the horizon) and how much
 *  a tunnel's darkened everything. */
export function waterSky(sk: Sky, low: THREE.Color, dark: number) {
  U.wTime.value = (performance.now() / 1000) % 4096;
  U.wFine.value = detailLevel > 0 ? 1 : 0;
  U.wSkyTop.value.copy(sk.top).multiplyScalar(1 - dark);
  U.wSkyLow.value.copy(low);
  U.wBank.value.copy(sk.hemiGround).multiplyScalar(sk.hemiI * 0.3 * (1 - dark));
  U.wLightDir.value.copy(sk.light).normalize();
  // (the light's below the horizon for a while at dusk and dawn: no glint off a sun that's set)
  U.wLightCol.value.copy(sk.lightCol).multiplyScalar(sk.lightI * (1 - dark) * THREE.MathUtils.smoothstep(sk.light.y, -0.02, 0.06));
}

/** The weirs near you, from the map's weir crests (each [data x, y, the upper water's level] along
 *  it, and b the lower water's level). */
export function waterWeirs(falls: { p: number[][]; b: number }[], x: number, y: number) {
  const segs: { d: number; a: number[]; b: number[]; run: number }[] = [];
  for (const f of falls) for (let i = 0; i + 1 < f.p.length; i++) {
    const a = f.p[i], b = f.p[i + 1], drop = Math.max(a[2], b[2]) - f.b;
    if (drop < 0.2) continue;
    const d = Math.hypot((a[0] + b[0]) / 2 - x, (a[1] + b[1]) / 2 - y);
    if (d < WEIR_NEAR) segs.push({ d, a, b, run: Math.min(12, 4 + drop * 2.5) });
  }
  segs.sort((p, q) => p.d - q.d);
  const n = Math.min(WEIRS, segs.length);
  for (let i = 0; i < n; i++) {
    U.wWeir.value[i].set(segs[i].a[0], segs[i].a[1], segs[i].b[0], segs[i].b[1]);
    U.wWeirRun.value[i] = segs[i].run;
  }
  U.wWeirs.value = n;
}

/** Nearest point to (x, y) on polyline p (data x, y), the way it runs there (unit), and how far off it is. */
function nearestOn(p: number[][], x: number, y: number) {
  let best = Infinity, bx = 0, by = 0, tx = 1, ty = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const ax = p[i][0], ay = p[i][1], dx = p[i + 1][0] - ax, dy = p[i + 1][1] - ay, ll = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / ll));
    const qx = ax + dx * t, qy = ay + dy * t, d = (x - qx) ** 2 + (y - qy) ** 2;
    if (d < best) { best = d; bx = qx; by = qy; const l = Math.sqrt(ll); tx = dx / l; ty = dy / l; }
  }
  return { x: bx, y: by, tx, ty, d: Math.sqrt(best) };
}

/**
 * What the water's look needs at each corner of water geometry g (its positions in the mesh's own
 * frame, X east, Y up, Z south): the nearest point on the middle line of the river or canal it's
 * part of, how far off that is (half the water's width there, give or take), and the current. The
 * shader works out from those how far any spot is from the middle, so it can be paler near the
 * banks. lines: middle lines (x, y with y = -Z), flowing from first point to last at speed m/s.
 * Water with none of them running through it is still water, measured across from its own middle line.
 */
export function waterCorners(g: THREE.BufferGeometry, lines: number[][][], speed: number) {
  const pos = g.getAttribute("position"), n = pos.count;
  const c = new Float32Array(n * 3), f = new Float32Array(n * 2);
  // still water's own middle line: along its length, stopping half its width short of each end,
  // so a long pond is measured across like a river and a round one from its middle
  let mx = 0, my = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { mx += pos.getX(i); my -= pos.getZ(i); }
  mx /= n || 1; my /= n || 1;
  for (let i = 0; i < n; i++) { const dx = pos.getX(i) - mx, dy = -pos.getZ(i) - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const dx = pos.getX(i) - mx, dy = -pos.getZ(i) - my, u = dx * ux + dy * uy, v = -dx * uy + dy * ux;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2, half = Math.max(0, (u1 - u0) / 2 - (v1 - v0) / 2);
  const ox = mx + um * ux - vm * uy, oy = my + um * uy + vm * ux;
  const own = [[ox - ux * half, oy - uy * half], [ox + ux * half + 1e-3, oy + uy * half]];
  // only the lines that run through this water (a river beside a pond isn't the pond's middle)
  const idx = g.getIndex(), tris = idx ? idx.count / 3 : n / 3, at = (k: number) => idx ? idx.getX(k) : k;
  const inside = (x: number, y: number) => {
    for (let t = 0; t < tris; t++) {
      const a = at(t * 3), b = at(t * 3 + 1), c = at(t * 3 + 2);
      const ax = pos.getX(a), ay = -pos.getZ(a), bx = pos.getX(b), by = -pos.getZ(b), cx = pos.getX(c), cy = -pos.getZ(c);
      const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by), d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy), d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
    }
    return false;
  };
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const near = lines.filter((p) => p.some((q) => q[0] >= bb.min.x && q[0] <= bb.max.x && -q[1] >= bb.min.z && -q[1] <= bb.max.z) && p.some((q, i) => inside(q[0], q[1]) || (i > 0 && inside((q[0] + p[i - 1][0]) / 2, (q[1] + p[i - 1][1]) / 2))));
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = -pos.getZ(i);
    let best: ReturnType<typeof nearestOn> | null = null;
    for (const p of near) { const q = nearestOn(p, x, y); if (!best || q.d < best.d) best = q; }
    if (best) {
      c.set([best.x, -best.y, best.d], i * 3);
      f.set([best.tx * speed, -best.ty * speed], i * 2);
    } else { const q = nearestOn(own, x, y); c.set([q.x, -q.y, q.d], i * 3); }
  }
  g.setAttribute("waterC", new THREE.BufferAttribute(c, 3));
  g.setAttribute("waterF", new THREE.BufferAttribute(f, 2));
  return g;
}
