// The worker half of delaunay.ts: triangulates the points it is sent (Delaunator) and sends the
// triangles back. It does nothing else. Nothing here goes over the network.
import Delaunator from "delaunator";

self.onmessage = (e: MessageEvent<{ id: number; coords: Float64Array }>) => {
  const { id, coords } = e.data;
  const d = new Delaunator(coords);
  const triangles = d.triangles.slice(), halfedges = d.halfedges.slice(), hull = d.hull.slice();
  (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage({ id, triangles, halfedges, hull }, [triangles.buffer, halfedges.buffer, hull.buffer]);
};
