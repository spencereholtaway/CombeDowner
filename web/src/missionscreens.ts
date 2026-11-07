// The one set of mission screens, so a job, a race, a bounty, a challenge, the bonfire, a bus shift
// and a shoot-out all start, run and end alike. Every mode calls these and nothing of its own:
//
//   missionBegin     the title card as it starts: the job's brief (brief.ts), the same cutting you read
//                    at its noticeboard, with what to do and your best; optionally followed by a 3,
//                    2, 1, GO! of its own. missionCountdown is that countdown on its own, for a
//                    line-up that keeps time across the room.
//   missionWaiting   the banner while entries are open and racers line up.
//   missionProgress  a status panel that stays up (the goal, how far, a clock, your place in a
//                    race, the step you're on),
//                    one per mission id, stacked in the HUD's left column. missionAux is the slot
//                    under the crosshair for a mode's meter (a beat bar, a grip, a gate's clock).
//   missionCall      a stage call on the plate over the crosshair (a wave, a checkpoint, a life gone,
//                    out of lives). The other kinds of message are notice.ts's (guide, news, score,
//                    reward, people).
//   missionWatching  the banner while you watch the others after you've finished.
//   missionResult    the card at the end: a cutting from the Chronicle (cutting.ts) with the section
//                    chosen by the kind of mission, the mode's own title and words, a results table,
//                    what you won listed on it, Continue (and Again where there is one) with the
//                    same keys and 8 s timer for everything, the one end sound, and confetti for a
//                    win. The driving test's report, the night out's front page and the gallery's
//                    verdict are variants of it (missionSheet, missionNight, a body of its own).
//   missionPaper     a cutting held up low in the middle while something's read out, with nothing to
//                    press (the gallery's critics, one card each, then their marks), its words typed
//                    out and a stamp (stampHtml, the one the verdict card wears too) coming down on it.
//
// All drawn on the page in the HUD's layer, so they go when it does. Nothing goes over the
// network: each player's screen draws them from the events that player already gets. Panels are
// written only when their words change, and the cards run on timers, not frames (only the confetti
// has a frame loop, while it falls). Only the result card and the watching buttons take a press.
// Big celebrations (a zone opening, reveal.ts) keep their own look on purpose.
import { setHidden, show } from "./show";
import { ctl, ctlText, isKey } from "./controls";
import { modal, modalClicked } from "./modal";
import { cutFlag, cutFront, tearOff } from "./cutting";
import { addStyle, esc, layer, nth } from "./hudkit";
import { briefCut, briefHtml } from "./brief";
import { noticeAwardsTo, noticeHold, noticeTricksTo, readSecs, type Message, type Reward } from "./notice";
import * as SFX from "./audio";

const COLOURS = ["#3ec7e8", "#ffd84a", "#ff5a7a", "#58e06a", "#ffffff", "#c99cff", "#ff9a3c"];
const FADE = 0.8;            // seconds a banner spends fading
const START_SECS = 4;        // a title card's time up: calls are held back while it is
const CARD_SECS = 8;         // a result card's time up, unless Continue comes first
const READ_SECS = 16;        // a result to read (a report, a front page)
const PIECES = 180;

