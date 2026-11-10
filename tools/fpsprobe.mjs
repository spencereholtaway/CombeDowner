// Where the frame time goes, for finding what's worth speeding up. It serves a built game
// (web/dist), starts a solo game in a muted headless Chrome (no sound can play, the mouse is never
// taken), stands at each spot, waits for the squares round it to be built, then measures a few
// seconds of frames with each setting changed in turn: frame rate (uncapped), the JavaScript time
// split into the game's update, the shadow map and the rest of drawing, draw calls and triangles,
// and which kinds of things the draw calls go on.
//
//   cd web && npx vite build && node ../tools/fpsprobe.mjs --out probe [--secs 4] [--size 1280x720] [--noaa]
//
// --hops "e,n e,n ..." jumps to each spot in turn and, with the game's own building budget, times every
// square built round it: its building on the main thread, by part, and its longest single slice.
// --query "ground=sheet" adds to the address (ground=sheet or ground=cdt to time the two grounds).
// --dpr 2 measures as on a Retina screen. --noaa asks for a canvas without antialiasing (to see what that costs). Writes <out>/probe.json and prints a table.
// --route drives a fixed way from Combe Down into town and back at --speed m/s (20 by default) after
// the spots, with the game's own building budget, and reports the frame times on the move and how
// long each square took to set up and build (its longest single slice too). --spots none skips the spots.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "probe", secs: "4", size: "1280x720", spots: "", variants: "" };
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--noaa") opt.noaa = true; else if (a.startsWith("--")) opt[a.slice(2)] = argv[++i]; }
const [W, H] = opt.size.split("x").map(Number);
fs.mkdirSync(opt.out, { recursive: true });

// east,north,bearing,tilt[,height] as ?at=
const SPOTS = {
  "abbey-yard": "-1010,2105,90,0",
  "roman-baths": "-990,2015,0,0",
  "grand-parade": "-930,2220,45,0",
  "southgate": "-961,1782,0,0",
  "prior-park": "154,400,180,-3",
  "combe-down": "0,0,90,0",
  "town-aerial": "-950,1850,0,-20,80",
  "stall-street": "-1053,2075,355,0",
  "milsom-street": "-1165,2470,345,0",
  "wooded-road": "559,1318,300,0",
  "widcombe-hill": "-200,1392,290,-3",
};
// novillage: hide the village's whole-area merged meshes (each nearly 2 km across, so never culled), to
// see what cutting them into pieces the camera can cull would save out in town
const VARIANTS = ["base", "noshadow", "shadow2", "shadow1024", "nolights", "novillage", "res360", "res270", "resfull", "fx0", "view600", "view1200", "pr1", "all"];
const spots = opt.spots === "none" ? [] : opt.spots ? opt.spots.split(",") : Object.keys(SPOTS);
// east,north points of the drive: Combe Down, Prior Park, down to Southgate, the Abbey, Grand Parade
const ROUTE = [[0, 0], [154, 400], [-961, 1782], [-1010, 2105], [-930, 2220]];
const variants = opt.variants ? opt.variants.split(",") : VARIANTS;

