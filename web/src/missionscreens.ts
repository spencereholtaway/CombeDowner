// The screens every mission shares, so a job, a race and the bonfire all look and feel alike:
// a title card when it starts (over the crosshair, clear of the panel and of the prompts under the
// crosshair, with call-outs held back till it's gone), a panel with the goal and how far you've got
// that stays up all the way through, a banner for each stage (a wave, a clue, a checkpoint), and a
// card at the end that is a party for a win and a quiet one for a loss. All drawn here on the page
// over the game, in the look of the HUD and the race finish banner, in the HUD's own layer so they
// go when it does.
//
// Nothing here ever takes a click, and nothing goes over the network: each player's screen draws
// them from the events that player already gets (quests.ts, race.ts, bonfire.ts). The panel is
// written only when its words change, and the cards run on timers, not frames (only the confetti
// has a frame loop, and only while it is falling).
import { show } from "./show";
import { ctlText } from "./controls";

const COLOURS = ["#3ec7e8", "#ffd84a", "#ff5a7a", "#58e06a", "#ffffff", "#c99cff", "#ff9a3c"];
const ACCENT = "#3ec7e8";
const FADE = 0.8;            // seconds a card spends fading
const START_SECS = 4;        // a title card's time up: call-outs are held back while it is
const PIECES = 180;