addStyle("mission", `
#mstack{display:flex;flex-direction:column;gap:8px}
.mprog{position:relative;bottom:auto;left:auto;width:100%;padding-bottom:18px;box-sizing:border-box}
.mprog[hidden]{display:none}
.mprog .label{letter-spacing:.12em}
.mprog.fresh{animation:mprog-flash .7s ease-in-out 4}
@keyframes mprog-flash{50%{box-shadow:0 0 0 3px var(--kc,var(--accent)),0 0 28px var(--kc,var(--accent))}}
.mprog .head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.mprog .jobtitle{font-size:21px;font-weight:800;line-height:1.05;margin:2px 0 3px}
.mprog .count{font-size:22px;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--kc,var(--accent))}
.mprog .timer{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;color:#ffd84a}
.mprog .jobline{font-size:15px;line-height:1.3}
.mprog .jobline b{color:var(--kc,var(--accent))}
.mprog .jobline b.clue{display:inline-block;color:#fff;letter-spacing:.08em;font-size:17px;margin:2px 0}
.mprog .place{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:6px;font-size:20px;font-weight:800;color:var(--muted);font-variant-numeric:tabular-nums;margin:2px 0}
.mprog .place b{font-size:40px;line-height:1;color:var(--kc,var(--accent));text-shadow:0 2px 0 #000}
.mprog .place sup{font-size:.45em}
.mprog .place span{font-size:13px;font-weight:700;margin-left:4px;line-height:1.2}
.mprog .bar{margin-top:6px;height:8px}
.mprog .bar::after{display:none}
.mprog .bar>div{background:var(--kc,var(--accent))}
.mprog .sign{display:inline-block;margin:5px 0 2px;padding:2px 8px;background:#d6283a;color:#fff;font-weight:800;font-size:14px;letter-spacing:.14em;text-transform:uppercase;animation:msc-blink 1s steps(2) infinite}
@keyframes msc-blink{50%{opacity:.35}}
.mprog em{display:block;font-style:normal;color:var(--muted);font-size:13px;margin-top:4px;line-height:1.3}
@media (max-width:700px),(max-height:500px){
  .mprog .jobtitle{font-size:17px}
  .mprog .count{font-size:17px}
  .mprog .place{font-size:15px}
  .mprog .place b{font-size:28px}
  .mprog .jobline{font-size:13px}
}
#maux{position:absolute;left:50%;top:calc(50% + 84px);transform:translateX(-50%);width:min(340px,calc(100vw - 32px));display:flex;flex-direction:column;align-items:center;gap:6px;
  pointer-events:none;text-align:center;font-weight:700;color:#fff;text-shadow:0 2px 3px #000}
#maux>*{width:100%;display:flex;flex-direction:column;align-items:center}
#maux>[hidden]{display:none}
#maux .aux-word{font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--kc,var(--accent));min-height:18px}
#maux .aux-big{font-size:clamp(30px,8vw,48px);font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
#maux .aux-tag{font-size:clamp(12px,3.4vw,16px);letter-spacing:.08em;text-transform:uppercase;color:#cde}
#maux .aux-meter{position:relative;width:100%;height:12px;background:rgba(0,0,0,.5);border:2px solid #fff;border-radius:7px;overflow:hidden;box-sizing:border-box}
#maux .aux-meter.thin{width:96px;height:6px;border-width:1px;border-radius:0}
#maux .aux-meter>i{position:absolute;top:0;bottom:0;left:0;display:block}
#maux>:is(#combo,#wingsbar){position:static;transform:none;margin:0;width:auto}
#maux .aux-panel{background:var(--panel);padding:6px 14px;border-bottom:3px solid var(--kc,var(--accent));min-width:260px;box-sizing:border-box}
.msc{position:fixed;left:0;right:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;text-align:center;
  font-family:var(--f-hud);color:#fff;text-shadow:0 3px 0 #000,0 0 18px rgba(0,0,0,.6);transition:opacity ${FADE}s;z-index:6}
.msc[hidden]{display:none}
.msc.out{opacity:0}
.msc .band{width:100%;padding:12px 16px 16px;box-sizing:border-box;background:linear-gradient(90deg,transparent,rgba(8,14,20,.82) 15%,rgba(8,14,20,.82) 85%,transparent);
  box-shadow:inset 0 -3px 0 var(--kc,var(--accent))}
.msc-stage .band{animation:msc-in .5s cubic-bezier(.2,1.6,.4,1) both;background:var(--panel);clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px));text-shadow:0 2px 0 #000}
.msc .kind{font-weight:700;font-size:clamp(13px,2.6vw,18px);letter-spacing:.2em;text-transform:uppercase;color:var(--kc,var(--accent))}
.msc .title{font-weight:800;font-size:clamp(28px,6vw,54px);letter-spacing:.05em;line-height:1}
.msc .goal{font-weight:600;font-size:clamp(17px,3.6vw,28px);margin-top:6px;line-height:1.15}
.msc .detail{font-weight:600;font-size:clamp(13px,2.8vw,19px);margin-top:4px;color:#c8d4dc}
.msc .detail.best{color:#ffd84a}
.msc .band b{color:var(--kc,var(--accent))}
.msc-stage{top:auto;bottom:calc(50% + 30px);left:50%;right:auto;transform:translateX(-50%);width:min(760px,94vw)}
#hud:has(.mprog:not([hidden])) .msc-stage{width:clamp(260px,calc(100vw - 2 * (min(320px,100vw - 230px) + 56px)),760px)}
.msc-stage .title{font-size:clamp(26px,4.6vw,46px)}
.msc-stage .goal{font-size:clamp(15px,2.4vw,22px)}
.msc-stage .title{font-size:clamp(24px,4.4vw,40px);color:var(--kc,var(--accent))}
.msc-brief{top:7%;left:50%;right:auto;transform:translateX(-50%)}
.msc-brief .band.brief{width:min(560px,94vw);padding:14px 22px 16px;background:none;box-shadow:none;color:var(--ink);font-family:"Old Standard TT",Georgia,serif;text-align:left;text-shadow:none;animation:cut-in .4s ease-out both}
.msc-brief .brief b{color:var(--ink)}
.msc-brief .brief .btitle{font-size:clamp(26px,4.4vw,38px)}
#hud:has(.mprog:not([hidden])) .msc-brief .band.brief{width:clamp(260px,calc(100vw - 2 * (min(320px,100vw - 230px) + 40px)),560px)}
@media (max-width:700px),(max-height:500px){.msc-brief{top:4px}#hud:has(.mprog:not([hidden])) .msc-brief .band.brief{width:clamp(240px,calc(100vw - 2 * (min(240px,100vw - 170px) + 24px)),560px)}}
.msc-wait{top:36%}
.msc-wait .band,.msc-watch .band{width:min(760px,94vw);padding:10px 16px 12px}
.msc-wait .head,.msc-watch .head{font-weight:800;font-size:clamp(30px,7vmin,64px);letter-spacing:.06em;line-height:1;text-transform:uppercase}
.msc .rsub{font-weight:700;font-size:clamp(15px,3.2vmin,26px);margin-top:4px;line-height:1.15}
.msc .small{font-weight:600;font-size:clamp(13px,2.4vmin,19px);color:#c8d4dc;margin-top:3px}
.msc-wait .dots::after{content:'';animation:msc-dots 1.2s steps(4) infinite}
.msc-wait .count{font-weight:900;font-size:clamp(34px,8vmin,72px);line-height:1;color:#ffd84a;font-variant-numeric:tabular-nums}
.msc-count{top:0;bottom:0;justify-content:center}
body:has(.msc-count:not([hidden]),.msc-wait:not([hidden])) #clickhint{visibility:hidden}
.msc-count .num{font-weight:900;font-size:clamp(150px,42vmin,420px);line-height:.85;animation:msc-punch .9s cubic-bezier(.15,1.5,.4,1) both}
.msc-count .num.go{color:var(--kc,var(--accent));font-size:clamp(130px,36vmin,360px)}
.msc-count .lights{display:flex;gap:clamp(10px,2.4vmin,22px);margin-bottom:clamp(8px,2vmin,20px);padding:clamp(6px,1.4vmin,12px) clamp(10px,2.4vmin,20px);background:#111a;border:2px solid #000;border-radius:8px}
.msc-count.plain .plate{background:var(--panel);padding:clamp(4px,1.2vmin,12px) clamp(28px,7vmin,70px) clamp(8px,2vmin,18px);border-bottom:4px solid var(--kc,var(--accent));text-shadow:0 3px 0 #000;
  clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))}
.msc-count.plain .num{font-size:clamp(90px,26vmin,260px)}
.msc-count.plain .num.go{font-size:clamp(80px,22vmin,220px)}
.msc-count .lamp{width:clamp(26px,6vmin,56px);height:clamp(26px,6vmin,56px);border-radius:50%;background:#2a1414;border:3px solid #000;box-shadow:inset 0 -4px 0 #0006}
.msc-count .lamp.red{background:radial-gradient(circle at 40% 35%,#ffb4a8,#ff2a1a 55%,#a00);box-shadow:0 0 22px #ff2a1a,inset 0 -4px 0 #0004}
.msc-count .lamp.green{background:radial-gradient(circle at 40% 35%,#d8ffd0,#38e04a 55%,#0a8a1a);box-shadow:0 0 26px #38e04a,inset 0 -4px 0 #0004}
.msc-watch{top:112px}
.msc-watch .band{width:min(620px,60vw)}
#hud:has(.msc-watch:not([hidden])) #mprog{display:none}
.msc-watch .head{font-size:clamp(26px,6vmin,54px)}
.msc-watch table{margin:6px auto 0;border-collapse:collapse;font-weight:700;font-size:clamp(13px,2.4vmin,19px)}
.msc-watch td{padding:0 8px;text-align:left}
.msc-watch td.t{text-align:right;font-variant-numeric:tabular-nums}
.msc-watch tr.me td{color:var(--kc,var(--accent))}
.msc-watch tr.watch td{color:#ffd84a}
.msc-flip{position:absolute;top:50%;pointer-events:auto;font:800 28px var(--f-hud);width:64px;height:64px;border-radius:50%;
  background:rgba(8,14,20,.7);color:#fff;border:2px solid var(--accent);box-shadow:none}
.msc-flip.l{left:14px}.msc-flip.r{right:14px}
.msc-result{inset:0;justify-content:center;background:radial-gradient(ellipse at center,rgba(4,8,12,.45),rgba(4,8,12,.72));pointer-events:auto;transition:opacity .5s;z-index:8}
.msc-result canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.msc-result .rcard{width:min(520px,94vw);max-height:94vh;overflow:auto;padding:16px 24px 20px;animation:cut-in .4s ease-out both}
.msc-result .kind{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);text-align:left;font-weight:400}
.msc-result .kind::before{content:"";display:inline-block;width:9px;height:9px;margin-right:6px;background:var(--kc,var(--ink))}
.msc-result .title{font-weight:700;font-size:clamp(28px,6vmin,40px);line-height:1.05;letter-spacing:0;margin:2px 0 10px;text-wrap:balance;text-align:left}
.msc-result .lead{display:flex;align-items:baseline;gap:16px;padding:8px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink)}
.msc-result .place,.msc-result .time{font-weight:700;font-size:clamp(28px,6.4vmin,42px);line-height:1;font-variant-numeric:tabular-nums}
.msc-result .place sup{font-size:.5em}
.msc-result .medal{margin-left:auto;font-size:16px;font-style:italic;white-space:nowrap}
.msc-result .lines{margin:8px 0 0;font-size:16px;line-height:1.4}
.msc-result .cut b{color:var(--ink)}
.msc-result table{width:100%;margin:14px 0 0;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums}
.msc-result caption{text-align:left;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding-bottom:4px}
.msc-result td{padding:4px 0;border-bottom:1px solid #d6cfbe;text-align:left}
.msc-result td.n{width:2.2em;color:var(--muted)}
.msc-result td.t{text-align:right}
.msc-result tr.me td{font-weight:700}
.msc-result tr.dnf td{color:var(--muted)}
.msc-result .stats{margin-top:10px;font-size:13px;color:var(--muted)}
.msc-result .rewards{margin:12px 0 0;padding:6px 0 0;border-top:1px solid var(--ink);list-style:none;font-size:14px;font-weight:700}
.msc-result .rewards:empty{display:none}
.msc-result .rewards::before{content:"Rewards";display:block;font-size:12px;font-weight:400;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.msc-result .rewards li{padding-left:1.1em;text-indent:-1.1em}
.msc-result .rewards li::before{content:"\\2605  ";color:var(--kc,var(--ink))}
.msc-result .rewards li.haspic::before{content:none}
.msc-result .rewards li img.pic{width:32px;height:32px;object-fit:contain;vertical-align:middle;margin:-6px 6px -6px 0}
.msc-result .go{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
.msc-result button{pointer-events:auto;font:700 15px 'Old Standard TT',Georgia,serif;letter-spacing:.02em;text-transform:none;padding:7px 16px 6px;
  color:var(--ink);background:transparent;border:1px solid var(--ink);border-radius:0;cursor:pointer;box-shadow:none;text-shadow:none;position:relative;overflow:hidden}
.msc-result button.main{background:var(--ink);color:#f5f2e9}
.msc-result button small{font-weight:400;opacity:.7}
.msc-result button .fill{position:absolute;left:0;bottom:0;height:2px;background:#f5f2e9;animation:msc-fill var(--secs,${CARD_SECS}s) linear both}
.msc-result.v-front .rcard{width:min(660px,94vw);padding:12px 22px 16px}
.msc-result.v-front .title{font-size:clamp(26px,5.4vw,44px);line-height:1.02;margin:2px 0 4px}
.msc-result .by{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.msc-result .stand{font-weight:700;font-size:clamp(14px,2.8vw,18px);line-height:1.25;margin:6px 0}
.msc-result .body p{font-size:clamp(12px,2.4vw,15px);line-height:1.3;margin:4px 0}
.msc-result .cols{display:flex;gap:12px;border-top:1px solid var(--ink);margin-top:10px;padding-top:8px}
.msc-result .cols div{flex:1;font-size:clamp(11px,2.2vw,14px);line-height:1.25}
.msc-result .cols div+div{border-left:1px solid var(--ink);padding-left:12px}
.msc-result .cols h4{margin:0 0 2px;font-size:12px;text-transform:uppercase;letter-spacing:.14em}
.msc-result .verdict{font-weight:700;font-size:15px;letter-spacing:.12em;text-transform:uppercase;margin:8px 0 0}
@media (max-width:700px),(max-height:500px){.msc-result .cols{flex-direction:column;gap:4px}.msc-result .cols div+div{border-left:0;padding-left:0}
  .msc-stage{bottom:calc(50% + 22px)}
  #hud:has(.mprog:not([hidden])) .msc-stage{width:clamp(240px,calc(100vw - 2 * (min(240px,100vw - 170px) + 40px)),760px)}
  .msc-stage .band{padding:6px 10px 8px}
  .msc-stage .title{font-size:clamp(22px,4.4vw,32px)}
  .msc-stage .goal{font-size:clamp(13px,2.2vw,16px);margin-top:3px}
  .msc-stage .detail{font-size:13px;margin-top:2px}
  .msc-watch{top:56px}.msc-watch .band{width:min(420px,56vw);padding:6px 10px 8px}.msc-watch table{display:none}}
@keyframes msc-in{from{transform:scale(2.2) rotate(-5deg);opacity:0}to{transform:none;opacity:1}}
@keyframes msc-punch{0%{transform:scale(2.6);opacity:0}25%{transform:scale(.92);opacity:1}40%{transform:scale(1.04)}70%{transform:scale(1);opacity:1}100%{transform:scale(.96);opacity:0}}
@keyframes msc-dots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}
@keyframes msc-fill{from{width:100%}to{width:0}}
.msc-stamp{display:inline-block;font-weight:900;font-size:22px;line-height:1.1;color:var(--sc);border:3px solid var(--sc);padding:2px 10px;transform:rotate(-6deg);white-space:nowrap}
.msc-result.v-paper{background:none;pointer-events:none;z-index:7;justify-content:flex-end;padding-bottom:15vh;box-sizing:border-box}
.msc-result.v-paper .rcard{width:min(520px,92vw);overflow:hidden;padding:12px 22px 14px}
.msc-result.v-paper .title{font-size:clamp(20px,3.6vmin,26px);margin:2px 0 4px}
.msc-result.v-paper .said{font-size:clamp(16px,2.8vmin,20px);line-height:1.35;margin:6px 0 0}
.msc-result.v-paper .said .ahead{visibility:hidden}
.msc-result.v-paper .stamped{display:flex;justify-content:flex-end;min-height:48px;margin-top:4px}
.msc-result.v-paper .stamped .msc-stamp{font-size:clamp(26px,5vmin,36px);animation:msc-stamp .35s cubic-bezier(.2,1.6,.4,1) both}
.msc-result.v-paper table{margin-top:4px}
@media (max-width:700px),(max-height:500px){
  .msc-result.v-paper{padding-bottom:6px}
  .msc-result.v-paper .rcard{width:min(640px,86vw);padding:6px 16px 8px}
  .msc-result.v-paper .cut-flag{margin-bottom:4px}
  .msc-result.v-paper .title{font-size:19px;margin:0 0 2px}
  .msc-result.v-paper .said{font-size:15px;line-height:1.28;margin-top:2px}
  .msc-result.v-paper .stamped{min-height:36px;margin-top:0}
  .msc-result.v-paper .stamped .msc-stamp{font-size:24px}
  .msc-result.v-paper table{font-size:13px}
  .msc-result.v-paper td{padding:1px 0}}
@keyframes msc-stamp{from{transform:scale(2.6) rotate(-16deg);opacity:0}to{transform:rotate(-6deg);opacity:1}}`);

