// The television coverage: when you kick at goal or bowl, the camera leaves your eyes and follows
// the ball the way the telly would, in letterbox, with a caption.
// - A kick (or a shot at goal): low behind the tee or the ball as the boot goes in, then chasing the ball, then a cut to a camera
//   behind the posts looking back as it comes through, slowed right down as it gets there.
// - A ball: the long lens from behind the bowler's arm, straight down the wicket, then a cut to a
//   low camera square of the far stumps, slowed right down as it arrives, to see the bails go.
// Any key or a click goes back to your own eyes, and so does getting hit.
// The camera behind the posts looks for somewhere it can see the goal from: in a ground like Twerton
// Park there's a terrace or a wall right behind the net, so it goes up above it, in close behind the
// net, or out to the side on the goal line instead. The others come in closer rather than stand
// behind a wall or a tree.
import * as THREE from "three";
import type { Shot } from "./sport";

const UP = new THREE.Vector3(0, 1, 0);
const SLOW = { f: 0.35, r: 0.35, c: 0.25 };      // how fast time runs for the ball at the moment that matters
const HOLD = { miss: 1.3, scored: 2.4 }; // seconds to stay on it after the moment (the line, or stopping short)
/** Where the camera behind the posts can stand, best first: metres behind the line, out to the side
 *  (past the posts, for the last), and up. Low behind; higher over a wall or the front of a terrace;
 *  in close behind the net; then on the pitch, out beside the goal, looking across it. */
const POSTS: [number, number, number][] = [[13, 4, 1.6], [9, 3, 5], [3.2, 1.5, 1.8], [-1.5, 9, 2.5]];
const GAP = 0.5;                         // how far the camera keeps off a wall it would be behind

export class Broadcast {
  /** Covering a ball: the camera is ours, and you stand still. */
  on = false;
  /** How fast time runs for the ball: slow motion at the moment that matters. */
  scale = 1;
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  fov = 50;
  caption = "";
  private shot: Shot | null = null;      // the ball we're covering
  private done: Shot | null = null;      // the last one we finished with or skipped
  private cut = "";                       // the current camera
  private hold = -1;                      // seconds since the moment, or -1 before it
  private v = new THREE.Vector3();
  private spot: THREE.Vector3 | null = null;   // where the camera behind the posts found it could see from

  /** Back to your own eyes. */
  skip() {
    if (this.shot) this.done = this.shot;
    this.shot = null;
    this.on = false;
    this.scale = 1;
  }

