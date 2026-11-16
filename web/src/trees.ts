// Trees and garden shrubs. Each crown is a cluster of bumpy lumps covered in cut-out leaves, with
// a darker second layer inside so you can see into the foliage but not straight through it. The
// trunks fork into a few limbs. Crowns sway in the wind. Past a short distance each plant swaps to a
// coarser crown made of the same lumps, further off to a flat picture that always turns to face you,
// Duke Nukem style, drawn at load from the close crown itself as seen from the side you're on, so a
// plant keeps its shape and colour all the way out (?trees=flat in the address draws every plant
// like that, close up too). Each change is stippled across over a few metres rather than swapped,
// and far off the pictures stipple away before the fog. A flat picture would throw the wrong
// shadow, so each one far off has a stand-in for its shadow, out as far as the shadows reach
// (shadows.ts): a plain blob of a crown and its trunk, in a layer only the sun's shadows see, so
// trees cast shadows as far off as you've asked for them. How many are conifers and the tints of
// their leaves belong to the map's ecoregion (region.ts). Nothing here goes over the network:
// everyone grows the same plants from the map.
import * as THREE from "three";
import type { Region } from "./region";
import { TREE_TO } from "./view";
import { SHADOW_ONLY, shadowReach } from "./shadows";
import { show } from "./cull";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as TX from "./textures";
import { pictureRenderer } from "./itempic";

/** ?trees=flat: every tree and shrub a flat picture, however close, to try the Duke Nukem look. */
const FLAT_ALL = typeof location !== "undefined" && new URLSearchParams(location.search).get("trees") === "flat";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

interface Crown { cy: number; rad: number; bottom: number; top: number }

/**
 * One lump of foliage: an icosphere with a bumpy surface, centred at c with radii rad. Normals
 * lean out from the middle of the whole crown so it lights as one soft mass, and vertex colours
 * darken it underneath and deep inside.
 */
function lump(detail: number, c: number[], rad: number[], crown: Crown, shade: number, seed: number, uvScale: number) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  const nor = new Float32Array(pos.count * 3), col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // the bump depends only on the unit-sphere point, so shared corners stay joined
    const bump = 1 + 0.2 * Math.sin(x * 4.1 + seed) * Math.sin(y * 3.7 + seed * 1.3) * Math.sin(z * 4.3 + seed * 0.7);
    const px = c[0] + x * rad[0] * bump, py = c[1] + y * rad[1] * bump, pz = c[2] + z * rad[2] * bump;
    pos.setXYZ(i, px, py, pz);
    const ox = px / crown.rad, oy = (py - crown.cy) / crown.rad, oz = pz / crown.rad;
    const ol = Math.hypot(ox, oy, oz) || 1;
    const nx = x + ox / ol * 1.2, ny = y + oy / ol * 1.2 + 0.25, nz = z + oz / ol * 1.2, nl = Math.hypot(nx, ny, nz) || 1;
    nor.set([nx / nl, ny / nl, nz / nl], i * 3);
    const up = Math.min(1, Math.max(0, (py - crown.bottom) / (crown.top - crown.bottom)));
    const ao = shade * (0.55 + 0.4 * up + 0.2 * Math.min(1, ol));
    col.set([ao, ao, ao], i * 3);
    uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale * 0.6);
  }
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * A broadleaf crown for a unit-sized tree (scaled by the tree's size), around its trunk top.
 * lod 0 is close up and 1 middle distance: the same lumps in the same places, so the tree keeps its
 * shape as it changes, only coarser and without the inner layer. lod 2 is a blob for the shadows of
 * trees too far off to draw in 3D.
 */
function broadleafCrown(lod: number, seed: number) {
  const r = rng(seed);
  const crown: Crown = { cy: 4.9, rad: 2.8, bottom: 2.3, top: 7.7 };
  const parts: { c: number[]; rad: number[] }[] = [{ c: [0, 5.1, 0], rad: [1.8, 1.6, 1.8] }, { c: [0.2, 6.4, -0.1], rad: [1.3, 1.1, 1.3] }];
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.6, d = 1.3 + r() * 0.4, h = 3.9 + r() * 1.9, s = 1.05 + r() * 0.4;
    parts.push({ c: [Math.cos(a) * d, h, Math.sin(a) * d], rad: [s, s * 0.85, s] });
  }
  // a plain icosahedron sits inside its sphere, so the coarse lumps are pushed out to the same size
  const use = lod === 0 ? parts
    : lod === 1 ? parts.map((p) => ({ c: p.c, rad: p.rad.map((v) => v * COARSE) }))
    : [{ c: [0, 5.0, 0], rad: [2.7, 2.5, 2.7] }, { c: [0.2, 6.3, -0.1], rad: [1.8, 1.5, 1.8] }];
  const geos = use.map((p, k) => lump(lod ? 0 : 1, p.c, p.rad, crown, 1, seed + k * 7.3, 5));
  // the inner layer: smaller and darker, so the gaps show more leaves rather than sky
  if (lod === 0) parts.forEach((p, k) => geos.push(lump(0, p.c, p.rad.map((v) => v * 0.72), crown, 0.6, seed + k * 3.1 + 50, 4)));
  return mergeGeometries(geos)!;
}
const COARSE = 1.08;