/** A banner element of the given kind, in the HUD, hidden till written. */
function banner(cls: string): HTMLDivElement {
  const e = document.createElement("div");
  e.className = `msc ${cls}`;
  e.hidden = true;
  layer().appendChild(e);
  return e;
}
const colourOn = (el: HTMLElement, colour?: string) => { if (colour) el.style.setProperty("--kc", colour); else el.style.removeProperty("--kc"); };

// ---- status panels that stay up ----------------------------------------------------------------------

export interface MissionProgress {
  /** Which mission is drawing this panel: each id has its own, stacked in the HUD's left column. */
  id: string;
  label?: string; colour?: string;
  goal: string;
  /** "2 / 5", or a number for just a bar from 0 to 1. */
  progress?: string | number;
  /** 0..1, as well as the words. */
  bar?: number;
  timer?: string;
  /** Your place in a race against others: a big "2nd / 5" under the title, and the gap (html). */
  place?: { n: number; of: number; gap?: string };
  /** The step you're on, in words (html). */
  hint?: string;
  sub?: string;
  /** When this changes the panel flashes, so you know where to look. */
  flash?: string;
}

const panels = new Map<string, { el: HTMLDivElement; flash: string }>();

/** The mission whose panel is up, if any ("job" first). */
export function missionActive() {
  const j = panels.get("job");
  if (j && j.el.isConnected && !j.el.hidden) return "job";
  for (const [id, p] of panels) if (p.el.isConnected && !p.el.hidden) return id;
  return "";
}

