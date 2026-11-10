// The Delaunay triangulation of a square's ground (sheet.ts buildSheetCdt), off the main thread: it
// is the one step of building the ground that can't be done a few milliseconds at a time, some tens
// of milliseconds for a square of Bath on the Mac. One worker, made when first wanted; where a
// worker can't be made, or doesn't answer, the triangulation is done here instead.
// Nothing here goes over the network.
import Delaunator from "delaunator";
import DelaunayWorker from "./delaunay.worker?worker&inline";

export interface Triangulation { coords: Float64Array; triangles: Uint32Array; halfedges: Int32Array; hull: Uint32Array }

let worker: Worker | null = null, broken = false, next = 0;
const asked = new Map<number, (t: { triangles: Uint32Array; halfedges: Int32Array; hull: Uint32Array }) => void>();

/** The triangulation of `coords` (x, y in turn), on the main thread. */
export function delaunayHere(coords: Float64Array): Triangulation {
  const d = new Delaunator(coords);
  return { coords, triangles: d.triangles, halfedges: d.halfedges, hull: d.hull };
}

/** Ask for the triangulation off the main thread: `result` is filled in when it is ready, or null
 *  straight away if there is no worker to ask (then use delaunayHere). */
export function delaunayOffMain(coords: Float64Array): { result: Triangulation | null } | null {
  if (broken) return null;
  try {
    if (!worker) {
      worker = new DelaunayWorker();
      worker.onmessage = (e) => { const f = asked.get(e.data.id); asked.delete(e.data.id); f?.(e.data); };
      worker.onerror = () => { broken = true; for (const f of asked.values()) f({ triangles: null!, halfedges: null!, hull: null! }); asked.clear(); };
    }
  } catch { broken = true; return null; }
  const id = next++, out: { result: Triangulation | null } = { result: null };
  // (a worker the browser kills never answers: after a while the triangulation is done here)
  const late = setTimeout(() => { if (asked.delete(id)) out.result = delaunayHere(coords); }, 4000);
  asked.set(id, (t) => { clearTimeout(late); out.result = t.triangles ? { coords, ...t } : delaunayHere(coords); });
  worker.postMessage({ id, coords: coords.slice() });
  return out;
}
