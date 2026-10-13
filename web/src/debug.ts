// The debug panel: F3 on a keyboard, or "Debug info" in the pause menu on a phone or iPad (and
// ?debug=1 in the address opens it from the start). It shows where you are (game coordinates, the
// real place as latitude and longitude and an OS grid reference, and which square of Bath you're
// in), how fast the game is drawing, and how your links to the other players are doing: whether
// each one goes direct or through the relay, the round trip, lost voice packets and who's talking.
// Shift+F3, or the Copy button, puts your position on the clipboard. T, or "+3 hours", moves your
// own clock on (daylight.ts), to see the streets at another time of day.
//
// Nothing here goes over the network: every player sees their own view of their own links.
import * as THREE from "three";
import type { Game } from "./game";
import type { LinkStats } from "./net";
import { clockKind, clockText, skipHours } from "./daylight";

declare const __BUILD__: number;

const KM_LAT = 110574;                       // metres in a degree of latitude, as the map tools use (tools/prep_map.py)

/** Data coordinates (metres east and north of the map's centre) back to latitude and longitude. */
function toLatLon(centre: [number, number], east: number, north: number): [number, number] {
  const [lon0, lat0] = centre;
  return [lat0 + north / KM_LAT, lon0 + east / (111320 * Math.cos(lat0 * Math.PI / 180))];
}

/**
 * GPS latitude and longitude to an Ordnance Survey grid reference: easting and northing in metres,
 * and the two letters with ten figures (to the metre), e.g. "ST 75874 62061". The GPS position is
 * moved onto the older Airy ellipsoid the OS grid is drawn on (a Helmert shift, good to a few
 * metres), then projected onto the grid.
 */
export function osGrid(lat: number, lon: number): { e: number; n: number; ref: string } {
  const rad = Math.PI / 180;
  // to earth-centred x, y, z on the GPS (WGS84) ellipsoid
  let a = 6378137, b = 6356752.314245, e2 = 1 - (b * b) / (a * a);
  let phi = lat * rad, lam = lon * rad;
  let nu = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const x1 = nu * Math.cos(phi) * Math.cos(lam), y1 = nu * Math.cos(phi) * Math.sin(lam), z1 = nu * (1 - e2) * Math.sin(phi);
  // shift onto OSGB36
  const tx = -446.448, ty = 125.157, tz = -542.06, s = 20.4894e-6;
  const sec = rad / 3600, rx = -0.1502 * sec, ry = -0.247 * sec, rz = -0.8421 * sec;
  const x2 = tx + x1 * (1 + s) - y1 * rz + z1 * ry;
  const y2 = ty + x1 * rz + y1 * (1 + s) - z1 * rx;
  const z2 = tz - x1 * ry + y1 * rx + z1 * (1 + s);
  // back to latitude and longitude, on the Airy ellipsoid
  a = 6377563.396; b = 6356256.909; e2 = 1 - (b * b) / (a * a);
  const p = Math.hypot(x2, y2);
  phi = Math.atan2(z2, p * (1 - e2));
  for (let i = 0; i < 6; i++) { nu = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2); phi = Math.atan2(z2 + e2 * nu * Math.sin(phi), p); }
  lam = Math.atan2(y2, x2);
  // and onto the grid (a transverse Mercator projection centred on 2°W)
  const F0 = 0.9996012717, phi0 = 49 * rad, lam0 = -2 * rad, N0 = -100000, E0 = 400000;
  const n = (a - b) / (a + b), n2 = n * n, n3 = n2 * n;
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi), t2 = tan * tan, t4 = t2 * t2;
  nu = a * F0 / Math.sqrt(1 - e2 * sin * sin);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sin * sin, 1.5), eta2 = nu / rho - 1;
  const dp = phi - phi0, sp = phi + phi0;
  const M = b * F0 * ((1 + n + 1.25 * n2 + 1.25 * n3) * dp - (3 * n + 3 * n2 + 21 / 8 * n3) * Math.sin(dp) * Math.cos(sp)
    + (15 / 8 * n2 + 15 / 8 * n3) * Math.sin(2 * dp) * Math.cos(2 * sp) - 35 / 24 * n3 * Math.sin(3 * dp) * Math.cos(3 * sp));
  const I = M + N0, II = nu / 2 * sin * cos, III = nu / 24 * sin * cos ** 3 * (5 - t2 + 9 * eta2);
  const IIIA = nu / 720 * sin * cos ** 5 * (61 - 58 * t2 + t4);
  const IV = nu * cos, V = nu / 6 * cos ** 3 * (nu / rho - t2);
  const VI = nu / 120 * cos ** 5 * (5 - 18 * t2 + t4 + 14 * eta2 - 58 * t2 * eta2);
  const dl = lam - lam0;
  const N = I + II * dl ** 2 + III * dl ** 4 + IIIA * dl ** 6;
  const E = E0 + IV * dl + V * dl ** 3 + VI * dl ** 5;
  // the two letters name the 100 km square
  const e100 = Math.floor(E / 100000), n100 = Math.floor(N / 100000);
  let l1 = (19 - n100) - ((19 - n100) % 5) + Math.floor((e100 + 10) / 5);
  let l2 = ((19 - n100) * 5) % 25 + (e100 % 5);
  if (l1 > 7) l1++;
  if (l2 > 7) l2++;
  const pad = (v: number) => String(Math.floor(v) % 100000).padStart(5, "0");
  const ref = l1 >= 0 && l1 < 26 && l2 >= 0 && l2 < 26 ? `${String.fromCharCode(65 + l1, 65 + l2)} ${pad(E)} ${pad(N)}` : "off the grid";
  return { e: Math.round(E), n: Math.round(N), ref };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** One link's numbers last time round, to turn running totals into rates. */