const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((q, res) => {
  let f = path.join(opt.dist, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const linux = process.platform === "linux";
const bundled = linux && fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null;
const exe = process.env.CHROME || bundled;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  args: [...MUTED_ARGS, "--disable-gpu-vsync", "--disable-frame-rate-limit",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
// --dpr 2 for a Retina screen: the game draws its final picture at up to 1.75 screen pixels per CSS pixel
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: +(opt.dpr ?? 1) });
await silence(page);
await page.addInitScript((noaa) => {
  if (noaa) {
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, a) { if (t === "webgl2" && this.id === "view") a = { ...(a || {}), antialias: false }; return gc.call(this, t, a); };
  }
  // time every animation frame's callback (the whole of the game's JavaScript for a frame)
  const raf = window.requestAnimationFrame.bind(window);
  window.__raf0 = raf;
  window.__js = 0;
  window.__tileStats = {};   // (tiles.ts fills it in)
  // (every callback in one frame gets the same timestamp, so __jsl holds each frame's whole JavaScript time)
  let lastT = -1;
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); const d = performance.now() - s; window.__js += d; const l = window.__jsl; if (l) { if (t === lastT && l.length) l[l.length - 1] += d; else l.push(d); } lastT = t; });
}, !!opt.noaa);
const complaints = [];
console.log("renderer:", await page.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"); const i = gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(i.UNMASKED_RENDERER_WEBGL) + (gl.getExtension("EXT_disjoint_timer_query_webgl2") ? " (GPU timer)" : " (no GPU timer)"); }).catch((e) => String(e)));
page.on("pageerror", (e) => { complaints.push(`error: ${e.message}`); console.log("pageerror", e.message); });
page.on("console", (m) => { if (m.type() === "error") console.log("console", m.text().slice(0, 200)); });

const q = new URLSearchParams({ map: "combe-down", time: "11:00", at: SPOTS[spots[0] ?? "combe-down"], ...Object.fromEntries(new URLSearchParams(opt.query ?? "")) });
await page.goto(`http://127.0.0.1:${port}/?${q}`);
await page.evaluate(() => { window.__budget = 40; try { localStorage.clear(); } catch {} });
await page.waitForFunction(() => window.__dbg !== undefined, null, { timeout: 180000 });
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 180000 });
await page.addStyleTag({ content: "#menu,#pause,.toast{display:none!important}" });
// hold the player and camera at the spot, and count what's drawn
await page.evaluate((at) => { window.__at = at; }, SPOTS[spots[0] ?? "combe-down"]);
await page.evaluate(() => {
  const g = window.__game(), u = g.update.bind(g), r = window.__renderer;
  const S = (window.__S = { upd: 0, shadow: 0, render: 0, calls: 0, tris: 0, shCalls: 0, shTris: 0, frames: 0, kinds: {}, shKinds: {} });
  g.update = (dt) => {
    const at = window.__route ? window.__route.at() : window.__at, m = g.map, t0 = performance.now();
    const [e, n, b = 0, t = 0, h = 1.7] = at.split(",").map(Number), x = e, z = -n;
    g.player.pos.set(x, m.ground(x, z), z);
    u(dt);
    g.camera.position.set(x, m.ground(x, z) + h, z);
    g.camera.rotation.set(t * Math.PI / 180, -b * Math.PI / 180, 0, "YXZ");
    g.camera.updateMatrixWorld();
    S.upd += performance.now() - t0; S.frames++;
  };
  let inShadow = false, pass = "main";
  // GPU time per pass (EXT_disjoint_timer_query_webgl2): one query open at a time, so the shadow map
  // closes the main pass's query and opens it again after
  const gl = r.getContext(), tq = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const G = (window.__G = { on: !!tq, pending: [], open: null, frame: 0, done: [] });
  const seg = (label) => {
    if (!tq) return;
    if (G.open) { gl.endQuery(tq.TIME_ELAPSED_EXT); G.pending.push(G.open); G.open = null; }
    if (label) { const q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); G.open = { q, label, f: G.frame }; }
  };
  G.poll = () => {
    if (!tq) return;
    const disjoint = gl.getParameter(tq.GPU_DISJOINT_EXT), keep = [];
    for (const p of G.pending) {
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) { keep.push(p); continue; }
      if (!disjoint) G.done.push([p.f, p.label, gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6]);
      gl.deleteQuery(p.q);
    }
    G.pending = keep;
  };
  const sm = r.shadowMap, smr = sm.render.bind(sm);
  sm.render = (...a) => { const t0 = performance.now(); inShadow = true; const was = G.open?.label; seg("shadow"); smr(...a); seg(was); inShadow = false; S.shadow += performance.now() - t0; };
  const rr = r.render.bind(r);
  r.render = (scene, cam) => {
    const t0 = performance.now(), gm = window.__game();
    pass = scene === gm.world.scene ? "main" : scene === gm.weapon?.scene ? "weapon" : "post";
    seg(pass); rr(scene, cam); seg(null);
    S.render += performance.now() - t0;
  };
  const raf0 = window.__raf0;
  const tick = () => { G.frame++; G.poll(); raf0(tick); };
  raf0(tick);
  const rbd = r.renderBufferDirect.bind(r);
  // what a draw is of: the nearest named thing above it, else its material's type
  // things the game adds outside the squares carry no name: label each by the field of the game
  // (or of one of its parts) that holds it, e.g. "traffic", "naughty", "pickups"
  const owner = new Map(), scene = g.world.scene;
  const top = (o) => { while (o.parent && o.parent !== scene) o = o.parent; return o.parent === scene ? o : null; };
  const label = () => {
    const seen = new Set();
    const dig = (v, k, d) => {
      if (!v || typeof v !== "object" || seen.has(v) || d > 4) return;
      seen.add(v);
      if (v.isObject3D) { const t = top(v); if (t && !t.name && !owner.has(t)) owner.set(t, k); return; }
      if (v.isMaterial || v.isBufferGeometry || v.isTexture || ArrayBuffer.isView(v)) return;
      const vals = v instanceof Map ? [...v.values()] : v instanceof Set ? [...v] : Array.isArray(v) ? v : Object.values(v);
      for (const x of vals.slice(0, 400)) dig(x, k, d + 1);
    };
    for (const [k, v] of Object.entries(g)) if (k !== "world" && k !== "map") dig(v, k, 0);
  };
  window.__label = label; label();
  const kind = (o, mat) => {
    for (let p = o; p; p = p.parent) if (p.name) return p.name;
    const t = top(o); if (t && owner.has(t)) return "game." + owner.get(t);
    return `${o.isInstancedMesh ? "inst " : ""}${mat.type}${mat.map ? "+map" : ""}`;
  };
  r.renderBufferDirect = (cam, scene, geo, mat, obj, grp) => {
    const n = geo.index ? geo.index.count : geo.attributes.position?.count ?? 0;
    const inst = obj.isInstancedMesh ? obj.count : 1;
    const tris = (grp ? grp.count : n) / 3 * inst;
    if (S.census && !inShadow) { let top = obj; while (top.parent && top.parent.parent) top = top.parent; const k = `${geo.type}|${mat.type}${mat.color ? " #" + mat.color.getHexString() : ""}|top ${top.name || top.type}(${top.children.length})${obj.isInstancedMesh ? "|inst" : ""}`; S.groups[k] = (S.groups[k] ?? 0) + 1; }
    if (S.grab) { const e = (S.objs[obj.uuid] ??= { tris: 0, sh: 0, calls: 0, mat: mat.type + (mat.map ? "+map" : "") + (mat.color ? " #" + mat.color.getHexString() : ""), inst: obj.isInstancedMesh ? obj.count : 0, r: Math.round(geo.boundingSphere?.radius ?? -1), d: Math.round(obj.getWorldPosition ? Math.hypot(obj.matrixWorld.elements[12] + (geo.boundingSphere?.center.x ?? 0) - cam.position.x, obj.matrixWorld.elements[14] + (geo.boundingSphere?.center.z ?? 0) - cam.position.z) : -1), depth: (() => { let n = 0; for (let p = obj.parent; p; p = p.parent) n++; return n; })(), tag: obj.userData?.tag ?? obj.parent?.userData?.tag ?? "" }); if (inShadow) e.sh += tris; else { e.tris += tris; e.calls++; } }
    const k = kind(obj, mat), K = inShadow ? S.shKinds : S.kinds;
    const e = (K[k] ??= [0, 0]); e[0]++; e[1] += tris;
    if (inShadow) { S.shCalls++; S.shTris += tris; } else { S.calls++; S.tris += tris; }
    const P = ((S.passes ??= {})[inShadow ? "shadow" : pass] ??= [0, 0]); P[0]++; P[1] += tris;
    return rbd(cam, scene, geo, mat, obj, grp);
  };
});

