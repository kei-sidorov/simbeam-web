// Touch streaming: raw pointer events → the daemon's `touch` wire messages.
//
// The control channel is unreliable and unordered, so this module does the two
// things that makes a lossy stream feel right on the device:
//
//   * `move` is thinned — at most one every MOVE_MIN_INTERVAL_MS, and only if
//     the finger actually travelled. Flooding the channel just queues stale
//     positions; the daemon interpolates between what it gets.
//   * `move` also yields to backpressure: when the channel already has bytes
//     queued, the uplink — not us — sets the rate. Mobile links are the case
//     that matters; `down` and `up` are never dropped.
//   * `up` is sent redundantly. A dropped `move` is invisible, a dropped `up`
//     leaves a finger glued to the screen, so it goes out several times.
//
// Pure and DOM-free: the caller supplies normalized [0,1] coordinates, a send
// function, and (in tests) the clock, timer and backlog probe.

import type { TouchMsg } from "./messages";

/** Don't send moves faster than this — roughly one per animation frame. */
export const MOVE_MIN_INTERVAL_MS = 16;
/** Ignore sub-pixel jitter: ~0.1% of the frame, well under one device point. */
export const MOVE_MIN_DIST = 0.001;
/** Delays (ms) at which `up` is repeated after the first copy. */
export const UP_REPEAT_MS = [30, 90];
/**
 * Skip `move` while this many bytes are still queued on the channel. Roughly
 * two messages' worth: on a healthy link the queue drains between frames and
 * this never trips; on a slow uplink it degrades the stream instead of
 * stuffing the send buffer with positions that will arrive stale.
 */
export const MOVE_BACKLOG_LIMIT = 128;
/**
 * Coordinates go out with this many decimals. 1e-4 of the frame is ~0.1 device
 * points — far below what the daemon can act on — and shortens the JSON by a
 * third versus a full double.
 */
const COORD_DECIMALS = 4;

export interface TouchStreamOptions {
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => void;
  /** Bytes still queued on the transport; see MOVE_BACKLOG_LIMIT. */
  backlog?: () => number;
}

/** Trim a normalized coordinate to the precision the wire actually needs. */
function round(v: number): number {
  const f = 10 ** COORD_DECIMALS;
  return Math.round(v * f) / f;
}

export class TouchStream {
  private down_ = false;
  /** Last position we actually sent (for the distance filter). */
  private sentX = 0;
  private sentY = 0;
  /** Last position we saw, sent or not — where an `up` lands by default. */
  private lastX = 0;
  private lastY = 0;
  private sentAt = 0;
  /** Bumped on every `down`; stale `up` repeats from an older gesture are dropped. */
  private gesture = 0;

  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => void;
  private readonly backlog: () => number;

  constructor(
    private send: (msg: TouchMsg) => void,
    opts: TouchStreamOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.setTimer = opts.setTimer ?? ((fn, ms) => void setTimeout(fn, ms));
    this.backlog = opts.backlog ?? (() => 0);
  }

  /** True while a finger is down — i.e. moves are being streamed. */
  get isDown(): boolean {
    return this.down_;
  }

  down(x: number, y: number): void {
    // Defensive: a `down` without its `up` (lost pointer capture, re-render)
    // would otherwise leave the device holding two fingers.
    if (this.down_) this.up(this.lastX, this.lastY);
    this.gesture++;
    this.down_ = true;
    this.mark(x, y);
    this.send({ type: "touch", action: "down", x: round(x), y: round(y) });
  }

  move(x: number, y: number): void {
    if (!this.down_) return;
    this.lastX = x;
    this.lastY = y;
    if (this.now() - this.sentAt < MOVE_MIN_INTERVAL_MS) return;
    if (Math.hypot(x - this.sentX, y - this.sentY) < MOVE_MIN_DIST) return;
    // The uplink is behind — let it catch up rather than queue a stale point.
    if (this.backlog() > MOVE_BACKLOG_LIMIT) return;
    this.mark(x, y);
    this.send({ type: "touch", action: "move", x: round(x), y: round(y) });
  }

  /** Lift the finger. Coordinates default to the last position seen. */
  up(x = this.lastX, y = this.lastY): void {
    if (!this.down_) return;
    this.down_ = false;
    const gesture = this.gesture;
    const msg: TouchMsg = { type: "touch", action: "up", x: round(x), y: round(y) };
    this.send(msg);
    for (const ms of UP_REPEAT_MS) {
      this.setTimer(() => {
        // A new gesture started meanwhile — repeating this `up` would lift it.
        if (this.gesture === gesture) this.send({ ...msg });
      }, ms);
    }
  }

  /** Pointer cancelled (gesture stolen by the browser) — lift where we stand. */
  cancel(): void {
    this.up();
  }

  private mark(x: number, y: number): void {
    this.sentX = x;
    this.sentY = y;
    this.lastX = x;
    this.lastY = y;
    this.sentAt = this.now();
  }
}
