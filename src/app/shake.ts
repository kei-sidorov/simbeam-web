// Physical shake detection via the DeviceMotion API. Portable enough to test
// in isolation: the motion algorithm is pure and lives in `feedSample`, while
// permission + listener wiring sit behind `enable`/`stop`.
//
// iOS Safari 13+ gates motion behind `DeviceMotionEvent.requestPermission()`,
// which only resolves when called from a user gesture — so `enable()` must be
// invoked from a click handler (we piggyback on the first Shake-button tap).

export type ShakePermission = "granted" | "denied" | "unsupported";

/** Summed absolute per-axis acceleration change (m/s²) that counts as a jerk. */
const JERK_THRESHOLD = 22;
/** Ignore motion samples closer together than this (throttle ~16 Hz). */
const SAMPLE_MIN_MS = 60;
/** A real shake oscillates: require this many jerks inside the window below. */
const REQUIRED_JERKS = 2;
const JERK_WINDOW_MS = 600;
/** Quiet period after a fired shake, so one shake sends one event. */
const COOLDOWN_MS = 1000;

/** The webkit-only permission hook, absent on Android/desktop. */
interface MotionPermissionApi {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

export class ShakeDetector {
  private listening = false;
  private primed = false;
  private lx = 0;
  private ly = 0;
  private lz = 0;
  private lastSample = 0;
  private lastFired = 0;
  private jerks: number[] = [];

  constructor(private readonly onShake: () => void) {}

  /** True once we are actively listening for shakes. */
  get active(): boolean {
    return this.listening;
  }

  /**
   * Request permission if the platform requires it, then start listening.
   * Idempotent; on iOS it must run inside a user gesture. Returns the resulting
   * permission state ("granted" also covers platforms with no prompt).
   */
  async enable(): Promise<ShakePermission> {
    if (this.listening) return "granted";
    if (typeof DeviceMotionEvent === "undefined") return "unsupported";
    const request = (DeviceMotionEvent as unknown as MotionPermissionApi).requestPermission;
    if (typeof request === "function") {
      let result: "granted" | "denied" | "default";
      try {
        result = await request.call(DeviceMotionEvent);
      } catch {
        return "denied";
      }
      if (result !== "granted") return "denied";
    }
    this.start();
    return "granted";
  }

  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    this.primed = false;
    this.jerks = [];
    window.removeEventListener("devicemotion", this.onMotion);
  }

  private start(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener("devicemotion", this.onMotion);
  }

  private readonly onMotion = (e: DeviceMotionEvent): void => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    this.feedSample(a.x, a.y, a.z, Date.now());
  };

  /** Pure core: fold one acceleration sample in, firing `onShake` on a shake. */
  feedSample(x: number, y: number, z: number, now: number): void {
    if (now - this.lastSample < SAMPLE_MIN_MS) return;
    this.lastSample = now;

    // The first sample only establishes a baseline — never a jerk on its own.
    if (!this.primed) {
      this.lx = x;
      this.ly = y;
      this.lz = z;
      this.primed = true;
      return;
    }

    const delta = Math.abs(x - this.lx) + Math.abs(y - this.ly) + Math.abs(z - this.lz);
    this.lx = x;
    this.ly = y;
    this.lz = z;

    if (delta < JERK_THRESHOLD) return;
    if (now - this.lastFired < COOLDOWN_MS) return;

    this.jerks.push(now);
    this.jerks = this.jerks.filter((t) => now - t <= JERK_WINDOW_MS);
    if (this.jerks.length >= REQUIRED_JERKS) {
      this.jerks = [];
      this.lastFired = now;
      this.onShake();
    }
  }
}
