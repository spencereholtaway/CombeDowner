// The fun on top of shooting the Flag Lads' flags (invasion.ts does the counting): a combo for flags
// shot in quick succession, confetti and fluttering bunting, the moment a square is cleared, and a
// bonus for shooting from a moving ride. All of it is yours alone: nobody else sees your combo or
// your slow-motion, and none of it changes what the host counts. The scores here are for show.
//
// Cheap on purpose: one pool of flakes in a single instanced mesh serves the confetti and the torn
// bunting alike, and nothing is allocated per frame.
import * as THREE from "three";
import * as SFX from "./audio";

const WINDOW = 4000;                // ms: the next flag has to come this soon to keep a combo going
const FLAG_PTS = 100, BUNTING_PTS = 400, TRICK_PTS = 150, GRIND_PTS = 300, CLEAR_PTS = 500;
const SLOW_SECS = 0.6, SLOW_TO = 0.3;
const POOL = 200;
const RED = new THREE.Color("#d8202c"), WHITE = new THREE.Color("#f6f4ee");

export interface JuiceWorld {
  ground(x: number, z: number): number;
  /** Alone in the room: only then is it safe to slow the game down. */
  solo(): boolean;
}

export class FlagJuice {
  private count = 0; private total = 0; private lastAt = 0; private shots = 0;
  private slowT = 0; private scale = 1;
  private el: HTMLDivElement | null = null; private callEl: HTMLDivElement | null = null;
  private shown = "";