interface Before { at: number; lost: number; got: number; bytesIn: number; bytesOut: number }

export class DebugPanel {
  open = false;
  private el: HTMLElement;
  private body: HTMLElement;
  private copyBtn: HTMLButtonElement;
  private gpu = "";
  // the frame clock: how long each frame took over the last second
  private times: number[] = [];
  private fps = 0; private avgMs = 0; private worstMs = 0;
  private second = 0;
  private drawT = 0;
  // the links, asked for once a second while the panel's open
  private links: LinkStats[] = [];
  private rates = new Map<string, { loss: number | null; kin: number; kout: number }>();
  private before = new Map<string, Before>();
  private asking = false;
  private linkT = 0;
  private dir = new THREE.Vector3();

  constructor(private renderer: THREE.WebGLRenderer, private camera: THREE.Camera, private game: () => Game | null) {
    this.el = document.createElement("div");
    this.el.id = "debug";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="dbar"><b>Debug</b><button type="button" data-k="copy">Copy position (Shift+F3)</button><button type="button" data-k="time">+3 hours (T)</button><button type="button" data-k="close" aria-label="Close">✕</button></div><pre></pre>`;
    document.body.append(this.el);
    this.body = this.el.querySelector("pre")!;
    this.copyBtn = this.el.querySelector('[data-k="copy"]')!;
    this.copyBtn.onclick = () => this.copy();
    (this.el.querySelector('[data-k="close"]') as HTMLButtonElement).onclick = () => this.toggle(false);
    (this.el.querySelector('[data-k="time"]') as HTMLButtonElement).onclick = () => { skipHours(3); this.drawT = 0; };
    // keep taps on the panel from reaching the game's touch controls underneath
    this.el.addEventListener("pointerdown", (e) => e.stopPropagation());
    addEventListener("keydown", (e) => {
      // the buttons can't be clicked while the mouse is steering, so each has a key too
      if (e.code === "KeyT" && this.open && !e.repeat && !(e.target instanceof HTMLInputElement)) { skipHours(3); this.drawT = 0; return; }
      if (e.code !== "F3") return;
      e.preventDefault();
      if (e.shiftKey) { if (!this.open) this.toggle(true); this.copy(); }
      else if (!e.repeat) this.toggle();
    });
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      this.gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
    } catch { /* not told */ }
    let start = new URLSearchParams(location.search).get("debug") === "1";
    try { start ||= localStorage.getItem("cd-debug") === "1"; } catch { /* storage may be blocked */ }
    if (start) this.toggle(true);
  }

  toggle(on = !this.open) {
    this.open = on;
    this.el.hidden = !on;
    try { localStorage.setItem("cd-debug", on ? "1" : "0"); } catch { /* storage may be blocked */ }
    if (on) { this.drawT = 0; this.linkT = 0; }
  }

  /** Once a frame, before anything's drawn: start counting this frame's draw calls. */
  begin() {
    if (this.open) { this.renderer.info.autoReset = false; this.renderer.info.reset(); }
    else this.renderer.info.autoReset = true;
  }

  /** Once a frame, after drawing: raw is how long the frame took, in seconds. */
  frame(raw: number) {
    if (!this.open) return;
    this.times.push(raw * 1000);
    this.second += raw;
    if (this.second >= 1) {
      const t = this.times;
      this.fps = t.length / this.second;
      this.avgMs = t.reduce((s, v) => s + v, 0) / t.length;
      this.worstMs = Math.max(...t);
      this.times = []; this.second = 0;
    }
    if ((this.linkT -= raw) <= 0) { this.linkT = 1; this.askLinks(); }
    if ((this.drawT -= raw) <= 0) { this.drawT = 0.25; this.draw(); }
  }

  /** Your position, as text to paste: the real place, then the game's coordinates. */
  where(): string | null {
    const g = this.game();
    if (!g) return null;
    const p = g.player.pos, centre = g.debugInfo().map.d.centre;
    const [lat, lon] = toLatLon(centre, p.x, -p.z);
    return `${lat.toFixed(6)}, ${lon.toFixed(6)} (${osGrid(lat, lon).ref}) game ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
  }