/** A conifer: tiers of drooping, open cones getting smaller up the tree. lod 1 has the same tiers
 *  with fewer sides and no inner layer; lod 2 is the shadows' stand-in. */
function coniferCrown(lod: number) {
  const geos: THREE.BufferGeometry[] = [];
  const tiers = [6, 6, 3][lod], near = lod === 0;
  for (let k = 0; k < tiers; k++) {
    const f = k / tiers, rad = 2.3 * (1 - f * 0.85), h = (lod < 2 ? 2.4 : 4) * (1 - f * 0.3), y = 1.5 + f * 7.2;
    for (const inner of near ? [false, true] : [false]) {
      const g = new THREE.ConeGeometry(rad * (inner ? 0.6 : 1), h, [10, 8, 6][lod], 1, true).translate(0, y + h / 2, 0).toNonIndexed();
      const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
      const nor = new Float32Array(pos.count * 3), col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), l = Math.hypot(x, z) || 1, top = pos.getY(i) > y + h / 2;
        // the rim droops a little, in and out, so tiers don't look machined
        if (!top) pos.setY(i, pos.getY(i) - 0.25 * Math.abs(Math.sin(Math.atan2(z, x) * 5 + k)));
        const nl = Math.hypot(x / l, 0.9, z / l);
        nor.set([x / l / nl, 0.9 / nl, z / l / nl], i * 3);
        const ao = (inner ? 0.55 : 1) * (top ? 1 : 0.62) * (0.8 + 0.25 * f);
        col.set([ao, ao, ao], i * 3);
        uv.setXY(i, uv.getX(i) * 7, uv.getY(i) * 2);
      }
      g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geos.push(g);
    }
  }
  return mergeGeometries(geos)!;
}

/** A garden shrub, about a metre tall before scaling, at the same levels as a broadleaf crown. */
function shrubGeo(lod: number) {
  const crown: Crown = { cy: 0.45, rad: 0.7, bottom: 0, top: 1 };
  const parts = [{ c: [0, 0.45, 0], rad: [0.62, 0.48, 0.62] }, { c: [0.3, 0.35, 0.15], rad: [0.42, 0.36, 0.42] }, { c: [-0.25, 0.38, -0.2], rad: [0.45, 0.38, 0.45] }, { c: [0.05, 0.62, -0.05], rad: [0.38, 0.32, 0.38] }];
  const use = lod === 0 ? parts : lod === 1 ? parts.map((p) => ({ c: p.c, rad: p.rad.map((v) => v * COARSE) }))
    : [{ c: [0, 0.45, 0], rad: [0.68, 0.52, 0.68] }];
  const geos = use.map((p, k) => lump(lod ? 0 : 1, p.c, p.rad, crown, 1, 11 + k * 5.7, 2.5));
  if (lod === 0) geos.push(lump(0, [0, 0.42, 0], [0.48, 0.38, 0.48], crown, 0.55, 99, 2.5));
  return mergeGeometries(geos)!;
}

/** A tapered cylinder from a to b (open-ended), with bark UVs and plain shading colours. */
function limb(a: number[], b: number[], r0: number, r1: number, sides: number) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true).translate(0, len / 2, 0);
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(a[0], a[1], a[2]);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * len / 1.5);
  const out = g.toNonIndexed();
  g.dispose();
  return out;
}

function trunkGeo() {
  const parts = [limb([0, -0.3, 0], [0, 3.2, 0], 0.27, 0.19, 7), limb([0, 3.2, 0], [0.1, 5.6, 0.05], 0.19, 0.08, 6)];
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + 0.4, h = 2.6 + k * 0.45;
    parts.push(limb([0, h, 0], [Math.cos(a) * 1.7, h + 1.7, Math.sin(a) * 1.7], 0.11, 0.035, 5));
  }
  return mergeGeometries(parts)!;
}

