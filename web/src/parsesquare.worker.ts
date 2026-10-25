// The worker half of parsesquare.ts: turns one square's file text into its object, off the main
// thread, and sends it back. It does nothing else: no map, no scene, no game. Nothing here goes
// over the network.
import type { Parsed } from "./parsesquare";
import { surfaceBuffers, unpackSurfaces } from "./sfpack";

interface Ask { ti: number; tj: number; text: string }

self.onmessage = (e: MessageEvent<Ask>) => {
  const { ti, tj, text } = e.data;
  let out: Parsed;
  try {
    const data = JSON.parse(text);
    unpackSurfaces(data);
    out = { ti, tj, data };
  } catch (err) {
    out = { ti, tj, error: String(err) };
  }
  (self as unknown as { postMessage(m: Parsed, t: Transferable[]): void }).postMessage(out, surfaceBuffers(out.data));
};
