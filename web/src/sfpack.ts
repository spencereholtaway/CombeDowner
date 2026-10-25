// A square's street faces (map.ts `sf`) are written packed, which takes a third off their download:
// each point as whole centimetres from the one before it, from the square's corner `o`, and each
// list of point numbers as the step from the number before. This puts them back as the game reads them,
// in typed arrays: they pass from the reading worker to the game without being copied, and take
// less memory while the square is kept.
// Nothing here goes over the network.

const LISTS = ["road", "service", "pave", "path", "front", "drive"] as const;

const unstep = (a: number[]) => {
  const out = new Int32Array(a.length);
  let at = 0;
  for (let k = 0; k < a.length; k++) out[k] = at += a[k];
  return out;
};

/** Unpack a square's `sf` in place, if it came packed. */
export function unpackSurfaces(d: any) {
  const sf = d?.sf;
  if (!sf?.o) return;
  const v: number[] = sf.v, o = [sf.o[0], sf.o[1], 0], out = new Float64Array(v.length);
  const at = [0, 0, 0];
  for (let k = 0; k < v.length; k++) { const a = k % 3; at[a] += v[k]; out[k] = o[a] + at[a] / 100; }
  sf.v = out;
  for (const name of LISTS) if (sf[name]) sf[name] = unstep(sf[name]);
  for (const e of sf.e) e.i = unstep(e.i);
  delete sf.o;
}

/** The buffers of an unpacked `sf`, to hand over rather than copy when it's posted from a worker. */
export function surfaceBuffers(d: any): ArrayBuffer[] {
  const sf = d?.sf;
  if (!sf || !(sf.v instanceof Float64Array)) return [];
  const out: ArrayBuffer[] = [sf.v.buffer];
  for (const name of LISTS) if (sf[name]) out.push(sf[name].buffer);
  for (const e of sf.e) out.push(e.i.buffer);
  return out;
}