export interface Vegetation {
  update(px: number, pz: number, dt: number): void;
  /** Seconds of wind, shared by every swaying material. */
  time: { value: number };
  /** The materials and models, to share with more plants (the wider map's, outskirts.ts). */
  kit: VegetationKit;
  /** Take these plants away again (the kit stays). */
  dispose(): void;
}

/** The leaf and bark materials and the tree and shrub models, built once and shared. */
export interface VegetationKit {
  time: { value: number };
  look: Region["trees"];
  /** leaf[tree or shrub][lod], each blending into the next level by its own share of a dither */
  leaf: THREE.Material[][]; bark: THREE.Material; flat: THREE.Material[];
  /** Where the player is and where each kind changes level (view.ts), for the blends. */
  eye: THREE.Vector2; to: THREE.Vector3[];
  geo: { trunk: THREE.BufferGeometry; broad: THREE.BufferGeometry[][]; cone: THREE.BufferGeometry[]; shrub: THREE.BufferGeometry[] };
}
/**
 * A patch of trees or shrubs: crown meshes by detail level and kind, the trunks that go with the
 * near crowns, and the flat pictures for those further off. Each plant goes in the level for its
 * own distance: the crowns up to to[0] and to[1] metres, then the pictures up to to[2].
 */
interface Chunk {
  x: number; z: number; r: number; range: number; meshes: THREE.InstancedMesh[][]; to: number[];
  trunk: THREE.InstancedMesh | null; tmat: Float32Array | null;   // trunks, and where each plant's goes
  shade: THREE.InstancedMesh[]; shadeTrunk: THREE.InstancedMesh | null;   // the far ones' shadows: cheaper crowns and trunks only the sun sees
  flat: THREE.InstancedMesh; cell: THREE.InstancedBufferAttribute; cells: number[];   // the pictures, which one each, and each kind's
  holder: THREE.Group;   // all of its meshes, hidden at once when it's out of range (quicker than hiding each)
  ix: Float32Array; iz: Float32Array; kind: Int8Array; mat: Float32Array; col: Float32Array;
  sx: number; sz: number; allFar: boolean;   // where the plants were last dealt out from
}

const LODS = [0, 1, 2];   // the 3D crowns, then the far ones' shadow stand-ins; past them, the flat pictures
const DRAWN = [0, 1];
const SHRUB_TO = [30, 65, 180];
/** Where the blends into the middle crowns and into the pictures end, metres: short of the levels'
 *  own reach by the slack, so no plant is drawn in a costlier level further out than it used to be.
 *  ?trees=flat: nowhere, it's pictures throughout. */
const levels = (to: number[]): [number, number] => FLAT_ALL ? [0.001, 0.002] : [to[0] - SLACK, to[1] - SLACK];
/** Each change of level is blended over this share of its distance, and the far edge fades out over it. */
const BAND = 0.15;
/** Plants are dealt into both levels this far either side of a blend, so the blend is never cut short
 *  between one dealing out and the next (every 3 m moved, or 6 m at a car's speed). */
const SLACK = 6;
/** The flat pictures are drawn from this many sides of each plant, and the nearest two blended. */
const SIDES = 8;
const KINDS = 4;   // two broadleaf trees, a conifer, a shrub

// Which share of a 4 x 4 dither each part of a plant keeps, at its distance: the parts' shares add up
// to the whole, so a plant crossing from one level to the next stipples across without a gap or a
// doubled pixel, and the flat pictures stipple away at the far edge instead of vanishing at once.
const FADE_HEAD = `uniform vec2 uEye; uniform vec3 uTo; varying vec2 vKeep;
  vec2 keepFor(vec3 at, float part) {
    float d = distance(at.xz, uEye);
    float w0 = 1.0 - smoothstep(uTo.x * ${1 - BAND}, uTo.x, d), w2 = smoothstep(uTo.y * ${1 - BAND}, uTo.y, d);
    float out_ = 1.0 - smoothstep(uTo.z * ${1 - BAND}, uTo.z, d);
    return part < 0.5 ? vec2(0.0, w0) : part < 1.5 ? vec2(w0, 1.0 - w2) : part < 2.5 ? vec2(1.0 - w2, 1.0 - w2 + w2 * out_) : vec2(0.0, 1.0 - w2);
  }
`;
const FADE_FRAG = `varying vec2 vKeep;
  float ditherAt(vec2 p) {
    ivec2 i = ivec2(mod(p, 4.0));
    const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
    return (m[i.x + i.y * 4] + 0.5) / 16.0;
  }
`;
const FADE_TEST = `{ float dz = ditherAt(gl_FragCoord.xy); if (dz < vKeep.x || dz >= vKeep.y) discard; }`;
/** Parts of a plant, for keepFor: the close crown, the middle one, the flat picture, the trunk. */
const PART = { near: 0, mid: 1, flat: 2, trunk: 3 };