/** A team's lives as hearts for a card line (html): full ones red, lost ones faint. */
export function hearts(left: number, of: number) {
  const n = Math.max(0, Math.min(of, left));
  return `<span style="color:#ff4a5a;letter-spacing:2px" aria-label="${n} of ${of} lives">${"♥".repeat(n)}<span style="opacity:.3">${"♥".repeat(of - n)}</span></span>`;
}

/** The HUD's top-left slot of status panels: the job's first, then any other mission's (a bus
 *  shift, a shoot-out, the bonfire), then the Flag Lads' row (invasion.ts writes #bunting), which
 *  stays up during a job. On a touch screen the slot sits in the left column (#lstack). */
function stack(): HTMLElement {
  let s = document.getElementById("mstack");
  if (s) return s;
  s = document.createElement("div");
  s.id = "mstack";
  const col = document.getElementById("lstack"), flags = document.getElementById("bunting");
  if (col) col.insertBefore(s, flags); else layer().appendChild(s);
  if (flags) s.appendChild(flags);
  return s;
}

/** Put the Flag Lads' row in the top-left slot before it shows, so it's there whether or not a
 *  mission has started yet. */
export function missionStackReady() { stack(); }

/** A status panel: call it as often as you like, it only writes when something changed. */
export function missionProgress(o: MissionProgress) {
  let p = panels.get(o.id);
  if (!p || !p.el.isConnected) {
    const el = document.createElement("div");
    el.className = "panel mprog"; el.hidden = true;
    el.dataset.mission = o.id;
    if (o.id === "job") { el.id = "mprog"; stack().prepend(el); } else stack().insertBefore(el, document.getElementById("bunting"));
    p = { el, flash: "" };
    panels.set(o.id, p);
  }
  const panel = p.el;
  const frac = typeof o.progress === "number" ? o.progress : o.bar;
  const count = typeof o.progress === "string" ? o.progress : "";
  const col = o.colour ?? "";
  if (panel.style.getPropertyValue("--kc") !== col) colourOn(panel, col);
  const top = (o.label ? `<div class="label" style="color:var(--kc,var(--accent))">${o.label}</div>` : "")
    + `<div class="head"><div class="jobtitle">${esc(ctlText(o.goal))}</div>${count ? `<div class="count">${esc(count)}</div>` : ""}</div>`
    + (o.timer ? `<div class="timer">${esc(o.timer)}</div>` : "")
    + (o.place ? `<div class="place"><b>${nth(o.place.n)}</b> / ${o.place.of}${o.place.gap ? `<span>${o.place.gap}</span>` : ""}</div>` : "");
  const foot = (frac !== undefined ? `<div class="bar"><div style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></div></div>` : "")
    + (o.sub ? `<em>${ctlText(o.sub)}</em>` : "");
  const key = o.flash ?? "";
  if (key !== p.flash) {
    if (p.flash && key) { panel.classList.remove("fresh"); void panel.offsetWidth; panel.classList.add("fresh"); }
    p.flash = key;
  }
  // in parts, so the clock ticking doesn't rebuild the job's line: a picture in it would be thrown
  // away and decoded again every second, and flash
  if (panel.childElementCount !== 3) panel.replaceChildren(document.createElement("div"), document.createElement("div"), document.createElement("div"));
  const [a, b, c] = panel.children as unknown as HTMLElement[];
  show(a, top);
  show(b, o.hint ? ctlText(o.hint) : "", !!o.hint);
  if (b.className !== "jobline") b.className = "jobline";
  show(c, foot);
  setHidden(panel, false);
}