const setv = (id, v) => page.evaluate(([id, v]) => {
  const el = document.getElementById(id);
  if (el.type === "checkbox") el.checked = v; else el.value = String(v);
  el.dispatchEvent(new Event("change"));
}, [id, v]);
async function apply(v) {
  // back to the defaults first
  await setv("set-shadows", true); await setv("set-res", 2); await setv("set-view", 900); await setv("set-fx", true);
  await page.evaluate(() => { const r = window.__renderer; r.setPixelRatio(Math.min(devicePixelRatio, 1.75)); dispatchEvent(new Event("resize")); lights(true); function lights(on) { window.__game().world.scene.traverse((o) => { if ((o.isPointLight || o.isSpotLight)) o.visible = on; }); window.__game().world.scene.traverse((o) => { const m = o.material; if (m) for (const x of [].concat(m)) x.needsUpdate = true; }); } window.__lights = lights; });
  await page.evaluate((v) => {
    const w = window.__game().world, sun = w.sun, size = v === "shadow1024" ? 1024 : 2048;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    // (layers rather than visible, which the distance culler keeps setting)
    for (const o of w.scene.children) if (o.isMesh && o.material?.type === "MeshLambertMaterial" && o.geometry?.boundingSphere?.radius > 1500) o.layers.mask = v === "novillage" ? 0 : 1;
  }, v);
  // shadow2: the shadow map redrawn every other frame instead of every frame
  await page.evaluate((on) => {
    const sm = window.__renderer.shadowMap;
    window.__sh0 ??= sm.autoUpdate;   // the game's own setting, put back for the other variants
    window.__sh2 = on; sm.autoUpdate = on ? false : window.__sh0; sm.needsUpdate = true;
    if (on && !window.__sh2loop) { window.__sh2loop = true; let k = 0; const f = () => { if (window.__sh2) { if (++k % 2) sm.needsUpdate = true; } requestAnimationFrame(f); }; requestAnimationFrame(f); }
  }, v === "shadow2");
  if (v === "noshadow" || v === "all") await setv("set-shadows", false);
  if (v === "res360" || v === "all") await setv("set-res", 1);
  if (v === "res270") await setv("set-res", 0);
  if (v === "resfull") await setv("set-res", 4);
  if (v === "fx0") await setv("set-fx", false);
  if (v === "all") await setv("set-view", 600);
  // viewNNNN: that draw distance, metres (view600, view3000, view6000 ...)
  if (/^view\d+$/.test(v)) await setv("set-view", +v.slice(4));
  if (v === "pr1") await page.evaluate(() => { window.__renderer.setPixelRatio(1); dispatchEvent(new Event("resize")); });
  if (v === "nolights" || v === "all") await page.evaluate(() => window.__lights(false));
  // odd: one of the strange objects (oddments.ts) lying at your feet; carry: in your hands; none: neither
  await page.evaluate(async (v) => {
    const g = window.__game(), o = g.oddments, me = () => g.woodMe();
    if (o.carrying(g.net.selfId)) { o.asked = 0; o.drop(me(), true); }
    if (v === "zones") { o.openZone(g.zones.count, true); return; }
    if (v !== "odd" && v !== "carry") { for (const x of o.s.o) x[1] = 1e6; o.paint(); return; }
    o.spawnNear(1, true);
    await new Promise((r) => setTimeout(r, 300));
    // (lying 5 m ahead of you, in view, rather than under your feet)
    if (v === "odd") { const c = g.camera, f = new c.position.constructor(0, 0, -5).applyQuaternion(c.quaternion); for (const x of o.s.o) if (!x[4]) { x[1] += f.x; x[3] += f.z; } o.paint(); }
    if (v === "carry") { o.asked = 0; o.use(me(), true); }
  }, v);
}
async function settle(ms = 120000) {
  await page.evaluate(() => { window.__calm = null; });
  return page.waitForFunction(() => {
    if (window.__tilesPending !== 0) { window.__calm = null; return false; }
    const c = (window.__calm ??= { frames: 0, t: performance.now() });
    return ++c.frames >= 12 && performance.now() - c.t > 800;
  }, null, { timeout: ms, polling: "raf" }).then(() => true, () => false);
}
// --profile: a CPU profile of each spot's base measurement, summed by function (build with
// `npx vite build --minify false` for readable names); --throttle 4 slows the page's CPU that many
// times, a rough stand-in for a phone's
const cdp = await page.context().newCDPSession(page);
if (opt.throttle) await cdp.send("Emulation.setCPUThrottlingRate", { rate: +opt.throttle });
async function profiled(fn) {
  await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start");
  const m = await fn();
  const { profile } = await cdp.send("Profiler.stop");
  const self = {}, total = profile.samples.length, byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const counts = {}; for (const id of profile.samples) counts[id] = (counts[id] ?? 0) + 1;
  for (const [id, c] of Object.entries(counts)) { const f = byId.get(+id).callFrame; const k = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}`; self[k] = (self[k] ?? 0) + c; }
  m.profileTop = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, c]) => [k, +(100 * c / total).toFixed(1)]);
  return m;
}
async function measure() {
  await page.evaluate(() => { window.__label(); const S = window.__S; for (const k of ["upd", "shadow", "render", "calls", "tris", "shCalls", "shTris", "frames"]) S[k] = 0; S.kinds = {}; S.shKinds = {}; S.passes = {}; window.__G.done = []; window.__js = 0; window.__jsl = []; window.__t0 = performance.now(); window.__iv = []; let l = performance.now(); const f = () => { if (!window.__iv) return; const n = performance.now(); window.__iv.push(n - l); l = n; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.waitForTimeout(+opt.secs * 1000);
  return page.evaluate(() => {
    const S = window.__S, n = Math.max(1, S.frames), secs = (performance.now() - window.__t0) / 1000;
    const iv = window.__iv.slice(1).sort((a, b) => a - b); window.__iv = null;
    const pc = (a, p) => +(a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0).toFixed(1);
    const jsl = (window.__jsl ?? []).sort((a, b) => a - b); window.__jsl = null;
    // GPU: per pass, averaged over the frames measured; per frame, its passes summed
    const gp = {}, gf = {};
    for (const [f, label, ms] of window.__G.done) { gp[label] = (gp[label] ?? 0) + ms; gf[f] = (gf[f] ?? 0) + ms; }
    const gfa = Object.values(gf).sort((a, b) => a - b), gn = Math.max(1, gfa.length);
    const passes = Object.fromEntries(Object.entries(S.passes).map(([k, [c, t]]) => [k, [+(c / n).toFixed(1), Math.round(t / n)]]));
    const top = (K) => Object.entries(K).sort((a, b) => b[1][0] - a[1][0]).slice(0, 20).map(([k, [c, t]]) => [k, +(c / n).toFixed(1), Math.round(t / n)]);
    return {
      fps: +(S.frames / secs).toFixed(1), medMs: pc(iv, 0.5), p95Ms: pc(iv, 0.95), p99Ms: pc(iv, 0.99), worstMs: pc(iv, 1),
      jsP50: pc(jsl, 0.5), jsP95: pc(jsl, 0.95),
      gpuMs: +(gfa.reduce((a, b) => a + b, 0) / gn).toFixed(2), gpuP95: pc(gfa, 0.95),
      gpuPass: Object.fromEntries(Object.entries(gp).map(([k, v]) => [k, +(v / gn).toFixed(2)])), passes,
      jsMs: +(window.__js / n).toFixed(2), updMs: +(S.upd / n).toFixed(2), shadowMs: +(S.shadow / n).toFixed(2), renderMs: +((S.render - S.shadow) / n).toFixed(2),
      calls: Math.round(S.calls / n), tris: Math.round(S.tris / n), shCalls: Math.round(S.shCalls / n), shTris: Math.round(S.shTris / n),
      progs: window.__renderer.info.programs.length, top: top(S.kinds), shTop: top(S.shKinds),
    };
  });
}

const out = { started: new Date().toISOString(), size: opt.size, noaa: !!opt.noaa, ua: await page.evaluate(() => navigator.userAgent), results: {} };
for (const s of spots) {
  await page.evaluate((at) => { window.__at = at; }, SPOTS[s]);
  await apply("base");
  const ready = await settle();
  out.results[s] = { ready };
  for (const v of variants) {
    await apply(v);
    // a longer draw distance has more squares to build first: wait for them, and say how long they took
    const t0 = Date.now(), long = /^view\d+$/.test(v) && +v.slice(4) > 900;
    const built = long ? await settle() : true, loadS = +((Date.now() - t0) / 1000).toFixed(1);
    await page.waitForTimeout(1200);
    const m = opt.profile && (v === "base" || v === "zones") ? await profiled(measure) : await measure();
    if (m.profileTop) { console.log("   self time, % of samples:"); for (const [k, c] of m.profileTop.slice(0, 30)) console.log(`     ${String(c).padStart(5)}  ${k}`); }
    if (long) Object.assign(m, { built, loadS });
    m.heapMB = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6));
    m.gpuMB = await page.evaluate(() => { const i = window.__renderer.info.memory; return { geometries: i.geometries, textures: i.textures }; });
    out.results[s][v] = m;
    console.log(`${s.padEnd(13)} ${v.padEnd(9)} ${String(m.fps).padStart(6)} fps  med ${m.medMs} p95 ${m.p95Ms} p99 ${m.p99Ms} worst ${m.worstMs} ms | gpu ${m.gpuMs} (p95 ${m.gpuP95}) ${JSON.stringify(m.gpuPass)} | js p50 ${m.jsP50} p95 ${m.jsP95} | passes ${JSON.stringify(m.passes)} | js ${m.jsMs} (upd ${m.updMs}, shadow ${m.shadowMs}, draw ${m.renderMs}) | calls ${m.calls} + ${m.shCalls} shadow, tris ${Math.round(m.tris / 1000)}k + ${Math.round(m.shTris / 1000)}k | heap ${m.heapMB} MB, ${m.gpuMB.geometries} geoms${m.loadS !== undefined ? ` | built in ${m.loadS} s${m.built ? "" : " (NOT all built)"}` : ""}`);
    if (v === "base") { console.log("   draws by kind (calls, ktris):", m.top.map(([k, c, t]) => `${k} ${c}/${Math.round(t / 1000)}`).join(", ")); console.log("   shadow draws by kind:", m.shTop.map(([k, c, t]) => `${k} ${c}/${Math.round(t / 1000)}`).join(", ")); }
  }
  out.results[s].biggest = await page.evaluate(async () => { const S = window.__S; S.objs = {}; S.grab = true; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); S.grab = false; return Object.values(S.objs).sort((a, b) => (b.tris + b.sh) - (a.tris + a.sh)).slice(0, 40); });
  // what the draws are of, what's in the scene, and what keeping its positions up to date costs each frame
  out.results[s].census = await page.evaluate(async () => {
    const S = window.__S; S.groups = {}; S.census = true;
    await new Promise((r) => requestAnimationFrame(r)); S.census = false;
    const scene = window.__game().world.scene;
    const c = { objects: 0, meshes: 0, shownMeshes: 0, autoMatrix: 0, lights: 0, groupsTop: 0 };
    const walk = (o, shown) => { c.objects++; shown = shown && o.visible; if (o.isMesh) { c.meshes++; if (shown) c.shownMeshes++; } if (o.matrixAutoUpdate) c.autoMatrix++; if (o.isLight) c.lights++; for (const k of o.children) walk(k, shown); };
    walk(scene, true); c.groupsTop = scene.children.length;
    let t = performance.now(); for (let i = 0; i < 20; i++) scene.updateMatrixWorld(); c.matrixMs = +((performance.now() - t) / 20).toFixed(3);
    c.draws = Object.entries(S.groups).sort((a, b) => b[1] - a[1]).slice(0, 40);
    return c;
  });
  { const c = out.results[s].census; console.log(`${s} census: ${c.objects} objects, ${c.meshes} meshes (${c.shownMeshes} shown), ${c.autoMatrix} with auto matrices, ${c.lights} lights, matrix update ${c.matrixMs} ms`); for (const [k, n] of c.draws.slice(0, 25)) console.log(`   ${String(n).padStart(4)}  ${k}`); }
  await page.screenshot({ path: path.join(opt.out, `${s}.png`), timeout: 120000 }).catch(() => {});
}
if (opt.hops) {
  out.hops = [];
  for (const spot of opt.hops.trim().split(/\s+/)) {
    await page.evaluate((at) => {
      delete window.__budget;
      window.__route = null; window.__at = `${at},0,0`; window.__tileStats = {}; window.__sliceMax = {};
      const parts = (window.__parts = {}), sc = window.__game().world.scene, seen = new Set(sc.children.filter((o) => o.userData?.square).map((o) => o.userData.square.join("_")));
      const f = () => { for (const o of sc.children) if (o.userData?.square && o.userData.buildMs && !seen.has(o.userData.square.join("_"))) parts[o.userData.square.join("_")] = { ...o.userData.buildMs }; if (window.__parts === parts) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    }, spot);
    const t0 = Date.now();
    // (the game sees the move a frame or two later: wait for it to start building before waiting for it to finish)
    await page.waitForFunction(() => window.__tilesPending > 0, null, { timeout: 15000, polling: "raf" }).catch(() => {});
    const ok = await settle(600000);
    const r = await page.evaluate(() => { const p = window.__parts; window.__parts = null; return { parts: p, stats: window.__tileStats, most: window.__sliceMax }; });
    r.spot = spot; r.secs = (Date.now() - t0) / 1000; r.settled = ok;
    out.hops.push(r);
    console.log(`hop to ${spot}: ${Object.keys(r.parts).length} squares built in ${r.secs.toFixed(1)} s${ok ? "" : " (not settled)"}; longest slice by part ${JSON.stringify(r.most)}`);
    for (const [k, e] of Object.entries(r.parts)) {
      const st = r.stats[k.replace("_", ",")] ?? {}, all = Object.values(e).reduce((a, b) => a + b, 0);
      console.log(`   square ${k.padEnd(6)} main thread ${all.toFixed(0)} ms (sheet ${((e.sheet ?? 0) + (e["sheet-triangulate"] ?? 0)).toFixed(0)} ms), longest slice ${(st.buildMax ?? 0).toFixed(1)} ms, ${st.slices ?? 0} slices`);
    }
  }
}
if (opt.route) {
  const speed = +(opt.speed ?? 20);
  // how long the browser takes to read a square's file (on the main thread, outside the building budget)
  out.parse = await page.evaluate(async () => {
    const r = [];
    for (const k of ["0_0", "-1_2", "-2_2", "1_4"]) {
      const txt = await (await fetch(`maps/combe-down/${k}.json`)).text().catch(() => "");
      if (!txt) continue;
      const t0 = performance.now(); JSON.parse(txt); r.push({ square: k, mb: +(txt.length / 1e6).toFixed(2), parseMs: +(performance.now() - t0).toFixed(1) });
    }
    return r;
  });
  console.log("reading a square's file:", out.parse.map((p) => `${p.square} ${p.mb} MB in ${p.parseMs} ms`).join(", "));
  out.route = {};
  for (const dir of ["out", "back"]) {
    const pts = dir === "out" ? ROUTE : [...ROUTE].reverse();
    // stand at the start until everything round it is built (quickly), then drive with the game's own budget
    await page.evaluate((p) => { window.__route = null; window.__at = `${p[0]},${p[1]},0,0`; window.__budget = 40; }, pts[0]);
    await apply("base");
    await settle();
    const res = await page.evaluate(([pts, speed]) => new Promise((done) => {
      delete window.__budget;
      const segs = []; let L = 0;
      for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, l, at: L }); L += l; }
      const t0 = performance.now();
      window.__route = { at() {
        const s = Math.min(L, (performance.now() - t0) / 1000 * speed), g = segs.find((g) => s <= g.at + g.l) ?? segs[segs.length - 1], f = (s - g.at) / g.l;
        const e = g.a[0] + (g.b[0] - g.a[0]) * f, n = g.a[1] + (g.b[1] - g.a[1]) * f;
        return `${e},${n},${Math.atan2(g.b[0] - g.a[0], g.b[1] - g.a[1]) * 180 / Math.PI},0`;
      } };
      window.__tileStats = {};
      window.__sliceMax = {};
      const S = window.__S; S.upd = 0; S.frames = 0;
      window.__jsl = []; const iv = []; let last = performance.now();
      const parts = (window.__parts = {}), sc = window.__game().world.scene;
      const f = () => {
        const n = performance.now(); iv.push(n - last); last = n;
        // (squares are dropped behind as we go, so their times by part are kept as they're built)
        for (const o of sc.children) if (o.userData?.square && o.userData.buildMs) parts[o.userData.square.join("_")] = { ...o.userData.buildMs };
        if ((n - t0) / 1000 * speed < L) return requestAnimationFrame(f);
        const js = window.__jsl; window.__jsl = null;
        const srt = [...iv].sort((a, b) => a - b), q = (p) => +srt[Math.min(srt.length - 1, Math.floor(srt.length * p))].toFixed(1);
        const jsr = [...js].sort((a, b) => a - b), qj = (p) => +jsr[Math.min(jsr.length - 1, Math.floor(jsr.length * p))].toFixed(1);
        const secs = (n - t0) / 1000;
        done({ metres: Math.round(L), secs: +secs.toFixed(1), fps: +(iv.length / secs).toFixed(1), med: q(0.5), p95: q(0.95), p99: q(0.99), worst: q(1),
          over17: iv.filter((x) => x > 16.7).length, over33: iv.filter((x) => x > 33.3).length, frames: iv.length,
          jsMed: qj(0.5), jsP95: qj(0.95), jsP99: qj(0.99), updMs: +(S.upd / Math.max(1, S.frames)).toFixed(2), squares: window.__tileStats });
      };
      requestAnimationFrame(f);
    }), [pts, speed]);
    await page.evaluate(() => { window.__route = null; });
    out.route[dir] = res;
    const sq = Object.entries(res.squares);
    console.log(`route ${dir} ${res.metres} m at ${speed} m/s: ${res.fps} fps, frame med ${res.med} p95 ${res.p95} p99 ${res.p99} worst ${res.worst} ms, ${res.over17} frames over 16.7 ms and ${res.over33} over 33 ms of ${res.frames}; js med ${res.jsMed} p95 ${res.jsP95} p99 ${res.jsP99} ms`);
    console.log("   long build slices:", JSON.stringify(await page.evaluate(() => { const l = window.__longBuild ?? []; window.__longBuild = []; return l; })));
    console.log("   long setup slices:", JSON.stringify(await page.evaluate(() => { const l = window.__longSetup ?? []; window.__longSetup = []; return l; })));
    // each square's building time by part (world.ts's phases, tiles.ts), and the longest slice of each part
    const parts = await page.evaluate(() => ({ parts: Object.fromEntries(Object.entries(window.__parts).map(([k, e]) => [k, Object.fromEntries(Object.entries(e).map(([p, v]) => [p || "-", +v.toFixed(1)]))])), most: window.__sliceMax }));
    res.parts = parts.parts; res.sliceMax = parts.most;
    console.log("   longest slice by part:", JSON.stringify(parts.most));
    for (const [k, e] of Object.entries(parts.parts)) console.log(`   square ${k.padEnd(6)} by part: sheet ${(e.sheet ?? 0) + (e["sheet-triangulate"] ?? 0)} ms, ${JSON.stringify(e)}`);
    for (const [k, e] of sq) console.log(`   square ${k.padEnd(6)} made ${e.made.toFixed(1)} ms, setup ${e.setup.toFixed(1)} ms (longest slice ${e.setupMax.toFixed(1)}), build ${e.build.toFixed(1)} ms (longest slice ${e.buildMax.toFixed(1)}), ${e.slices} slices`);
  }
}
console.log(await silenceNote(page));
out.complaints = [...new Set(complaints)];
fs.writeFileSync(path.join(opt.out, "probe.json"), JSON.stringify(out, null, 1));
await browser.close();
server.close();