  private async copy() {
    const text = this.where();
    if (!text) return;
    let ok = true;
    try { await navigator.clipboard.writeText(text); }
    catch {
      // older browsers, or no permission: the old way
      const t = document.createElement("textarea");
      t.value = text; document.body.append(t); t.select();
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      t.remove();
    }
    this.copyBtn.textContent = ok ? "Copied" : "Couldn't copy";
    this.game()?.toast(ok ? `Copied: ${text}` : text, 3);
    setTimeout(() => (this.copyBtn.textContent = "Copy position (Shift+F3)"), 1500);
  }

  private async askLinks() {
    const g = this.game();
    if (!g || this.asking) return;
    this.asking = true;
    try {
      const links = await g.net.linkStats();
      const now = performance.now();
      for (const l of links) {
        const b = this.before.get(l.id);
        const lost = l.lost ?? 0, got = l.got ?? 0;
        if (b) {
          const secs = Math.max(0.1, (now - b.at) / 1000), dLost = lost - b.lost, dGot = got - b.got;
          this.rates.set(l.id, {
            loss: l.lost === null ? null : dLost + dGot > 0 ? (100 * dLost) / (dLost + dGot) : 0,
            kin: (8 * (l.bytesIn - b.bytesIn)) / 1000 / secs, kout: (8 * (l.bytesOut - b.bytesOut)) / 1000 / secs,
          });
        }
        this.before.set(l.id, { at: now, lost, got, bytesIn: l.bytesIn, bytesOut: l.bytesOut });
      }
      for (const id of [...this.before.keys()]) if (!links.some((l) => l.id === id)) { this.before.delete(id); this.rates.delete(id); }
      this.links = links;
    } catch { /* try again next second */ }
    this.asking = false;
  }