/** Take a panel down: this mission's, or with no id every one. */
export function missionClear(id?: string) {
  for (const [k, p] of panels) {
    if (id && k !== id) continue;
    p.flash = "";
    show(p.el, "", false);
  }
  if (!id) missionAux();
}

// ---- the slot under the crosshair --------------------------------------------------------------------

/** A mode's meter under the crosshair (and under the prompt), in the shared classes: .aux-word,
 *  .aux-big and .aux-tag for words, .aux-meter (with <i> fills) for a bar, .aux-panel for a box.
 *  Each key has its own row; null takes it down, and no key at all clears the slot. */
export function missionAux(key?: string, html?: string | null, colour?: string) {
  let slot = document.getElementById("maux");
  if (key === undefined) { slot?.querySelectorAll(":scope>[data-k]").forEach((r) => r.remove()); return; }
  if (!slot) {
    if (!html) return;
    slot = auxSlot();
  }
  let row = slot.querySelector<HTMLElement>(`:scope>[data-k="${key}"]`);
  if (!html) { if (row && !row.hidden) row.hidden = true; return; }
  if (!row) { row = document.createElement("div"); row.dataset.k = key; slot.appendChild(row); }
  if ((row.style.getPropertyValue("--kc") || undefined) !== colour) colourOn(row, colour);
  show(row, html, true);
}

function auxSlot() {
  let slot = document.getElementById("maux");
  if (!slot) { slot = document.createElement("div"); slot.id = "maux"; layer().appendChild(slot); }
  return slot;
}

/** A meter a mode keeps itself (the combo row, the wings' flight): a row of
 *  the slot under the crosshair, above the score pops, so it never sits apart or on top of another. */
export function missionAuxAdopt(el: HTMLElement) {
  const slot = auxSlot();
  if (el.parentElement !== slot) slot.insertBefore(el, slot.querySelector(":scope>#trick"));
}

/** The row a mode drew under the crosshair, to move its bars without writing it again. */
export const missionAuxRow = (key: string) => document.querySelector<HTMLElement>(`#maux>[data-k="${key}"]`);

// ---- the title card and stage calls ---------------------------------------------------------------------

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

/** A title or stage card, or a countdown, has the space over the crosshair: calls wait till it's gone. */
export function missionCardUp() {
  if (count && !count.hidden) return true;
  return !!card && !card.classList.contains("out");
}
noticeHold("card", missionCardUp);

function putCard(cls: string, html: string, life: number, colour?: string, cut = false) {
  dropCard();
  const el = (card = document.createElement("div"));
  el.className = `msc ${cls}`;
  colourOn(el, colour);
  el.innerHTML = `<div class="band">${html}</div>`;
  if (cut) briefCut(el.firstElementChild as HTMLElement, colour);
  layer().appendChild(el);
  cardTimer = window.setTimeout(() => {
    el.classList.add("out");
    cardTimer = window.setTimeout(() => { if (card === el) dropCard(); }, FADE * 1000);
  }, life * 1000);
}

/** The Chronicle (the scoreboard panel) is up in the middle of the screen. */
const paperUp = () => { const b = document.getElementById("scoreboard"); return !!b && !b.hidden; };

/** How a mode starts, which is all it says: "race" is a timed race, "timed" any other clock, "calm" has no timed start. */
export type Start = "race" | "timed" | "calm";
/** How a start looks on the screen. */
export type Countdown = "race" | "plain" | "none";

/** The 3, 2, 1, GO! a start gets: only where several start together, the lights for a race, a plain one for any other
 *  clock, none for a calm mode, and none alone (the clock starts as the card goes). */
export function countdownFor(start: Start, players: number): Countdown {
  if (start === "calm" || players < 2) return "none";
  return start === "race" ? "race" : "plain";
}

export interface MissionBegin {
  title: string; goal: string; detail?: string;
  /** The kind of mission, small over the title, in its colour. */
  label?: string; colour?: string;
  /** Your best at this kind of mission, in words ("gold", "3 stars"). */
  best?: string;
  /** How the mode starts, and how many players start together: they decide the 3, 2, 1, GO! (countdownFor).
   *  onGo at GO, or as the card goes with no countdown. Left out: nothing follows the card. */
  start?: Start; players?: number; onGo?: () => void;
  /** The rest of the job's brief, as its noticeboard had it (html). */
  blurb?: string; block?: string; reward?: string;
}

