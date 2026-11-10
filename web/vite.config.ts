import { defineConfig, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Relative base so the build works from any path (GitHub Pages serves it under /<repo>/).
// Three pages: the game (index.html), the mines (mines.html) and the deli (deli.html). The single-file build
// (tools/build_single.py) is the game alone, so it gets no shared chunks to inline.
// The game's version is when it last changed: the last commit on main to touch web/. So pushes that
// only change the docs or the to-do list don't tell everyone playing that there's a new version.
// (Falls back to now if git can't say.)
// The commit's short hash goes with it, for the build label on the menu (version.ts).
const [BUILD, COMMIT] = (() => {
  try {
    const [t, h] = execSync("git log -1 --first-parent --format=%ct:%h -- .", { cwd: fileURLToPath(new URL(".", import.meta.url)) }).toString().trim().split(":");
    return [Number(t) * 1000 || Date.now(), h ?? ""];
  } catch { return [Date.now(), ""]; }
})();
const single = process.env.VITE_SOLO_ONLY === "1";
// When a link to a player drops, Trystero can look for them again straight away, but its Nostr
// signalling doesn't ask it to, so they only find each other at the next announcement, up to a
// minute later. This switches that on (net.ts). If a Trystero update changes the line, the build says so.
const REANNOUNCE_FROM = "const nextAnnounce = (nextAnnounceMs) => ({ nextAnnounceMs });";
const REANNOUNCE_TO = "const nextAnnounce = (nextAnnounceMs) => ({ nextAnnounceMs, reannounceOnDisconnect: true });";
const reannounce = {
  name: "nostr-reannounce", enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!/@trystero-p2p[\\/]nostr[\\/]dist[\\/]index\.mjs/.test(id)) return null;
    if (!code.includes(REANNOUNCE_FROM)) { this.warn("Trystero's Nostr code has changed: dropped players won't be looked for straight away (vite.config.ts)"); return null; }
    return { code: code.replace(REANNOUNCE_FROM, REANNOUNCE_TO), map: null };
  },
};
// The map's squares, wider maps and ground kinds go out packed (src/pack.ts): they're packed from the
// JSON before each build, each one checked to read back exactly as its JSON, and the build stops if
// one doesn't. The JSON they came from is left out of the site. `npm run dev` packs them too, and
// packs a map again when its JSON changes, so it serves what the site does.
const MAPS = fileURLToPath(new URL("public/maps", import.meta.url));
const packer = () => import("../tools/pack_squares.mjs");
const PACKED = /^(-?\d+_-?\d+|.+-(wide|ground))\.json$/;
const mapPacks = {
  name: "pack-maps",
  async buildStart() { if (!single) await (await packer()).packMaps({ maps: MAPS }); },
  closeBundle() {
    if (single) return;
    const dist = fileURLToPath(new URL("dist/maps", import.meta.url));
    if (!fs.existsSync(dist)) return;
    fs.rmSync(path.join(dist, ".packs.json"), { force: true });
    const strip = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) strip(f);
        else if (PACKED.test(e.name) && fs.existsSync(f.replace(/\.json$/, ".pack.gz"))) fs.rmSync(f);
      }
    };
    strip(dist);
  },
  async configureServer(server: ViteDevServer) {
    const { packMaps } = await packer();
    await packMaps({ maps: MAPS });
    server.middlewares.use((q, _r, next) => {
      const m = /\/maps\/(.+)\.pack\.gz$/.exec(decodeURIComponent((q.url ?? "").split("?")[0]));
      if (!m) return next();
      const json = path.join(MAPS, `${m[1]}.json`), packed = path.join(MAPS, `${m[1]}.pack.gz`);
      if (fs.existsSync(json) && (!fs.existsSync(packed) || fs.statSync(json).mtimeMs > fs.statSync(packed).mtimeMs)) {
        const only = m[1].includes("/") ? m[1].split("/")[0] : m[1].replace(/-(wide|ground)$/, "");
        packMaps({ maps: MAPS, only }).then(() => next(), (e: unknown) => { server.config.logger.error(String(e)); next(); });
      } else next();
    });
  },
};
// ONNX Runtime's 26 MB wasm gets copied into the build because its code names it, but the critics'
// eye never loads it: Transformers.js fetches the same file from jsDelivr, pinned to its version.
// Leaving it out keeps every file under Cloudflare Pages' 25 MiB limit.
const dropOrtWasm = {
  name: "drop-ort-wasm",
  generateBundle(_: unknown, bundle: Record<string, unknown>) {
    for (const f of Object.keys(bundle)) if (/(^|\/)ort-wasm[^/]*\.wasm$/.test(f)) delete bundle[f];
  },
};
export default defineConfig({
  base: "./",
  // when the game last changed, so players on an old page can be told to refresh (net.ts)
  define: { __BUILD__: String(BUILD), __COMMIT__: JSON.stringify(COMMIT) },
  // version.json says which version is live, for anyone who wants to check by hand
  plugins: [reannounce, mapPacks, dropOrtWasm, { name: "version", generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD }) }); } }],
  // so the change above applies in `npm run dev` too, which otherwise pre-packs Trystero untouched
  optimizeDeps: { exclude: ["trystero", "@trystero-p2p/nostr"] },
  build: {
    target: "es2022", chunkSizeWarningLimit: 1200,
    rollupOptions: single ? {} : { input: { main: fileURLToPath(new URL("index.html", import.meta.url)), mines: fileURLToPath(new URL("mines.html", import.meta.url)), deli: fileURLToPath(new URL("deli.html", import.meta.url)), characters: fileURLToPath(new URL("characters.html", import.meta.url)), whatswhat: fileURLToPath(new URL("whatswhat.html", import.meta.url)), ui: fileURLToPath(new URL("ui.html", import.meta.url)) } },
  },
});