export interface MissionStart { title: string; goal: string; detail?: string; label?: string; colour?: string; /** Your best at this kind of mission, in words ("gold", "3 stars"). */ best?: string }
export interface MissionStage { title: string; sub?: string; colour?: string; life?: number }
export interface MissionProgress {
  /** Which mission is drawing the panel (so it can take it down again and nobody else's goes). */
  id: string;
  label?: string; colour?: string;
  goal: string;
  /** "2 / 5", or a number for just a bar from 0 to 1. */
  progress?: string | number;
  /** 0..1, as well as the words. */
  bar?: number;
  timer?: string;
  /** The step you're on, in words (html). */
  hint?: string;
  sub?: string;
  /** When this changes the panel flashes, so you know where to look. */
  flash?: string;
}
export interface EndRow { name: string; time: string; colour: string; me: boolean }
export interface MissionEnd {
  result: "complete" | "failed";
  title: string;
  /** A big word under the title (a race place). */
  big?: string; gold?: boolean;
  /** Set the first line large (a time), when there is no big word. */
  lead?: boolean;
  lines: string[];
  medal?: string; best?: string;
  rows?: EndRow[];
  colour?: string;
}
export interface EndHandle { rows(rows: EndRow[]): void; remove(): void }

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `
#mprog{top:64px;bottom:auto;left:16px;width:min(320px,calc(100vw - 230px));padding-bottom:18px}
#mprog .label{letter-spacing:.12em}
#mprog.fresh{animation:mprog-flash .7s ease-in-out 4}
@keyframes mprog-flash{50%{box-shadow:0 0 0 3px var(--accent),0 0 28px var(--accent)}}
#mprog .head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
#mprog .jobtitle{font-family:var(--f-hud);font-size:21px;font-weight:800;line-height:1.05;margin:2px 0 3px}
#mprog .count{font-family:var(--f-hud);font-size:22px;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}
#mprog .timer{font-family:var(--f-hud);font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;color:#ffd84a}
#mprog .jobline{font-size:15px;line-height:1.3}
#mprog .jobline b{color:var(--accent)}
#mprog .jobline b.clue{display:inline-block;color:#fff;letter-spacing:.08em;font-size:17px;margin:2px 0}
#mprog .bar{margin-top:6px;height:8px}
#mprog .bar::after{display:none}
#mprog em{display:block;font-style:normal;color:var(--muted);font-size:13px;margin-top:4px;line-height:1.3}
#hud:has(#compass:not([hidden])) #mprog{top:96px}
@media (max-width:700px),(max-height:500px){
  #mprog{top:54px;width:min(240px,calc(100vw - 170px))}
  #mprog .jobtitle{font-size:17px}
  #mprog .count{font-size:17px}
  #mprog .jobline{font-size:13px}
  #hud:has(#compass:not([hidden])) #mprog{top:50px;left:8px}
}
.msc{position:fixed;left:0;right:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;text-align:center;
  font-family:'Barlow Condensed',Impact,sans-serif;color:#fff;text-shadow:0 3px 0 #000,0 0 18px rgba(0,0,0,.6);transition:opacity ${FADE}s}
.msc.out{opacity:0}
.msc .band{width:100%;padding:12px 16px 16px;box-sizing:border-box;background:linear-gradient(90deg,transparent,rgba(8,14,20,.82) 15%,rgba(8,14,20,.82) 85%,transparent);
  animation:msc-in .5s cubic-bezier(.2,1.6,.4,1) both}
.msc .kind{font-weight:700;font-size:clamp(13px,2.6vw,18px);letter-spacing:.2em;text-transform:uppercase}
.msc .title{font-weight:800;font-size:clamp(28px,6vw,54px);letter-spacing:.05em;line-height:1}
.msc .goal{font-weight:600;font-size:clamp(17px,3.6vw,28px);margin-top:6px;line-height:1.15}
.msc .detail{font-weight:600;font-size:clamp(13px,2.8vw,19px);margin-top:4px;color:#c8d4dc}
.msc .detail.best{color:#ffd84a}
.msc-start,.msc-stage{top:auto;bottom:calc(50% + 30px);left:50%;right:auto;transform:translateX(-50%);width:min(760px,94vw)}
#hud:has(#mprog:not([hidden])) :is(.msc-start,.msc-stage){width:clamp(260px,calc(100vw - 2 * (min(320px,100vw - 230px) + 56px)),760px)}
:is(.msc-start,.msc-stage) .title{font-size:clamp(26px,4.6vw,46px)}
:is(.msc-start,.msc-stage) .goal{font-size:clamp(15px,2.4vw,22px)}
.msc-stage .title{font-size:clamp(24px,4.4vw,40px)}
.msc-end{inset:0;top:0;justify-content:center}
.msc-end canvas{position:absolute;inset:0;width:100%;height:100%}
.msc-end .band{position:relative}
.msc-end .flag{height:14px;margin:0 auto 6px;max-width:520px;background:repeating-conic-gradient(#111 0 25%,#f4f4f2 0 50%) 0 0/14px 14px}
.msc-end .flag.b{margin:8px auto 0}
.msc-end.failed .band{background:linear-gradient(90deg,transparent,rgba(20,10,12,.85) 15%,rgba(20,10,12,.85) 85%,transparent);animation-name:msc-fade}
.msc-end.failed .title{color:#ff8a80}
.msc-end .place{font-weight:900;font-size:clamp(72px,18vw,170px);line-height:.9;animation:msc-pop 1.2s ease-in-out .4s infinite alternate}
.msc-end .place sup{font-size:.4em}
.msc-end .gold{background:linear-gradient(#fff6b0,#ffc520 55%,#c47a00);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 4px 0 #000)}
.msc-end .time{font-weight:800;font-size:clamp(26px,6vw,56px);margin-top:4px}
.msc-end .time.small{font-size:clamp(18px,3.6vw,28px);font-weight:700}
.msc-end .medal{font-weight:700;font-size:clamp(18px,4vw,30px);color:#ffd84a}
.msc-end .best{font-weight:800;font-size:clamp(18px,4vw,28px);color:#58e06a;animation:msc-blink .5s steps(2) infinite}
.msc-end table{margin:10px auto 0;border-collapse:collapse;font-weight:700;font-size:clamp(15px,3.4vw,22px);text-shadow:0 1px 2px #000}
.msc-end td{padding:1px 10px;text-align:left}
.msc-end td.t{text-align:right;font-variant-numeric:tabular-nums}
.msc-end tr.me td{color:${ACCENT}}
.msc-night{top:5%}
.msc-night .band{max-width:min(660px,94vw);margin:0 auto;padding:12px 18px 14px;background:#efe6cf;color:#1b1b1d;text-shadow:none;text-align:left;
  font-family:Georgia,serif;border:2px solid #1b1b1d;max-height:90vh;overflow:hidden}
.msc-night .kind{color:#8a2a1f;text-align:center;font-family:'Barlow Condensed',Impact,sans-serif}
.msc-night .title{font-family:'Barlow Condensed',Impact,sans-serif;font-size:clamp(26px,5.4vw,46px);line-height:1;text-align:center;margin:2px 0 4px}
.msc-night .by{font-style:italic;font-size:clamp(12px,2.4vw,15px);text-align:center;color:#555}
.msc-night .stand{font-weight:700;font-size:clamp(14px,2.8vw,18px);line-height:1.25;margin:6px 0}
.msc-night p{font-size:clamp(12px,2.4vw,15px);line-height:1.3;margin:4px 0}
.msc-night .small{display:flex;gap:10px;border-top:1px solid #1b1b1d;margin-top:8px;padding-top:6px}
.msc-night .small div{flex:1;font-size:clamp(11px,2.2vw,14px);line-height:1.25}
.msc-night .small h4{margin:0 0 2px;font-size:1em;text-transform:uppercase;letter-spacing:.06em;color:#8a2a1f}
.msc-sheet .band{position:relative}
.msc-sheet .stamp{position:absolute;right:18px;top:14px;transform:rotate(-12deg);font:800 clamp(26px,6vw,48px) 'Barlow Condensed',Impact,sans-serif;letter-spacing:.08em;border:4px solid;padding:0 10px;opacity:.85}
@media (max-width:700px),(max-height:500px){.msc-night .small{flex-direction:column;gap:4px}.msc-night{top:2%}
  .msc-start,.msc-stage{bottom:calc(50% + 22px)}
  #hud:has(#mprog:not([hidden])) :is(.msc-start,.msc-stage){width:clamp(240px,calc(100vw - 2 * (min(240px,100vw - 170px) + 40px)),760px)}
  :is(.msc-start,.msc-stage) .band{padding:6px 10px 8px}
  :is(.msc-start,.msc-stage) .title{font-size:clamp(22px,4.4vw,32px)}
  :is(.msc-start,.msc-stage) .goal{font-size:clamp(13px,2.2vw,16px);margin-top:3px}
  :is(.msc-start,.msc-stage) .detail{font-size:13px;margin-top:2px}}
@keyframes msc-in{from{transform:scale(2.2) rotate(-5deg);opacity:0}to{transform:none;opacity:1}}
@keyframes msc-fade{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}
@keyframes msc-pop{from{transform:scale(1)}to{transform:scale(1.08) rotate(-2deg)}}
@keyframes msc-blink{to{opacity:.35}}`;
  document.head.appendChild(s);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** The HUD's layer, so photo mode and a hidden HUD take these away too. */