  private mesh: THREE.InstancedMesh;
  private next = 0; private live = 0;
  private px = new Float32Array(POOL); private py = new Float32Array(POOL); private pz = new Float32Array(POOL);
  private vx = new Float32Array(POOL); private vy = new Float32Array(POOL); private vz = new Float32Array(POOL);
  private rot = new Float32Array(POOL); private spin = new Float32Array(POOL); private ph = new Float32Array(POOL);
  private size = new Float32Array(POOL); private age = new Float32Array(POOL); private floor = new Float32Array(POOL);
  private alive = new Uint8Array(POOL);
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler();
  private pos = new THREE.Vector3(); private sc = new THREE.Vector3(); private none = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private scene: THREE.Scene, private w: JuiceWorld) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.08), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), POOL);
    for (let k = 0; k < POOL; k++) { this.mesh.setMatrixAt(k, this.none); this.mesh.setColorAt(k, WHITE); }
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }

  /** A flag of mine has just come down. trick: what I was riding or grinding, if anything. */
  flag(x: number, y: number, z: number, trick: string) {
    const n = this.hitCombo(FLAG_PTS);
    this.spray(x, y, z, 10 + 2 * Math.min(n, 8), 1, 4);
    SFX.comboNote(n);
    if (trick) this.trickShot(trick);
  }

  /** I've shot a string of bunting down. at: points along it, x y z in turn. */
  bunting(at: number[], trick: string) {
    const n = this.hitCombo(BUNTING_PTS);
    this.fall(at, 2.3);
    SFX.buntingDrop();
    SFX.comboNote(n);
    this.say(`Bunting down! +${BUNTING_PTS}`);
    if (trick) this.trickShot(trick);
  }

  /** Someone else's string coming down in front of me. */
  fall(at: number[], size: number) {
    const pts = at.length / 3;
    for (let k = 0; k < 36; k++) {
      const i = Math.floor((k / 36) * pts) * 3;
      this.spawn(at[i], at[i + 1], at[i + 2], (Math.random() - 0.5) * 1.2, Math.random() * 0.8, (Math.random() - 0.5) * 1.2, size, k % 2 ? WHITE : RED);
    }
  }

  /** The last flag in a square. */
  cleared(x: number, y: number, z: number) {
    this.hitCombo(CLEAR_PTS);
    this.spray(x, y + 0.5, z, 70, 1.6, 7);
    for (let k = 0; k < 28; k++) this.spawn(x + (Math.random() - 0.5) * 8, y + 4 + Math.random() * 3, z + (Math.random() - 0.5) * 8, 0, 0, 0, 2.3, k % 2 ? WHITE : RED);
    SFX.squareCleared();
    if (this.w.solo()) this.slowT = SLOW_SECS;
    this.say(`+${CLEAR_PTS}`);
  }

  /** The game's clock this frame, given the real dt: dips for a moment after clearing a square. */
  timeScale(dt: number): number {
    if (this.slowT > 0) { this.slowT -= dt; this.scale = SLOW_TO; }
    else if (this.scale < 1) this.scale = Math.min(1, this.scale + dt * 3);
    return this.scale;
  }

  update(dt: number) {
    const now = performance.now();
    if (this.count && now - this.lastAt > WINDOW) this.finish();
    if (this.count) this.tick(now);
    if (!this.live) return;
    const m4 = this.m4, e = this.e, q = this.q, pos = this.pos, sc = this.sc;
    const drag = Math.min(1, dt * 2.2);
    for (let k = 0; k < POOL; k++) {
      if (!this.alive[k]) continue;
      const age = (this.age[k] += dt);
      if (this.py[k] > this.floor[k]) {
        this.vy[k] -= 9 * dt;
        this.vx[k] -= this.vx[k] * drag; this.vy[k] -= this.vy[k] * drag; this.vz[k] -= this.vz[k] * drag;
        this.px[k] += (this.vx[k] + Math.sin(age * 4 + this.ph[k]) * 0.5) * dt;
        this.py[k] += this.vy[k] * dt;
        this.pz[k] += (this.vz[k] + Math.cos(age * 3.4 + this.ph[k]) * 0.5) * dt;
        this.rot[k] += this.spin[k] * dt;
        e.set(Math.sin(age * 9 + this.ph[k]) * 0.9, this.rot[k], Math.cos(age * 7 + this.ph[k]) * 0.6);
        if (this.py[k] <= this.floor[k]) this.py[k] = this.floor[k];
      } else e.set(-Math.PI / 2, this.rot[k], 0);
      if (age > 7) { this.alive[k] = 0; this.live--; this.mesh.setMatrixAt(k, this.none); continue; }
      m4.compose(pos.set(this.px[k], this.py[k], this.pz[k]), q.setFromEuler(e), sc.setScalar(age > 5.5 ? this.size[k] * (7 - age) / 1.5 : this.size[k]));
      this.mesh.setMatrixAt(k, m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.el?.remove(); this.callEl?.remove();
  }

  private hitCombo(pts: number): number {
    const now = performance.now();
    if (this.count && now - this.lastAt > WINDOW) this.finish();
    this.count++;
    this.shots++;
    this.lastAt = now;
    const mult = 1 + 0.1 * Math.min(this.count - 1, 9);
    this.total += Math.round(pts * mult);
    this.tick(now, true);
    return this.count;
  }

  private trickShot(trick: string) {
    const grind = trick === "grind", pts = grind ? GRIND_PTS : TRICK_PTS;
    this.total += pts;
    SFX.trickShot();
    this.say(grind ? `Grind shot! +${pts}` : `Trick shot! +${pts}`, grind ? "mid-grind" : `from ${trick}`);
    this.tick(performance.now(), true);
  }

  private finish() {
    if (this.count >= 2) this.say(`Combo over: ${this.shots} shots, ${this.total} points`, "", true);
    this.count = this.total = this.shots = 0;
    this.write("");
  }

  private tick(now: number, force = false) {
    if (!this.count) return;
    const left = Math.max(0, 1 - (now - this.lastAt) / WINDOW);
    const html = this.count < 2 ? "" : `<b>x${this.count}!</b><i>${this.total}</i><u style="--left:${left.toFixed(2)}"></u>`;
    // the bar only needs redrawing a few times a second
    const key = html && `${this.count}|${this.total}|${Math.round(left * 12)}`;
    if (force || key !== this.shown) this.write(html, key);
  }

  private write(html: string, key = "") {
    this.shown = key;
    if (!this.el) {
      if (!html) return;
      inject();
      this.el = document.createElement("div");
      this.el.id = "fj-combo";
      (document.getElementById("hud") ?? document.body).appendChild(this.el);
    }
    this.el.innerHTML = html;
    this.el.hidden = !html;
    if (html) { this.el.classList.remove("pop"); void this.el.offsetWidth; this.el.classList.add("pop"); }
  }

  /** A callout under the crosshair; over: the combo's tally, a little quieter. */
  private say(text: string, sub = "", over = false) {
    if (!this.callEl) {
      inject();
      this.callEl = document.createElement("div");
      this.callEl.id = "fj-call";
      (document.getElementById("hud") ?? document.body).appendChild(this.callEl);
    }
    const c = this.callEl;
    c.innerHTML = `<b>${text}</b>${sub ? `<i>${sub}</i>` : ""}`;
    c.classList.toggle("over", over);
    c.classList.remove("go"); void c.offsetWidth; c.classList.add("go");
  }

  private spray(x: number, y: number, z: number, n: number, spread: number, up: number) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.283, s = (0.4 + Math.random()) * 2.4 * spread;
      this.spawn(x, y, z, Math.cos(a) * s, up * (0.4 + Math.random() * 0.8), Math.sin(a) * s, 1, k % 2 ? WHITE : RED);
    }
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, c: THREE.Color) {
    const k = this.next;
    this.next = (k + 1) % POOL;
    if (!this.alive[k]) this.live++;
    this.alive[k] = 1;
    this.px[k] = x; this.py[k] = y; this.pz[k] = z;
    this.vx[k] = vx; this.vy[k] = vy; this.vz[k] = vz;
    this.rot[k] = Math.random() * 6.283; this.spin[k] = (Math.random() - 0.5) * 8; this.ph[k] = Math.random() * 6.283;
    this.size[k] = size; this.age[k] = 0;
    this.floor[k] = this.w.ground(x, z) + 0.03;
    this.mesh.setColorAt(k, c);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

let injected = false;
function inject() {
  if (injected) return;
  injected = true;
  const s = document.createElement("style");
  s.textContent = `#fj-combo{position:fixed;right:18px;top:34%;text-align:right;pointer-events:none;color:#fff;text-shadow:0 2px 4px #000;z-index:5}
#fj-combo b{display:block;font-size:clamp(30px,6vw,52px);color:#ff4a55;font-style:italic;line-height:1}
#fj-combo i{display:block;font-style:normal;font-weight:700;font-size:clamp(13px,2.4vw,18px)}
#fj-combo u{display:block;height:4px;margin-top:4px;background:#fff;border-radius:2px;transform-origin:right;transform:scaleX(var(--left,1));text-decoration:none}
#fj-combo.pop b{animation:fj-pop .22s ease-out}
#fj-call{position:fixed;left:50%;top:58%;transform:translateX(-50%);text-align:center;pointer-events:none;color:#fff;text-shadow:0 2px 4px #000;opacity:0;z-index:5}
#fj-call b{display:block;font-size:clamp(20px,4.4vw,34px);color:#ffd34a;letter-spacing:.04em}
#fj-call.over b{color:#fff;font-size:clamp(14px,3vw,22px)}
#fj-call i{display:block;font-style:normal;font-size:clamp(12px,2.2vw,16px)}
#fj-call.go{animation:fj-call 1.6s ease-out}
@keyframes fj-pop{from{transform:scale(1.7)}to{transform:none}}
@keyframes fj-call{0%{opacity:0;transform:translate(-50%,10px) scale(1.4)}12%{opacity:1;transform:translate(-50%,0) scale(1)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-14px)}}`;
  document.head.appendChild(s);
}
