// A small picture of a wardrobe item on its own, for the reward plate and the result card when
// you earn it (notice.ts, missionscreens.ts). The model is the one the avatar wears (wardrobe.ts),
// drawn at a three-quarter angle on a clear background. Nothing here goes over the network: it is
// drawn on your machine and used straight away.
//
// The game registers its renderer (itemPicRenderer) so the picture costs no new WebGL context.
// Without one (the catalogue page), a throwaway renderer is made, read, and let go at once.
import * as THREE from "three";
import { wearGeometry } from "./wardrobe";

const SIZE = 96;
let shared: THREE.WebGLRenderer | null = null;
const cache = new Map<string, Promise<string | null>>();

/** The game's own renderer, so a picture can be drawn without making another context. */
export function itemPicRenderer(r: THREE.WebGLRenderer | null) { shared = r; }
/** That renderer, for other pictures drawn once at load (the trees' flat pictures, trees.ts). */
export const pictureRenderer = () => shared;

export function itemPicture(id: string): Promise<string | null> {
  let p = cache.get(id);
  if (!p) {
    p = Promise.resolve().then(() => draw(id)).catch(() => null);
    cache.set(id, p);
  }
  return p;
}

function draw(id: string): string | null {
  const made = wearGeometry(id);
  if (!made) return null;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(made.geo, mat);
  mesh.rotation.y = -0.6;
  const scene = new THREE.Scene();
  scene.add(mesh, new THREE.HemisphereLight("#fff8ec", "#58606a", 2.4));
  const sun = new THREE.DirectionalLight("#ffffff", 1.6);
  sun.position.set(2, 4, -3);
  scene.add(sun);

  const own = shared ? null : new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: false });
  const r = shared ?? own!;
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const prevTarget = r.getRenderTarget();
  const prevColour = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
  const prevViewport = r.getViewport(new THREE.Vector4()), prevScissorTest = r.getScissorTest();
  const prevScissor = r.getScissor(new THREE.Vector4());
  try {
    const cam = fitCamera(mesh);
    r.setRenderTarget(target);
    r.setScissorTest(false);
    r.setViewport(0, 0, SIZE, SIZE);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, cam);
    const px = new Uint8Array(SIZE * SIZE * 4);
    r.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, px);
    return toDataUrl(px);
  } finally {
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColour, prevAlpha);
    r.setViewport(prevViewport);
    r.setScissor(prevScissor);
    r.setScissorTest(prevScissorTest);
    target.dispose();
    mat.dispose();
    made.geo.dispose();
    if (own) { own.dispose(); own.forceContextLoss(); }
  }
}

/** Looks down a little from the front-left, and pulls back until the whole item just fits. */
function fitCamera(mesh: THREE.Mesh): THREE.OrthographicCamera {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh), centre = box.getCenter(new THREE.Vector3());
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  cam.position.copy(centre).add(new THREE.Vector3(0.5, 0.45, -1).normalize().multiplyScalar(10));
  cam.lookAt(centre);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse;
  let half = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(inv);
    half = Math.max(half, Math.abs(v.x), Math.abs(v.y));
  }
  half *= 1.1;
  cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
  cam.updateProjectionMatrix();
  return cam;
}

function toDataUrl(px: Uint8Array): string | null {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}