const layer = () => document.getElementById("hud") ?? document.body;

// ---- the panel that stays up -----------------------------------------------------------------------

let panel: HTMLDivElement | null = null;
let panelId = "";
let flashKey = "";

/** The mission whose panel is up, if any. */
export const missionActive = () => (panel && !panel.hidden ? panelId : "");

/** A team's lives as hearts for a card line (html): full ones red, lost ones faint. */
export function hearts(left: number, of: number) {
  const n = Math.max(0, Math.min(of, left));
  return `<span style="color:#ff4a5a;letter-spacing:2px" aria-label="${n} of ${of} lives">${"\u2665".repeat(n)}<span style="opacity:.3">${"\u2665".repeat(of - n)}</span></span>`;
}

/** The panel with the goal and how far you've got: call it as often as you like, it only writes when something changed. */
export function missionProgress(o: MissionProgress) {
  style();
  if (!panel || !panel.isConnected) {
    panel = document.createElement("div");
    panel.id = "mprog"; panel.className = "panel"; panel.hidden = true;
    // in the HUD's left column, under the street name, so on a touch screen they stack instead of overlapping
    const stack = document.getElementById("lstack");
    if (stack) stack.insertBefore(panel, document.getElementById("bunting")); else layer().appendChild(panel);
  }
  panelId = o.id;
  const frac = typeof o.progress === "number" ? o.progress : o.bar;
  const count = typeof o.progress === "string" ? o.progress : "";
  const col = o.colour ?? ACCENT;
  const html = (o.label ? `<div class="label" style="color:${col}">${o.label}</div>` : "")
    + `<div class="head"><div class="jobtitle">${esc(ctlText(o.goal))}</div>${count ? `<div class="count" style="color:${col}">${esc(count)}</div>` : ""}</div>`
    + (o.timer ? `<div class="timer">${esc(o.timer)}</div>` : "")
    + (o.hint ? `<div class="jobline">${ctlText(o.hint)}</div>` : "")
    + (frac !== undefined ? `<div class="bar"><div style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%;background:${col}"></div></div>` : "")
    + (o.sub ? `<em>${ctlText(o.sub)}</em>` : "");
  const key = o.flash ?? "";
  if (key !== flashKey) {
    if (flashKey && key) { panel.classList.remove("fresh"); void panel.offsetWidth; panel.classList.add("fresh"); }
    flashKey = key;
  }
  show(panel, html, true);
}

/** Take the panel down, if it is this mission's. */
export function missionClear(id?: string) {
  if (!panel || (id && panelId !== id)) return;
  panelId = ""; flashKey = "";
  show(panel, "", false);
}

// ---- the cards -------------------------------------------------------------------------------------

let card: HTMLDivElement | null = null;
let cardTimer = 0, paperWait = 0;