function vegetationKit(look: Region["trees"]): VegetationKit {
  const time = { value: 0 };
  const eye = new THREE.Vector2(), to = [new THREE.Vector3(), new THREE.Vector3()];
  const fading = (shader: THREE.WebGLProgramParametersWithUniforms, kind: number, part: number) => {
    shader.uniforms.uEye = { value: eye };
    shader.uniforms.uTo = { value: to[kind] };
    shader.uniforms.uPart = { value: part };
    shader.vertexShader = FADE_HEAD + "uniform float uPart;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vKeep = keepFor((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, uPart);
      #else
        vKeep = vec2(0.0, 2.0);
      #endif`);
    shader.fragmentShader = FADE_FRAG + shader.fragmentShader;
  };
  const foliage = TX.foliage();
  const leafMat = (kind: number, part: number) => {
    const m = new THREE.MeshLambertMaterial({ map: foliage, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      fading(shader, kind, part);
      shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = instanceMatrix[3].xyz;
        #else
          vec3 iPos = vec3(0.0);
        #endif
        float ph = uTime * 1.1 + iPos.x * 0.21 + iPos.z * 0.17;
        float sway = position.y * 0.014;
        transformed.x += sway * (sin(ph) + 0.4 * sin(ph * 2.3 + 1.0));
        transformed.z += sway * (0.6 * cos(ph * 0.8) + 0.3 * sin(ph * 3.1));
        // leaf flutter: depends only on the vertex position, so lumps don't split apart
        transformed += 0.025 * vec3(sin(uTime * 5.0 + position.x * 7.0 + position.z * 3.0), 0.0, cos(uTime * 4.3 + position.y * 6.0));`);
      // Far off, mipmapped alpha fades and cut-out crowns would thin to nothing: ease the cut-off
      // with distance. Insides seen through the gaps are in shadow.
      shader.fragmentShader = shader.fragmentShader.replace("#include <alphatest_fragment>", `${FADE_TEST}
        float aCut = mix(alphaTest, 0.12, smoothstep(18.0, 80.0, length(vViewPosition)));
        if (diffuseColor.a < aCut) discard;
        if (!gl_FrontFacing) diffuseColor.rgb *= 0.55;`);
    };
    m.customProgramCacheKey = () => "treeLeaves";
    return m;
  };
  const leaf = [[leafMat(0, PART.near), leafMat(0, PART.mid)], [leafMat(1, PART.near), leafMat(1, PART.mid)]];
  const bark = new THREE.MeshLambertMaterial({ color: "#8a7560", map: TX.bark() });
  bark.onBeforeCompile = (shader) => {
    fading(shader, 0, PART.trunk);
    shader.fragmentShader = shader.fragmentShader.replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
      ${FADE_TEST}`);
  };
  bark.customProgramCacheKey = () => "treeBark";
  const geo = {
    trunk: trunkGeo(),
    broad: LODS.map((l) => [broadleafCrown(l, 3), broadleafCrown(l, 17)]),
    cone: LODS.map((l) => coniferCrown(l)),
    shrub: LODS.map((l) => shrubGeo(l)),
  };
  // The flat pictures: each quad stands upright on its plant's foot and turns round to face the
  // camera, sized by the plant's own scale (textures.ts SPRITE_FRAMES), its top swaying as the
  // crowns do. It shows the plant's own close crown as seen from the side you're on (SIDES
  // pictures round it, the nearest two blended), so its shape and colour carry on from the 3D one.
  // It's lit as if it faced you and a little up.
  const sprites = plantPictures(geo, leaf[0][0], bark);
  const [tw, th, tb] = TX.SPRITE_FRAMES.tree, [sw, sh, sb] = TX.SPRITE_FRAMES.shrub;
  const f = (v: number) => v.toFixed(3);
  const flatMat = (kind: number) => {
    const m = new THREE.MeshLambertMaterial({ map: sprites, alphaTest: 0.5 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      fading(shader, kind, PART.flat);
      shader.vertexShader = `uniform float uTime;
        attribute float aCell;
        varying vec2 vUvA, vUvB; varying float vSideMix;
        vec3 bbWorld, bbToCam;
        void bbSetup() {
          vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz), sz = length(instanceMatrix[2].xyz);
          vec3 ax = instanceMatrix[0].xyz / sx, az = instanceMatrix[2].xyz / sz;
          vec3 frame = aCell < 2.5 ? vec3(${f(tw)}, ${f(th)}, ${f(tb)}) : vec3(${f(sw)}, ${f(sh)}, ${f(sb)});
          vec3 t = cameraPosition - c; t.y = 0.0;
          bbToCam = length(t) > 0.001 ? normalize(t) : vec3(0.0, 0.0, 1.0);
          vec3 right = cross(vec3(0.0, 1.0, 0.0), bbToCam);
          // the plant is wider one way than the other: as wide as it is across your view
          float wide = length(vec2(sx * dot(right, ax), sz * dot(right, az)));
          float ph = uTime * 1.1 + c.x * 0.21 + c.z * 0.17, sway = position.y * position.y * 0.1 * sy;
          bbWorld = c + right * (position.x * frame.x * wide) + vec3(0.0, (position.y * frame.y + frame.z) * sy, 0.0)
            + vec3(sin(ph) + 0.4 * sin(ph * 2.3 + 1.0), 0.0, 0.6 * cos(ph * 0.8)) * sway;
          // which side of the plant you're on, in the plant's own turn
          float side = fract(atan(dot(bbToCam, ax), dot(bbToCam, az)) / 6.2831853) * ${SIDES}.0;
          float s0 = floor(side), s1 = mod(s0 + 1.0, ${SIDES}.0);
          vSideMix = side - s0;
          float row = (${KINDS - 1}.0 - aCell + uv.y) / ${KINDS}.0;
          vUvA = vec2((s0 + uv.x) / ${SIDES}.0, row);
          vUvB = vec2((s1 + uv.x) / ${SIDES}.0, row);
        }
        ` + shader.vertexShader
        .replace("void main() {", "void main() {\n  bbSetup();")
        .replace("#include <defaultnormal_vertex>", `#include <defaultnormal_vertex>
          transformedNormal = normalize(mat3(viewMatrix) * normalize(bbToCam + vec3(0.0, 0.9, 0.0)));`)
        .replace("#include <project_vertex>", `vec4 mvPosition = viewMatrix * vec4(bbWorld, 1.0);
          gl_Position = projectionMatrix * mvPosition;`)
        .replace("#include <worldpos_vertex>", `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
            vec4 worldPosition = vec4(bbWorld, 1.0);
          #endif`);
      // the two sides' pictures mixed, outline and all, so turning round a plant morphs it
      shader.fragmentShader = "varying vec2 vUvA, vUvB; varying float vSideMix;\n" + shader.fragmentShader
        .replace("#include <map_fragment>", "diffuseColor *= mix(texture2D(map, vUvA), texture2D(map, vUvB), vSideMix);")
        // (as the crowns: far off, mipmapped alpha fades, so ease the cut-off with distance)
        .replace("#include <alphatest_fragment>", `${FADE_TEST}
          if (diffuseColor.a < mix(alphaTest, 0.15, smoothstep(40.0, 300.0, length(vViewPosition)))) discard;`);
    };
    m.customProgramCacheKey = () => "treeSprites";
    return m;
  };
  return { time, look, leaf, bark, flat: [flatMat(0), flatMat(1)], eye, to, geo };
}

/**
 * The flat pictures, drawn once from the close crowns themselves: each kind of plant (row) from
 * SIDES sides round it (columns), unlit, so the flat material lights it as the crowns are lit. Drawn
 * from far off, as the crowns' leaves look then, and coarsened to the game's retro look.
 */
function plantPictures(geo: VegetationKit["geo"], leaf: THREE.Material, bark: THREE.Material) {
  const CW = 96, CH = 144, UP = 2, w = CW * UP, h = CH * UP;
  const [canvas, g] = TX.canvas(SIDES * w, KINDS * h);
  const img = g.createImageData(w, h);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, Math.PI));
  const own = pictureRenderer() ? null : new THREE.WebGLRenderer({ alpha: true });
  const r = pictureRenderer() ?? own!;
  const target = new THREE.WebGLRenderTarget(w, h);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const prevTarget = r.getRenderTarget(), prevColour = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
  const prevViewport = r.getViewport(new THREE.Vector4()), prevScissor = r.getScissor(new THREE.Vector4()), prevScissorTest = r.getScissorTest();
  const px = new Uint8Array(w * h * 4), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
  const plants: [THREE.BufferGeometry, number][] = [[geo.broad[0][0], 1], [geo.broad[0][1], 1], [geo.cone[0], 0.7], [geo.shrub[0], 0]];
  try {
    r.setRenderTarget(target);
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    r.setClearColor(0x000000, 0);
    plants.forEach(([crown, trunk], k) => {
      const [fw, fh, fb] = k < 3 ? TX.SPRITE_FRAMES.tree : TX.SPRITE_FRAMES.shrub;
      scene.add(new THREE.Mesh(crown, leaf));
      if (trunk) { const t = new THREE.Mesh(geo.trunk, bark); t.scale.y = trunk; scene.add(t); }
      Object.assign(cam, { left: -fw / 2, right: fw / 2, top: fh / 2, bottom: -fh / 2 });
      cam.updateProjectionMatrix();
      for (let side = 0; side < SIDES; side++) {
        const a = (side / SIDES) * Math.PI * 2;
        // far enough off that the leaves are drawn as thick as the far crowns'
        cam.position.set(Math.sin(a) * 150, fb + fh / 2, Math.cos(a) * 150);
        cam.lookAt(0, fb + fh / 2, 0);
        r.clear();
        r.render(scene, cam);
        r.readRenderTargetPixels(target, 0, 0, w, h, px);
        // (the GPU's rows run bottom up)
        for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
        g.putImageData(img, side * w, k * h);
      }
      for (const m of scene.children.filter((o) => o instanceof THREE.Mesh)) scene.remove(m);
    });
  } finally {
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColour, prevAlpha);
    r.setViewport(prevViewport);
    r.setScissor(prevScissor);
    r.setScissorTest(prevScissorTest);
    target.dispose();
    if (own) { own.dispose(); own.forceContextLoss(); }
  }
  const t = TX.pixelTex(canvas, SIDES * CW, KINDS * CH, 18, 53, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;   // (so one picture doesn't bleed into the next)
  return t;
}