/** The title card when a mission begins: its brief, with what to do. It waits for the Chronicle to be put away rather than sit on top of it. */
export function missionBegin(o: MissionBegin) {
  const html = briefHtml("title", { label: o.label, colour: o.colour, title: o.title, goal: o.goal, detail: o.detail, best: o.best, blurb: o.blurb, block: o.block, reward: o.reward });
  dropCard();
  ending?.remove();   // the last mission's result makes way for the new one
  const put = () => {
    putCard("msc-brief", html, START_SECS, o.colour, true);
    const style = o.start ? countdownFor(o.start, o.players ?? 1) : null;
    if (style === "none") window.setTimeout(() => o.onGo?.(), (START_SECS + 0.3) * 1000);
    else if (style) {
      for (let n = 3; n >= 0; n--) {
        window.setTimeout(() => { SFX.pip(n === 0); missionCountdown(n, o.colour, style); if (n === 0) o.onGo?.(); }, (START_SECS + 0.3 + (3 - n)) * 1000);
      }
    }
  };
  if (!paperUp()) { put(); return; }
  let waited = 0;
  const poll = () => {
    if (paperUp() && (waited += 300) < 20000) { paperWait = window.setTimeout(poll, 300); return; }
    put();
  };
  paperWait = window.setTimeout(poll, 300);
}

/** A stage call: the words, the mission's own colour, and how the moment went for you, if it went
 *  one way or the other (a split ahead, a life lost, time running short), which the plate shows. */
export interface MissionCall extends Message {
  colour?: string;
  went?: "well" | "badly" | "close";
}
const WENT = { well: "#58e06a", badly: "#ff5a4e", close: "#ffb02e" };

/** A stage call: the mission moving on (a wave, a checkpoint, a life gone), on the plate over the
 *  crosshair, up for as long as it takes to read. */
export function missionCall(o: MissionCall) {
  const sub = o.sub ? `<div class="goal">${esc(ctlText(o.sub))}</div>` : "";
  putCard("msc-stage", `<div class="title">${esc(ctlText(o.text))}</div>` + sub, readSecs(o.text + (o.sub ?? ""), 1.6, 5, 1 / 22, 1.4), o.went ? WENT[o.went] : o.colour);
}

// ---- entries, the countdown, and watching the others ------------------------------------------------------

let wait: HTMLDivElement | null = null;

/** The banner while the entries are open and the racers line up, or null to take it down. */
export function missionWaiting(o: { kind?: string; head: string; sub: string; small?: string; count?: number; colour?: string } | null) {
  if (!o) { if (wait) wait.hidden = true; return; }
  if (!wait || wait.hidden) dropCard();   // it says what the race is: the title card would only sit on it
  if (!wait || !wait.isConnected) wait = banner("msc-wait");
  colourOn(wait, o.colour);
  show(wait, `<div class="band">${o.kind ? `<div class="kind">${esc(o.kind)}</div>` : ""}<div class="head">${o.head}</div>${o.count !== undefined ? `<div class="count">${o.count}</div>` : ""}<div class="rsub">${o.sub}</div>${o.small ? `<div class="small">${o.small}</div>` : ""}</div>`, true);
}

let count: HTMLDivElement | null = null;
let countT = 0;

/** A number of the countdown (3, 2, 1, or 0 for GO!) punching in over the middle of the screen; it
 *  fades by itself. "race" has the start lights over it, "plain" is the number alone on a plate in
 *  the mode's colour; "none" shows nothing. */
export function missionCountdown(n: number, colour?: string, style: Countdown = "race") {
  dropCard();
  if (style === "none") { if (count) count.hidden = true; return; }
  if (!count || !count.isConnected) count = banner("msc-count");
  colourOn(count, colour);
  count.classList.toggle("plain", style === "plain");
  const lamps = [0, 1, 2].map((k) => `<div class="lamp ${n === 0 ? "green" : k < 4 - n ? "red" : ""}"></div>`).join("");
  const num = `<div class="num${n === 0 ? " go" : ""}">${n === 0 ? "GO!" : n}</div>`;
  // written afresh each time, so its punch plays again
  count.innerHTML = style === "plain" ? `<div class="plate">${num}</div>` : `<div class="lights">${lamps}</div>${num}`;
  count.hidden = false;
  clearTimeout(countT);
  countT = window.setTimeout(() => { if (count) count.hidden = true; }, n === 0 ? 1100 : 950);
}

let watch: HTMLDivElement | null = null;
let flips: HTMLButtonElement[] = [];
let flipTo: ((by: number) => void) | null = null;

export interface StandRow { name: string; time: string; me?: boolean; watch?: boolean }

/** The banner while you wait for the race to end and watch the others, and the touch screen's
 *  buttons to switch who you're watching (flip: -1 or 1); null takes it all down. */
export function missionWatching(o: { head: string; sub: string; small?: string; rows: StandRow[]; many: boolean } | null, flip?: (by: number) => void) {
  if (!o) { if (watch) watch.hidden = true; for (const b of flips) b.hidden = true; return; }
  if (!watch || !watch.isConnected) watch = banner("msc-watch");
  const table = o.rows.length ? `<table>${o.rows.slice(0, 8).map((r, k) => `<tr class="${r.me ? "me" : r.watch ? "watch" : ""}"><td>${k + 1}.</td><td>${esc(r.name)}</td><td class="t">${esc(r.time)}</td></tr>`).join("")}</table>` : "";
  show(watch, `<div class="band"><div class="head">${o.head}</div><div class="rsub">${o.sub}</div>${o.small ? `<div class="small">${o.small}</div>` : ""}${table}</div>`, true);
  const touch = document.getElementById("touch");
  if (touch && !flips.length && flip) {
    flips = [-1, 1].map((by) => {
      const b = document.createElement("button");
      b.className = `msc-flip ${by < 0 ? "l" : "r"}`;
      b.textContent = by < 0 ? "◀" : "▶";
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); flipTo?.(by); });
      touch.appendChild(b);
      return b;
    });
  }
  flipTo = flip ?? null;
  for (const b of flips) b.hidden = !o.many;
}

// ---- the result ----------------------------------------------------------------------------------------

export interface ResultRow { name: string; time: string; me?: boolean; dnf?: boolean }