function dropCard() {
  clearTimeout(cardTimer);
  clearTimeout(paperWait);
  card?.remove();
  card = null;
}

/** Take down the card in the middle of the screen now (a race's countdown wants the middle). */
export function missionCardDrop() { dropCard(); }

/** A title or stage card has the space over the crosshair: call-outs wait till it's gone, as they
 *  do for a race's countdown, rather than land on top of it. */
export function missionCardUp() {
  if (document.querySelector(".tsc-call:not([hidden]):not(.out)")) return true;   // a trail's or a bounty's call-out (trailscreens.ts)
  return !!card && !card.classList.contains("out") && (card.classList.contains("msc-start") || card.classList.contains("msc-stage"));
}

function putCard(cls: string, html: string, life: number, colour: string) {
  style();
  dropCard();
  const el = (card = document.createElement("div"));
  el.className = `msc ${cls}`;
  el.innerHTML = `<div class="band" style="box-shadow:inset 0 -3px 0 ${colour}">${html}</div>`;
  layer().appendChild(el);
  cardTimer = window.setTimeout(() => {
    el.classList.add("out");
    cardTimer = window.setTimeout(() => { if (card === el) dropCard(); }, FADE * 1000);
  }, life * 1000);
}

/** The Chronicle (the scoreboard panel) is up in the middle of the screen. */
const paperUp = () => { const b = document.getElementById("scoreboard"); return !!b && !b.hidden; };

/** The title card when a mission begins: its name and what you have to do. It waits for the Chronicle to be put away rather than sit on top of it. */
export function missionStart(o: MissionStart) {
  const col = o.colour ?? ACCENT;
  const html = (o.label ? `<div class="kind" style="color:${col}">${esc(o.label)}</div>` : "")
    + `<div class="title">${esc(o.title)}</div><div class="goal">${esc(ctlText(o.goal))}</div>`
    + (o.detail ? `<div class="detail">${esc(ctlText(o.detail))}</div>` : "")
    + (o.best ? `<div class="detail best">Your best: ${esc(o.best)} \u2014 beat it</div>` : "");
  dropCard();
  ending?.remove();   // the last mission's end card makes way for the new one
  if (!paperUp()) { putCard("msc-start", html, START_SECS, col); return; }
  let waited = 0;
  const poll = () => {
    if (paperUp() && (waited += 300) < 20000) { paperWait = window.setTimeout(poll, 300); return; }
    putCard("msc-start", html, START_SECS, col);
  };
  paperWait = window.setTimeout(poll, 300);
}

/** A banner between stages, levels, rounds or laps. */
export function missionStage(o: MissionStage) {
  const col = o.colour ?? ACCENT;
  putCard("msc-stage", `<div class="title" style="color:${col}">${esc(ctlText(o.title))}</div>` + (o.sub ? `<div class="goal">${esc(ctlText(o.sub))}</div>` : ""), o.life ?? 3, col);
}

// ---- the end ---------------------------------------------------------------------------------------

const nthOf = (n: number) => `${n}<sup>${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}</sup>`;
/** A race place as the big word for missionEnd: "1st". */
export const placeWord = nthOf;

interface Bit { x: number; y: number; vx: number; vy: number; a: number; va: number; w: number; h: number; c: string }

let ending: { remove(): void } | null = null;