  /** dt: real seconds (the camera doesn't slow down). ground(x, z): terrain height, to keep the camera above it.
   *  free(a, b): how far you can see from a towards b before something's in the way (all of it, if nothing is). */
  update(dt: number, shot: Shot | null, ground: (x: number, z: number) => number, free?: (a: THREE.Vector3, b: THREE.Vector3) => number) {
    if (!shot || shot === this.done) { if (this.on) this.skip(); return; }
    // a ball: watch it leave your hand along the dots before the telly cuts in
    if (shot !== this.shot && shot.sport === "c" && shot.t < 0.5 && shot.rest === 0) return;
    if (shot !== this.shot) {
      this.shot = shot;
      this.on = true;
      this.cut = "";
      this.hold = -1;
      this.spot = null;
      const dist = Math.hypot(shot.goal.x - shot.from.x, shot.goal.z - shot.from.z);
      const wind = Math.round(shot.wind * 2.237);
      this.caption = (shot.sport === "r" ? `Kick at goal · ${Math.round(dist)} m` : shot.sport === "f" ? `Shot at goal · ${Math.round(dist)} m` : `${Math.round(shot.speed * 2.237)} mph`) + (wind ? ` · wind ${wind} mph` : "");
    }
    const b = shot.pos, along = shot.along;
    const togo = this.v.subVectors(shot.goal, b).dot(along);   // metres still to go to the line of the posts or stumps
    if (this.hold < 0 && (togo < 0 || shot.rest > 0 || shot.saved)) {
      this.hold = 0;
      if (shot.saved) this.caption = "Saved!";
    }
    if (this.hold >= 0 && (this.hold += dt) > (shot.scored || shot.saved ? HOLD.scored : HOLD.miss)) { this.skip(); return; }
    const side = new THREE.Vector3().crossVectors(along, UP).normalize();
    const want = new THREE.Vector3();
    let cut: string, follow = 0;

    if (shot.sport !== "c") {
      if (shot.t < 0.55) {
        cut = "boot";                    // low behind the tee, looking up the flight
        want.copy(shot.from).addScaledVector(shot.dir, -3.2).addScaledVector(side, 0.7).addScaledVector(UP, 0.6);
        this.look.copy(b);
        this.fov = 55;
      } else if (togo > 16 && (this.hold < 0 || this.cut === "chase")) {
        cut = "chase";                   // behind and above the ball
        want.copy(b).addScaledVector(shot.dir, -8).addScaledVector(UP, 2.5);
        this.look.copy(b).lerp(shot.goal, 0.15);
        this.fov = 55;
        follow = 5;
      } else {
        cut = "posts";                   // behind the posts and off to one side, looking back down the pitch
        want.copy(this.spot ??= this.postsSpot(shot, side, ground, free));
        this.look.copy(b);
        this.fov = 42;
      }
      this.scale = cut === "posts" && (this.hold < 0 ? togo < 4 : this.hold < 0.6) ? SLOW[shot.sport] : 1;
    } else {
      if (togo > 4.5 && (this.hold < 0 || this.cut === "arm")) {
        cut = "arm";                     // the long lens, high behind the bowler's arm
        want.copy(shot.from).addScaledVector(along, -16).addScaledVector(UP, 4);
        this.look.copy(shot.goal).addScaledVector(UP, 0.5).addScaledVector(along, -7).lerp(b, 0.3);
        this.fov = 20;
      } else {
        cut = "square";                  // low, square of the far stumps
        want.copy(shot.goal).addScaledVector(side, 7).addScaledVector(along, -0.8).addScaledVector(UP, 0.7);
        this.look.copy(shot.goal).addScaledVector(UP, 0.45);
        this.fov = 32;
      }
      this.scale = cut === "square" && (this.hold < 0 ? togo < 3 : this.hold < 0.9) ? SLOW.c : 1;
    }
    want.y = Math.max(want.y, ground(want.x, want.z) + 0.4);
    // never behind a wall: come in towards what we're looking at instead
    if (free && cut !== "posts") {
      const d = want.distanceTo(this.look), f = free(this.look, want);
      if (f < d) want.lerpVectors(this.look, want, Math.max(0, f - GAP) / d);
    }
    // a new camera is a cut; a chasing one swings after the ball
    if (cut !== this.cut || !follow) this.pos.copy(want);
    else this.pos.lerp(want, 1 - Math.exp(-follow * dt));
    this.cut = cut;
  }

  /** Where to stand behind the posts: the first of POSTS that can see the goal, or the first pulled
   *  in close enough to see it. */
  private postsSpot(shot: Shot, side: THREE.Vector3, ground: (x: number, z: number) => number, free?: (a: THREE.Vector3, b: THREE.Vector3) => number): THREE.Vector3 {
    const at = (back: number, out: number, up: number) => {
      const p = shot.goal.clone().addScaledVector(shot.along, back).addScaledVector(side, out);
      p.y = Math.max(p.y + up, ground(p.x, p.z) + 0.4);
      return p;
    };
    const first = at(...POSTS[0]);
    if (!free) return first;
    // the middle of the goal, or the bar of the rugby posts
    const mouth = shot.goal.clone().addScaledVector(UP, shot.sport === "r" ? 3 : 1.2);
    for (const c of POSTS) {
      const p = at(...c), d = p.distanceTo(mouth);
      if (free(mouth, p) >= d) return p;
    }
    const d = first.distanceTo(mouth);
    return first.lerp(mouth, 1 - Math.max(0, free(mouth, first) - GAP) / d);
  }
}