  private draw() {
    const g = this.game(), r = this.renderer, info = r.info, rows: string[] = [];
    const ms = (v: number | null) => (v === null ? "–" : `${Math.round(v)} ms`);
    const mem = (performance as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    const built = new Date(__BUILD__);
    const buf = r.getDrawingBufferSize(new THREE.Vector2());
    rows.push(`<b>${this.fps.toFixed(this.fps < 10 ? 1 : 0)} fps</b>  ${this.avgMs.toFixed(1)} ms a frame, worst ${this.worstMs.toFixed(0)} ms  draw calls ${info.render.calls}`);
    if (g) {
      const d = g.debugInfo(), p = g.player.pos, m = d.map;
      const north = -p.z, [lat, lon] = toLatLon(m.d.centre, p.x, north), os = osGrid(lat, lon);
      this.camera.getWorldDirection(this.dir);
      const bearing = (Math.atan2(this.dir.x, -this.dir.z) * 180 / Math.PI + 360) % 360;
      const [bx0, by0, bx1, by1] = m.d.b;
      const I = m.tileIndex;
      const village = p.x >= bx0 && p.x <= bx1 && north >= by0 && north <= by1;
      let square = village ? esc(m.d.name ?? "the village") : "out past the squares";
      if (I) {
        const S = I.cells * I.dx, ti = Math.floor((p.x - I.x0) / S), tj = Math.floor((north - I.y0) / S);
        square = `${ti}_${tj}${village ? ` (${esc(m.d.name ?? "the village")})` : m.tileAt(p.x, p.z) ? "" : " (not loaded)"}, ${m.tiles.size} loaded`;
      }
      rows.push("");
      rows.push(`<b>Position</b>`);
      rows.push(`game  x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}`);
      rows.push(`      ${p.x.toFixed(0)} m east, ${north.toFixed(0)} m north of the centre, ${(p.y + m.z0).toFixed(0)} m above sea level`);
      rows.push(`real  ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
      rows.push(`OS    ${os.ref}  (${os.e}, ${os.n})`);
      rows.push(`facing ${bearing.toFixed(0)}° ${COMPASS[Math.round(bearing / 45) % 8]}  square ${square}`);
      rows.push(`map ${esc(d.mapId)} (${esc(m.d.release)})`);
      rows.push(`time ${clockText()}  clock ${clockKind()}`);

      const net = g.net, v = g.voice;
      rows.push("");
      rows.push(`<b>Network</b>  ${net.kind === "local" ? "tabs in this browser" : "peer to peer"}  room ${esc(g.room)}`);
      rows.push(`me ${esc(net.selfId)} (${esc(g.name)})${d.host === net.selfId ? " · host" : ""}  mic ${!v.available ? "n/a" : v.micOn ? (v.mode === 2 ? "radio" : "open") : "off"}`);
      const relays = net.relays();
      if (relays) rows.push(`signalling relays ${relays.up} of ${relays.all} connected`);
      rows.push(`${d.players.length} player${d.players.length === 1 ? "" : "s"} here${d.elsewhere.length ? `, ${d.elsewhere.length} on another map` : ""}, ${net.peers().length} link${net.peers().length === 1 ? "" : "s"}`);
      const ids = new Set([...net.peers(), ...d.players.map((q) => q.id)]);
      for (const id of ids) {
        const pl = d.players.find((q) => q.id === id), l = this.links.find((q) => q.id === id), rt = this.rates.get(id);
        const who = `${esc(pl?.name ?? "?")}${id === d.host ? " · host" : ""}`;
        rows.push(`  <b>${who}</b> ${esc(id.slice(0, 8))}${pl ? `  heard ${ms(pl.seen)} ago` : "  no hello yet"}${d.elsewhere.includes(id) ? " (other map)" : ""}`);
        if (!l) continue;
        const route = l.route === "relay" ? `<span class="warn">relayed</span>` : l.route === "direct" ? "direct" : l.route;
        rows.push(`    ${esc(l.state)} ${route}${l.via ? ` (${esc(l.via)})` : ""}  rtt ${ms(l.rtt)}  ping ${ms(l.ping)}`);
        if (net.media) {
          const loss = rt?.loss;
          const lossText = loss === null || loss === undefined ? "–" : `${loss.toFixed(1)}%`;
          rows.push(`    voice ${esc(v.debugState(id))}  loss ${loss !== null && loss !== undefined && loss > 3 ? `<span class="warn">${lossText}</span>` : lossText}`
            + `  jitter ${ms(l.jitter)}  ${rt ? `in ${rt.kin.toFixed(0)} out ${rt.kout.toFixed(0)} kbit/s` : ""}`);
        }
      }
    }
    rows.push("");
    rows.push(`<b>Drawing</b>`);
    rows.push(`${(info.render.triangles / 1000).toFixed(0)}k triangles; in memory ${info.memory.geometries} geometries, ${info.memory.textures} textures${mem ? `, JS ${(mem.usedJSHeapSize / 1048576).toFixed(0)} of ${(mem.jsHeapSizeLimit / 1048576).toFixed(0)} MB` : ""}`);
    rows.push(`screen ${innerWidth}×${innerHeight}, drawing ${buf.x}×${buf.y} (×${r.getPixelRatio().toFixed(2)})`);
    if (this.gpu) rows.push(`GPU ${esc(this.gpu.slice(0, 60))}`);
    rows.push(`version ${built.toISOString().slice(0, 16).replace("T", " ")} UTC`);
    this.body.innerHTML = rows.join("\n");
  }
}