/** The card at the end: confetti for a win, a quiet one for a loss. It goes by itself. */
export function missionEnd(o: MissionEnd): EndHandle {
  style();
  dropCard();
  ending?.remove();
  const win = o.result === "complete", life = win ? 10 : 6;
  const el = document.createElement("div");
  el.className = `msc msc-end${win ? "" : " failed"}`;
  const canvas = document.createElement("canvas");
  if (win) el.appendChild(canvas);
  const band = document.createElement("div");
  band.className = "band";
  const [main, ...rest] = o.lines;
  band.innerHTML = (win ? `<div class="flag"></div>` : "")
    + `<div class="title" style="${win ? `color:${o.colour ?? ACCENT}` : ""}">${esc(o.title)}</div>`
    + (o.big ? `<div class="place${o.gold ? " gold" : ""}">${o.big}</div>` : "")
    + (main ? `<div class="time${o.big || o.lead ? "" : " small"}">${esc(main)}</div>` : "")
    + rest.map((l) => `<div class="time small">${esc(l)}</div>`).join("")
    + (o.medal ? `<div class="medal">${esc(o.medal)}</div>` : "")
    + (o.best ? `<div class="best">${esc(o.best)}</div>` : "");
  const table = document.createElement("div");
  band.appendChild(table);
  if (win) band.insertAdjacentHTML("beforeend", `<div class="flag b"></div>`);
  el.appendChild(band);
  layer().appendChild(el);

  let dead = false, age = 0, bursts = 0;
  const bits: Bit[] = [];
  const rows = (r: EndRow[]) => {
    table.innerHTML = r.length > 1 || (r.length && !r[0].me)
      ? `<table>${r.slice(0, 8).map((x, k) => `<tr class="${x.me ? "me" : ""}"><td>${k + 1}.</td><td style="color:${x.me ? "" : x.colour}">${esc(x.name)}</td><td class="t">${esc(x.time)}</td></tr>`).join("")}</table>`
      : "";
  };
  const burst = () => {
    const W = innerWidth, H = innerHeight;
    for (let k = 0; k < PIECES / 3; k++) {
      for (const side of [0, 1]) {
        const a = side ? Math.PI * (1.2 + Math.random() * 0.25) : -Math.PI * (0.2 + Math.random() * 0.25);
        const v = 500 + Math.random() * 700;
        bits.push({ x: side ? W : 0, y: H * 0.85, vx: Math.cos(a) * v, vy: -Math.abs(Math.sin(a) * v),
          a: Math.random() * 6, va: (Math.random() - 0.5) * 14, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: COLOURS[k % COLOURS.length] });
      }
      bits.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 120,
        a: Math.random() * 6, va: (Math.random() - 0.5) * 10, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: COLOURS[(k + 3) % COLOURS.length] });
    }
    bursts++;
  };
  const remove = () => { dead = true; clearTimeout(fadeT); el.remove(); if (ending === handle) ending = null; };
  const handle: EndHandle = { rows, remove };
  ending = handle;
  rows(o.rows ?? []);
  const fadeT = window.setTimeout(() => { el.classList.add("out"); window.setTimeout(remove, FADE * 1000 + 100); }, life * 1000);
  if (win) {
    burst();
    let last = performance.now();
    const tick = (ms: number) => {
      if (dead) return;
      const dt = Math.min(0.05, (ms - last) / 1000);
      last = ms; age += dt;
      if (bursts < 3 && age > bursts * 1.6) burst();
      const W = innerWidth, H = innerHeight;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const g = canvas.getContext("2d")!;
      g.clearRect(0, 0, W, H);
      let n = 0;
      for (const b of bits) {
        b.vy += 600 * dt; b.vx *= 1 - 1.2 * dt; b.vy = Math.min(b.vy, 220);
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
        if (b.y > H + 20) continue;
        bits[n++] = b;
        g.save(); g.translate(b.x, b.y); g.rotate(b.a); g.scale(1, Math.cos(b.a * 1.7));
        g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        g.restore();
      }
      bits.length = n;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return handle;
}

/** A form filled in at the end (the driving test's report): a heading, a big stamp across it, and
 *  sections of lines. Lines are plain text. */
export function missionSheet(o: { kind: string; title: string; who: string; stamp: string; good: boolean; sections: { head: string; lines: string[] }[]; foot?: string; life?: number }) {
  const colour = o.good ? "#1f6a33" : "#a3201c";
  putCard("msc-night msc-sheet", `<div class="kind">${esc(o.kind)}</div><div class="title">${esc(o.title)}</div><div class="by">${esc(o.who)}</div>`
    + `<div class="stamp" style="color:${colour};border-color:${colour}">${esc(o.stamp)}</div>`
    + `<div class="small">${o.sections.map((x) => `<div><h4>${esc(x.head)}</h4>${x.lines.length ? x.lines.map((l) => esc(l)).join("<br>") : "None"}</div>`).join("")}</div>`
    + (o.foot ? `<div class="stand">${esc(o.foot)}</div>` : ""), o.life ?? 14, colour);
}

/** The night out's front page (nightout.ts): a newspaper card over the game, written by paper.ts. Items' text is html already escaped. */
export function missionNight(o: { pub: string; head: string; stand: string; by: string; body: string[]; items: { head: string; text: string }[] }) {
  putCard("msc-night", `<div class="kind">Last orders at ${esc(o.pub)}</div><div class="title">${esc(o.head)}</div><div class="by">${esc(o.by)}</div>`
    + `<div class="stand">${esc(o.stand)}</div>${o.body.map((p) => `<p>${esc(p)}</p>`).join("")}`
    + `<div class="small">${o.items.map((i) => `<div><h4>${i.head}</h4>${i.text}</div>`).join("")}</div>`, 16, "#8a2a1f");
}
