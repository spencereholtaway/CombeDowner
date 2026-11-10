// The game's own modules run in Node, for the checks that need no browser (pack_behave.mjs,
// pack_scene.mjs): enough of a browser for them to load, the map files read from disk through
// fetch, and the modules bundled with esbuild. Nothing here draws or plays anything.
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { pathToFileURL } from "url";

const WEB = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "web");

/** Stand-ins for what the modules touch as they load. fetch reads under `maps`; packs answer 404
 *  unless reading.packs is true, so the map loads from its JSON. */
export function fakeBrowser(maps) {
  const reading = { packs: false };
  const nothing = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : nothing), apply: () => nothing, set: () => true });
  const canvas = () => ({ width: 0, height: 0, getContext: () => nothing, style: {}, dataset: {}, addEventListener() {}, toDataURL: () => "" });
  const quiet = { addEventListener() {}, removeEventListener() {} };
  Object.assign(globalThis, {
    location: { search: "", host: "localhost", pathname: "/", href: "http://localhost/", origin: "http://localhost", hostname: "localhost", protocol: "http:" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {},
    document: { ...quiet, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: canvas, createElementNS: canvas, body: { appendChild() {} }, head: { appendChild() {} }, hidden: false, visibilityState: "visible" },
    requestAnimationFrame: () => 0,
    matchMedia: () => ({ matches: false, ...quiet }),
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, screen: { width: 1280, height: 720 },
    Image: class { addEventListener() {} },
    ImageData: class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(4 * w * h); } },
    OffscreenCanvas: class { constructor(w, h) { Object.assign(this, canvas(), { width: w, height: h }); } },
    __glob: () => ({}),
  });
  globalThis.window = globalThis;
  if (!globalThis.navigator) globalThis.navigator = { maxTouchPoints: 0, userAgent: "node" };
  globalThis.fetch = async (u) => {
    const f = path.join(maps, String(u).replace(/^\/?maps\//, ""));
    if (!fs.existsSync(f) || (!reading.packs && f.endsWith(".pack.gz"))) return { ok: false, status: 404, json: async () => null, text: async () => "" };
    const b = fs.readFileSync(f), text = () => b.toString("utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text()), text: async () => text(), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
  };
  return reading;
}

/** The game's modules named in `entry` (export lines, from web/src), bundled for Node and loaded.
 *  Vite's own imports (a worker, a folder of files) stand in as nothing. */
export async function bundleGame(entry, src = path.join(WEB, "src")) {
  const esbuild = createRequire(path.join(WEB, "package.json"))("esbuild");
  const viteOnly = { name: "vite-only", setup(b) {
    b.onResolve({ filter: /\?worker/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default class { constructor() { throw new Error(\"no workers in Node\"); } }", loader: "js" }));
  } };
  const out = path.join(os.tmpdir(), `node_game_${process.pid}_${Date.now()}.mjs`);
  await esbuild.build({ stdin: { contents: entry, resolveDir: path.resolve(src), loader: "ts" }, nodePaths: [path.join(WEB, "node_modules")], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error", plugins: [viteOnly],
    define: { __BUILD__: "0", __COMMIT__: '""', "import.meta.env": '{"BASE_URL":"/","DEV":false,"PROD":true,"MODE":"production"}', "import.meta.glob": "globalThis.__glob" }, loader: { ".glsl": "text", ".css": "empty" } });
  try { return await import(pathToFileURL(out).href); } finally { fs.rmSync(out, { force: true }); }
}