export interface MissionResult {
  /** won: confetti and the winning sound; lost: the losing one; over: neither (a shift ended). */
  result: "won" | "lost" | "over";
  /** Which part of the Chronicle it's cut from, unless flag says. */
  kind?: "job" | "challenge" | "race" | "wanted" | "test" | "arts" | "bus" | "sport" | "night";
  flag?: string;
  /** The small line over the title: the mission's name. */
  label?: string;
  /** The mode's own headline: "Winner!", "Cuffed!", "Bonfire built!". */
  title: string;
  place?: number;
  /** The big figure on the results line: a time, a score. */
  lead?: string;
  /** The word at the end of the results line: a medal, "Caught", "DNF". */
  medal?: string;
  /** Plain text lines under it. */
  lines?: string[];
  best?: string;
  rows?: ResultRow[];
  stats?: { k: string; v: string }[];
  /** What you won, listed on the card; awards that come in while it's up are added (notice.ts). */
  rewards?: string[];
  colour?: string;
  /** The Again button's go, if there is one. */
  again?: () => void;
  /** The end sound: left out, the job's win or loss; null for none. */
  sound?: (() => void) | null;
  /** A variant's own body (html, already escaped) after the title: a report, a front page, a verdict. */
  body?: string;
  variant?: "sheet" | "front" | "verdict";
  secs?: number;
}

const FLAGS: Record<string, [string, string]> = {
  job: ["Stop press", "In brief"], challenge: ["Stop press", "In brief"], race: ["Sport", "Sport"], sport: ["Sport", "Sport"],
  wanted: ["Police notices", "Police notices"], test: ["Motoring", "Motoring"], arts: ["Arts", "Arts"], bus: ["Transport", "Transport"],
};

interface Bit { x: number; y: number; vx: number; vy: number; a: number; va: number; w: number; h: number; c: string }

export interface ResultHandle { rows(rows: ResultRow[]): void; reward(text: string, pic?: Reward["pic"]): void; remove(): void }
let ending: ResultHandle | null = null;

/** A result card is up now. */
export const missionResultUp = () => !!ending;
/** Take the result card down at once (a new race starting). */
export function missionResultDrop() { ending?.remove(); }
/** Something won while the card is up: list it there. False if no card is up to take it. */
export function missionReward(text: string, pic?: Reward["pic"]) { if (!ending) return false; ending.reward(text, pic); return true; }
noticeAwardsTo(missionReward);
noticeTricksTo(missionAuxAdopt);

