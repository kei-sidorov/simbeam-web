// The pre-`touch` input path: recognise the gesture here and send the daemon a
// finished `tap` or `swipe`.
//
// Kept for daemons that do not report the `touch` capability, and used until a
// `hello` says otherwise — every daemon understands these two, so it is the
// safe default while we still know nothing. What it cannot express is the
// reason `touch` exists: a long press, a drag, inertial scroll.

import type { PointerSink } from "./touch";

/** Below this travel the gesture is a tap. ~1.5% of the frame, a few points. */
export const TAP_MAX_DIST = 0.015;
/** The daemon rejects a zero-length swipe; keep the floor the old client had. */
const MIN_SWIPE_SECONDS = 0.05;

export interface TapMsg {
  type: "tap";
  x: number;
  y: number;
}

export interface SwipeMsg {
  type: "swipe";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Seconds. */
  duration: number;
}

export class SwipeSynth implements PointerSink {
  private start: { x: number; y: number; t: number } | null = null;
  private lastX = 0;
  private lastY = 0;
  private readonly now: () => number;

  constructor(
    private send: (msg: TapMsg | SwipeMsg) => void,
    opts: { now?: () => number } = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
  }

  down(x: number, y: number): void {
    this.start = { x, y, t: this.now() };
    this.lastX = x;
    this.lastY = y;
  }

  /** Nothing goes out mid-gesture: the daemon wants the whole thing at once. */
  move(x: number, y: number): void {
    if (!this.start) return;
    this.lastX = x;
    this.lastY = y;
  }

  up(x = this.lastX, y = this.lastY): void {
    const start = this.start;
    if (!start) return;
    this.start = null;
    if (Math.hypot(x - start.x, y - start.y) < TAP_MAX_DIST) {
      this.send({ type: "tap", x: start.x, y: start.y });
      return;
    }
    const duration = Math.max(MIN_SWIPE_SECONDS, (this.now() - start.t) / 1000);
    this.send({ type: "swipe", x1: start.x, y1: start.y, x2: x, y2: y, duration });
  }

  /** A cancelled gesture sends nothing — there is no half a tap. */
  cancel(): void {
    this.start = null;
  }
}