/**
 * Builds the trees (x, y, ground, size[, in a wood]) and shrubs (x, y, ground, height) into the
 * scene (or any group in it). Z0 turns ground heights into scene heights. look: the map's trees
 * (region.ts). Given a kit from another Vegetation, it shares its materials, models and look, and
 * that one keeps the wind's time.
 */
export function buildVegetation(scene: THREE.Object3D, trees: number[][], shrubs: number[][], Z0: number, look: Region["trees"], shared?: VegetationKit): Vegetation {
  const kit = shared ?? vegetationKit(look), { time, leaf, bark, flat: flatMats, geo } = kit;
  const made: THREE.InstancedMesh[] = [], ownGeos: THREE.BufferGeometry[] = [];
  // tints over the leaf texture
  const tint = (c: number[]) => new THREE.Color(c[0], c[1], c[2]);
  const LEAF = kit.look.leaf.map(tint), CONIFER = tint(kit.look.conifer_leaf), SHRUB = kit.look.shrub.map(tint), CONIFERS = kit.look.conifer;

  const chunks: Chunk[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const SIZE = 200;   // metres a side of each patch (fewer, bigger patches are quicker to draw)
  const group = <T,>(list: T[], key: (t: T) => number[]) => {
    const m = new Map<string, T[]>();
    for (const t of list) { const [x, y] = key(t); const k = `${Math.floor(x / SIZE)},${Math.floor(y / SIZE)}`; (m.get(k) ?? m.set(k, []).get(k)!).push(t); }
    return m.values();
  };
  const instanced = (g: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
    const m = new THREE.InstancedMesh(g, mat, Math.max(1, n));
    m.count = 0;
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    m.castShadow = m.receiveShadow = true;
    made.push(m);
    return m;
  };
  /** Chunk of n plants, laid out by place(i) which sets m4 and returns [kind, colour]; meshes[lod][kind];
   *  cells: each kind's flat picture; trunk and tmat: the trunks, if they're trees, and where each goes. */
  const chunk = (n: number, meshes: THREE.InstancedMesh[][], shadeGeo: THREE.BufferGeometry[], cells: number[], to: number[], place: (i: number) => [number, THREE.Color],
    trunk: THREE.InstancedMesh | null = null, tmat: Float32Array | null = null) => {
    // the pictures: one quad, drawn once for each plant far enough off, with which picture it is
    const fg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const cell = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n)), 1);
    fg.setAttribute("aCell", cell);
    ownGeos.push(fg);
    const flat = instanced(fg, flatMats[cells[0] === 3 ? 1 : 0], n);
    flat.castShadow = false;
    // the far ones' shadows: plain blobs (and trunks), only in the sun's shadows
    const shadowOnly = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const s = instanced(g, m, n);
      s.receiveShadow = false;
      s.layers.set(SHADOW_ONLY);
      return s;
    };
    const shade = shadeGeo.map((g, k) => shadowOnly(g, meshes[1][k].material as THREE.Material)), shadeTrunk = trunk ? shadowOnly(trunk.geometry, bark) : null;
    const all = [...(trunk ? [trunk] : []), ...meshes.flat(), flat, ...shade, ...(shadeTrunk ? [shadeTrunk] : [])];
    const holder = new THREE.Group();
    for (const m of all) holder.add(m);
    scene.add(holder);
    const ch: Chunk = { x: 0, z: 0, r: 0, meshes, to, trunk, tmat, shade, shadeTrunk, flat, cell, cells, holder, range: to[to.length - 1], ix: new Float32Array(n), iz: new Float32Array(n), kind: new Int8Array(n),
      mat: new Float32Array(n * 16), col: new Float32Array(n * 3), sx: Infinity, sz: Infinity, allFar: false };
    const box = new THREE.Box3();
    for (let i = 0; i < n; i++) {
      const [k, c] = place(i);
      ch.kind[i] = k;
      m4.toArray(ch.mat, i * 16);
      c.toArray(ch.col, i * 3);
      ch.ix[i] = m4.elements[12]; ch.iz[i] = m4.elements[14];
      box.expandByPoint(ps.set(m4.elements[12], m4.elements[13], m4.elements[14]));
    }
    // the bounds of every plant in the chunk, padded for the biggest crowns, serve every mesh
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    sphere.radius += 25;
    for (const m of all) m.boundingSphere = sphere.clone();
    ch.x = sphere.center.x; ch.z = sphere.center.z; ch.r = sphere.radius - 25;
    chunks.push(ch);
  };
  const copy = (m: THREE.InstancedMesh, n: number, mat: Float32Array, i: number, col?: Float32Array) => {
    (m.instanceMatrix.array as Float32Array).set(mat.subarray(i * 16, i * 16 + 16), n * 16);
    if (col) (m.instanceColor!.array as Float32Array).set(col.subarray(i * 3, i * 3 + 3), n * 3);
  };
  /** Deal each plant in a chunk into the mesh for its distance from the player: a 3D crown and its
   *  trunk near by, a flat picture further off. Near a change of level it goes in both, and the
   *  shaders blend between them (FADE_HEAD). (Trees in a wood are trunks only, near by: further
   *  off the wood's canopy stands for them.) */
  const sort = (ch: Chunk, px: number, pz: number) => {
    for (const lod of ch.meshes) for (const m of lod) m.count = 0;
    ch.flat.count = 0;
    if (ch.trunk) ch.trunk.count = 0;
    for (const m of ch.shade) m.count = 0;
    if (ch.shadeTrunk) ch.shadeTrunk.count = 0;
    const shadows = FLAT_ALL ? 0 : shadowReach();
    const [t0, t1] = levels(ch.to);
    const cell = ch.cell.array as Float32Array;
    for (let i = 0; i < ch.kind.length; i++) {
      const k = ch.kind[i];
      const d = Math.hypot(ch.ix[i] - px, ch.iz[i] - pz);
      const near = d < t0 + SLACK, mid = d >= t0 * (1 - BAND) - SLACK && d < t1 + SLACK, far = d >= t1 * (1 - BAND) - SLACK;
      if (k >= 0) {
        if (near) { const m = ch.meshes[0][k]; copy(m, m.count++, ch.mat, i, ch.col); }
        if (mid) { const m = ch.meshes[1][k]; copy(m, m.count++, ch.mat, i, ch.col); }
        if (far) {
          const n = ch.flat.count++;
          copy(ch.flat, n, ch.mat, i, ch.col);
          cell[n] = ch.cells[k];
        }
      }
      if (ch.trunk && d < t1 + SLACK) copy(ch.trunk, ch.trunk.count++, ch.tmat!, i);
      // past the crowns, within the shadows' reach, a stand-in for its shadow
      if (far && !mid && d < shadows) {
        const s = k >= 0 ? ch.shade[k] : undefined;
        if (s) copy(s, s.count++, ch.mat, i);
        if (ch.shadeTrunk) copy(ch.shadeTrunk, ch.shadeTrunk.count++, ch.tmat!, i);
      }
    }
    for (const m of [...ch.meshes.flat(), ch.flat, ...(ch.trunk ? [ch.trunk] : []), ...ch.shade, ...(ch.shadeTrunk ? [ch.shadeTrunk] : [])]) {
      show(m, m.count > 0);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    ch.cell.needsUpdate = true;
    ch.sx = px; ch.sz = pz;
  };

  let seq = 0;
  for (const list of group(trees, (t) => t)) {
    // trees inside woods are trunks only: the wood canopy is drawn as one surface
    const kind = list.map((t) => (t.length >= 5 ? -1 : hash(seq++ * 31) < CONIFERS ? 2 : hash(seq * 7 + 3) < 0.5 ? 0 : 1));
    const count = (k: number) => kind.filter((v) => v === k).length;
    const trunks = instanced(geo.trunk, bark, list.length), tmat = new Float32Array(list.length * 16);
    const meshes = DRAWN.map((l) => [geo.broad[l][0], geo.broad[l][1], geo.cone[l]].map((g, k) => instanced(g, leaf[0][l], count(k))));
    list.forEach(([x, y, z, s], i) => {
      const r = hash(Math.round(x * 13 + y * 7));
      q.setFromAxisAngle(up, r * 6.28);
      // conifers have short, hidden trunks; wood trunks reach up into the canopy
      const tall = kind[i] === 2 ? 0.7 : 1;
      m4.compose(ps.set(x, z - Z0 - 0.1, -y), q, sc.set(s, s * tall, s));
      m4.toArray(tmat, i * 16);
    });
    chunk(list.length, meshes, [geo.broad[2][0], geo.broad[2][1], geo.cone[2]], [0, 1, 2], TREE_TO, (i) => {
      const [x, y, z, s] = list[i], k = kind[i];
      const r = hash(Math.round(x * 13 + y * 7)), r2 = hash(Math.round(x * 5 - y * 11));
      q.setFromAxisAngle(up, r * 6.28);
      m4.compose(ps.set(x, z - Z0 - 0.1, -y), q, sc.set(s * (0.88 + r2 * 0.24), s * (0.9 + r * 0.2), s * (1.1 - r2 * 0.22)));
      return [k, k === 2 ? CONIFER : LEAF[Math.floor(r2 * LEAF.length)]];
    }, trunks, tmat);
  }

  for (const list of group(shrubs, (s) => s)) {
    const meshes = DRAWN.map((l) => [instanced(geo.shrub[l], leaf[1][l], list.length)]);
    chunk(list.length, meshes, [geo.shrub[2]], [3], SHRUB_TO, (k) => {
      const [x, y, z, h] = list[k];
      const r = hash(Math.round(x * 13 + y * 7));
      q.setFromAxisAngle(up, r * 6.28);
      m4.compose(ps.set(x, z - Z0 - 0.05, -y), q, sc.set(h * (0.9 + r * 0.35), h * 0.95, h * (1.05 - r * 0.25)));
      return [0, SHRUB[Math.floor(hash(k + Math.round(x)) * SHRUB.length)]];
    });
  }

  let wait = 0;
  return {
    time, kit,
    dispose() {
      for (const m of made) { show(m, true); m.removeFromParent(); m.dispose(); }
      for (const ch of chunks) { show(ch.holder, true); ch.holder.removeFromParent(); }
      for (const g of ownGeos) g.dispose();
      chunks.length = 0;
    },
    update(px, pz, dt) {
      if (!shared) time.value += dt;
      kit.eye.set(px, pz);
      kit.to[0].set(...levels(TREE_TO), TREE_TO[2]);
      kit.to[1].set(...levels(SHRUB_TO), SHRUB_TO[2]);
      wait -= dt;
      if (wait > 0) return;
      wait = 0.2;
      for (const ch of chunks) {
        const d = Math.hypot(ch.x - px, ch.z - pz) - ch.r;
        const inRange = d < ch.to[ch.to.length - 1];   // (the trees' reach can change: view.ts)
        show(ch.holder, inRange);
        if (!inRange) { ch.sx = Infinity; continue; }
        // a chunk wholly in the far band only needs dealing out once; nearer ones as the player moves
        if (d > ch.to[1] + 2 * SLACK) {
          if (!ch.allFar || ch.sx === Infinity) sort(ch, px, pz);
          ch.allFar = true;
        } else if (ch.allFar || Math.hypot(px - ch.sx, pz - ch.sz) > 3) {
          ch.allFar = false;
          sort(ch, px, pz);
        }
      }
    },
  };
}
