// The start screen's "Recent rooms": the games you were last in, kept in this browser only (cd-rooms),
// so one tap takes you back to a room's name. It is only a memory of where you've been: the game is
// peer to peer, so nothing here can know who is in a room now. Each browser keeps its own list.

import { newsFor } from "./paper";

const KEY = "cd-rooms";
const KEEP = 8;
const MATES = 4;

export type RecentRoom = { code: string; map: string; at: number; with: string[] };

function load(): RecentRoom[] {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(d)
      ? d.filter((r) => r && typeof r.code === "string" && typeof r.map === "string" && Number.isFinite(r.at))
          .map((r) => ({ code: r.code, map: r.map, at: r.at, with: Array.isArray(r.with) ? r.with.filter((n: unknown) => typeof n === "string").slice(0, MATES) : [] }))
      : [];
  } catch { return []; }
}

function save(rooms: RecentRoom[]) {
  try { localStorage.setItem(KEY, JSON.stringify(rooms.slice(0, KEEP))); } catch { /* storage may be blocked */ }
}

/** Note that you're in this room now, with whoever is in it (a solo game isn't a room). */
export function remember(code: string, map: string, mates: string[]) {
  if (code === "SOLO") return;
  const rooms = load().filter((r) => r.code !== code);
  rooms.unshift({ code, map, at: Date.now(), with: [...new Set(mates)].slice(0, MATES) });
  save(rooms);
}

export function forget(code: string) {
  save(load().filter((r) => r.code !== code));
}

export function recent(): RecentRoom[] {
  return load().sort((a, b) => b.at - a.at);
}

export function ago(at: number, now = Date.now()): string {
  const m = Math.floor(Math.max(0, now - at) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return d < 14 ? `${d} day${d === 1 ? "" : "s"} ago` : `${Math.floor(d / 7)} weeks ago`;
}

/** Fill the list on the start screen. `pick` rejoins; `label` is the map's name, or "" for the default map. */
export function render(into: HTMLElement, label: (map: string) => string, pick: (r: RecentRoom) => void) {
  const rooms = recent();
  into.hidden = rooms.length === 0;
  const ul = into.querySelector("ul")!;
  ul.replaceChildren();
  for (const r of rooms) {
    const li = document.createElement("li");
    const go = document.createElement("button");
    go.type = "button";
    go.className = "recentgo";
    const code = document.createElement("b");
    code.textContent = r.code;
    go.append(code);
    const where = label(r.map);
    if (where) { const s = document.createElement("span"); s.textContent = where; go.append(s); }
    if (newsFor(r.map, r.code)) {
      const n = document.createElement("i");
      n.className = "newsdot";
      n.title = "Unread news in the Chronicle";
      n.textContent = "news";
      go.append(n);
    }
    const when = document.createElement("small");
    when.textContent = [ago(r.at), r.with.length ? `with ${r.with.join(", ")}` : ""].filter(Boolean).join(", ");
    go.append(when);
    go.onclick = () => pick(r);
    const x = document.createElement("button");
    x.type = "button";
    x.className = "recentx";
    x.textContent = "×";
    x.title = x.ariaLabel = `Forget ${r.code}`;
    x.onclick = () => { forget(r.code); render(into, label, pick); };
    li.append(go, x);
    ul.append(li);
  }
}
