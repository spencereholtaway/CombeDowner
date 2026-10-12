// Geometry helpers shared by the world and the landmarks: a triangle accumulator and quads that
// face a given way (so winding never needs thinking about).
import * as THREE from "three";

/** Accumulates non-indexed triangles with normals, UVs and colours. */
export class Geo {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = [];
  tri(a: number[], b: number[], c: number[], n: number[], ua: number[], ub: number[], uc: number[], col: number[]) {
    this.pos.push(...a, ...b, ...c);
    this.nor.push(...n, ...n, ...n);
    this.uv.push(...ua, ...ub, ...uc);
    this.col.push(...col, ...col, ...col);
  }
  /** Quad a-b-c-d (counter-clockwise seen from the front). */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], ua: number[], ub: number[], uc: number[], ud: number[], col: number[]) {
    this.tri(a, b, c, n, ua, ub, uc, col);
    this.tri(a, c, d, n, ua, uc, ud, col);
  }
  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Add a quad whose front faces along `out` (so winding never needs thinking about). */
export function facing(g: Geo, a: number[], b: number[], c: number[], d: number[], out: number[], ua: number[], ub: number[], uc: number[], ud: number[], col: number[]) {
  const n = norm(cross(sub(b, a), sub(c, a)));
  if (dot(n, out) >= 0) g.quad(a, b, c, d, norm(out), ua, ub, uc, ud, col);
  else g.quad(a, d, c, b, norm(out), ua, ud, uc, ub, col);
}
export function facingTri(g: Geo, a: number[], b: number[], c: number[], out: number[], ua: number[], ub: number[], uc: number[], col: number[]) {
  const n = norm(cross(sub(b, a), sub(c, a)));
  if (dot(n, out) >= 0) g.tri(a, b, c, norm(out), ua, ub, uc, col);
  else g.tri(a, c, b, norm(out), ua, uc, ub, col);
}