/** The card at the end of every mission. It stays till Continue, its × or its timer. */
export function missionResult(o: MissionResult): ResultHandle {
  dropCard();
  ending?.remove();
  const won = o.result === "won";
  const secs = o.secs ?? (o.variant === "front" || o.variant === "sheet" ? READ_SECS : CARD_SECS);
  const el = document.createElement("div");
  el.className = `msc msc-result ${o.result}${o.variant ? ` v-${o.variant}` : ""}`;
  colourOn(el, o.colour);
  el.style.setProperty("--secs", `${secs}s`);
  const canvas = document.createElement("canvas");
  if (won) el.appendChild(canvas);
  const band = document.createElement("div");
  band.className = "rcard cut";
  tearOff(el);
  const flag = o.variant === "front" ? cutFront(o.flag ?? "") : cutFlag(o.flag ?? FLAGS[o.kind ?? "job"]?.[won ? 0 : 1] ?? "Stop press");
  const lines = [...(o.lines ?? []).map(esc), ...(o.best ? [`<b>${esc(o.best)}</b>`] : [])];
  const leadRow = o.place || o.lead || o.medal
    ? `<div class="lead">${o.place ? `<span class="place">${nth(o.place)}</span>` : ""}${o.lead ? `<span class="time">${esc(o.lead)}</span>` : ""}${o.medal ? `<span class="medal">${esc(o.medal)}</span>` : ""}</div>` : "";
  const ok = ctl("jump"), more = o.again ? ctl("again") : "";
  band.innerHTML = flag
    + (o.label ? `<div class="kind">${esc(o.label)}</div>` : "")
    + `<div class="title">${esc(o.title)}</div>`
    + leadRow
    + (o.body ? `<div class="body">${o.body}</div>` : "")
    + (lines.length ? `<p class="lines">${lines.join("<br>")}</p>` : "")
    + `<div class="table"></div>`
    + (o.stats?.length ? `<div class="stats">${o.stats.map((x) => `${esc(x.k)} <b>${esc(x.v)}</b>`).join(" &nbsp;·&nbsp; ")}</div>` : "")
    + `<ul class="rewards"></ul>`
    + `<div class="go">${o.again ? `<button type="button" class="again">Again <small>(${esc(more)})</small></button>` : ""}<button type="button" class="main">Continue <small>(${esc(ok)})</small><span class="fill"></span></button></div>`;
  el.appendChild(band);
  layer().appendChild(el);
  const table = band.querySelector<HTMLElement>(".table")!, list = band.querySelector<HTMLElement>(".rewards")!;

  let gone = false, age = 0, bursts = 0;
  const bits: Bit[] = [];
  const rows = (r: ResultRow[]) => {
    table.innerHTML = r.length > 1 || (r.length && !r[0].me)
      ? `<table><caption>Results</caption>${r.slice(0, 10).map((x, k) => `<tr class="${x.me ? "me" : ""}${x.dnf ? " dnf" : ""}"><td class="n">${x.dnf ? "–" : `${k + 1}.`}</td><td>${esc(x.name)}</td><td class="t">${esc(x.time)}</td></tr>`).join("")}</table>`
      : "";
  };
  const reward = (text: string, pic?: Reward["pic"]) => {
    if ([...list.children].some((li) => li.textContent === text)) return;
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
    if (pic) void Promise.resolve(pic).then((url) => { if (url) { const img = document.createElement("img"); img.className = "pic"; img.alt = ""; img.src = url; li.prepend(img); li.classList.add("haspic"); } }, () => {});
  };
  const remove = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    removeEventListener("keydown", onKey, true);
    el.classList.add("out");
    window.setTimeout(() => el.remove(), 500);
    if (ending === handle) ending = null;
  };
  const handle: ResultHandle = { rows, reward, remove };
  ending = handle;
  rows(o.rows ?? []);
  for (const r of o.rewards ?? []) if (r) reward(r);
  // jump (Space, Enter, ✕) carries on; use (E, □) or Backspace goes again. Taken here so the press
  // doesn't jump or get in a car too.
  const onKey = (k: KeyboardEvent) => {
    if (k.repeat) return;
    if (k.code === "Space" || k.code === "Enter") { k.preventDefault(); k.stopImmediatePropagation(); remove(); }
    else if (o.again && (k.code === "Backspace" || isKey(k.code, "use"))) { k.preventDefault(); k.stopImmediatePropagation(); remove(); o.again(); }
  };
  addEventListener("keydown", onKey, true);
  band.querySelector<HTMLButtonElement>("button.main")!.addEventListener("click", () => { remove(); modalClicked(); });
  band.querySelector<HTMLButtonElement>("button.again")?.addEventListener("click", () => { remove(); o.again?.(); modalClicked(); });
  modal(el, () => band, remove);
  const timer = window.setTimeout(remove, secs * 1000);
  if (o.sound !== null) (o.sound ?? (() => { if (o.result !== "over") SFX.jobDone(won); }))();

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
  if (won) {
    burst();
    let last = performance.now();
    const tick = (ms: number) => {
      if (gone) return;
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

/** The result as a form filled in (the driving test's report): who, the stamp, and sections of
 *  plain-text lines. */
export function missionSheet(o: { kind: string; title: string; who: string; stamp: string; good: boolean; sections: { head: string; lines: string[] }[]; foot?: string; again?: () => void; sound?: (() => void) | null; rewards?: string[] }) {
  const colour = o.good ? "#1f6a33" : "#a3201c";
  return missionResult({
    result: o.good ? "won" : "lost", kind: "test", variant: "sheet", label: o.kind, title: o.title, colour, again: o.again, sound: o.sound, rewards: o.rewards,
    body: `<div class="by">${esc(o.who)}</div><div class="verdict" style="color:${colour}">Result: ${esc(o.stamp)}</div>`
      + `<div class="cols">${o.sections.map((x) => `<div><h4>${esc(x.head)}</h4>${x.lines.length ? x.lines.map((l) => esc(l)).join("<br>") : "None"}</div>`).join("")}</div>`
      + (o.foot ? `<div class="stand">${esc(o.foot)}</div>` : ""),
  });
}

/** The result as the night out's front page (nightout.ts), written by paper.ts. Items' text is html already escaped. */
export function missionNight(o: { pub: string; head: string; stand: string; by: string; body: string[]; items: { head: string; text: string }[] }) {
  return missionResult({
    result: "over", kind: "night", variant: "front", flag: `Last orders at ${esc(o.pub)}`, title: o.head, colour: "#8a2a1f", sound: null,
    body: `<div class="by">${esc(o.by)}</div><div class="stand">${esc(o.stand)}</div>${o.body.map((p) => `<p>${esc(p)}</p>`).join("")}`
      + `<div class="cols">${o.items.map((i) => `<div><h4>${i.head}</h4>${i.text}</div>`).join("")}</div>`,
  });
}

/** A rubber stamp, the one look for a verdict or a mark stamped on a card. */
export const stampHtml = (text: string, colour: string) => `<span class="msc-stamp" style="--sc:${colour}">${esc(text)}</span>`;

export interface MissionPaper {
  /** The section of the paper it's from, along the top. */
  flag: string;
  /** Small over the title, and the title. */
  label?: string; title: string;
  /** Words typed out, over typing seconds. */
  text?: string; typing?: number;
  /** The stamp, and how far in it comes down. */
  stamp?: { text: string; colour: string; at: number };
  /** Anything more, as html (a table). */
  body?: string;
  colour?: string;
  /** Seconds it's up, and how far into them it already is (on a screen that's caught up late). */
  secs: number; since?: number;
}
let paper: { remove(): void } | null = null;

/** A cutting held up low in the middle of the screen for its time, under whatever it's about, with
 *  nothing to press, so you can still look about. Each new one takes the place of the last. */
export function missionPaper(o: MissionPaper): { remove(): void } {
  paper?.remove();
  const el = document.createElement("div");
  el.className = "msc msc-result v-paper";
  colourOn(el, o.colour);
  tearOff(el);
  const band = document.createElement("div");
  band.className = "rcard cut";
  band.innerHTML = cutFlag(o.flag)
    + (o.label ? `<div class="kind">${esc(o.label)}</div>` : "")
    + `<div class="title">${esc(o.title)}</div>`
    + (o.text !== undefined ? `<p class="said"><span class="typed"></span><span class="ahead"></span></p>` : "")
    + (o.body ?? "")
    + (o.stamp ? `<div class="stamped"></div>` : "");
  el.appendChild(band);
  layer().appendChild(el);
  const t0 = performance.now() - (o.since ?? 0) * 1000, text = o.text ?? "";
  const typed = band.querySelector<HTMLElement>(".typed"), ahead = band.querySelector<HTMLElement>(".ahead");
  const stamped = band.querySelector<HTMLElement>(".stamped");
  let shown = -1, gone = false;
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    if (typed && ahead) {
      // the rest is there but unseen, so the card doesn't grow as it types
      const n = Math.min(text.length, Math.floor(text.length * t / Math.max(0.1, o.typing ?? 0)));
      if (n !== shown) { shown = n; typed.textContent = text.slice(0, n); ahead.textContent = text.slice(n); }
    }
    if (o.stamp && stamped && !stamped.firstChild && t >= o.stamp.at) { stamped.innerHTML = stampHtml(o.stamp.text, o.stamp.colour); if (t - o.stamp.at < 0.5) SFX.jobStep(); }
    if (t >= o.secs) remove();
  };
  const timer = window.setInterval(tick, 40);
  const remove = () => {
    if (gone) return;
    gone = true;
    clearInterval(timer);
    el.classList.add("out");
    window.setTimeout(() => el.remove(), 500);
    if (paper === handle) paper = null;
  };
  const handle = { remove };
  paper = handle;
  tick();
  return handle;
}

/** A race place as a word with its ending: "1st". */
export const placeWord = nth;

