import { describe, expect, it } from "vitest";
import { ShakeDetector } from "./shake";

const G = 9.8;
const T0 = 1_000_000;

function detector(): { d: ShakeDetector; fired: () => number } {
  let count = 0;
  const d = new ShakeDetector(() => {
    count += 1;
  });
  return { d, fired: () => count };
}

describe("ShakeDetector.feedSample", () => {
  it("primes on the first sample without firing", () => {
    const { d, fired } = detector();
    d.feedSample(0, 0, G, T0);
    expect(fired()).toBe(0);
  });

  it("fires once after two jerks within the window", () => {
    const { d, fired } = detector();
    d.feedSample(0, 0, G, T0); // prime
    d.feedSample(40, 0, G, T0 + 100); // jerk 1 (delta 40)
    d.feedSample(0, 0, G, T0 + 200); // jerk 2 -> shake
    expect(fired()).toBe(1);
  });

  it("ignores a single isolated jerk", () => {
    const { d, fired } = detector();
    d.feedSample(0, 0, G, T0);
    d.feedSample(40, 0, G, T0 + 100);
    expect(fired()).toBe(0);
  });

  it("does not fire on gentle sub-threshold motion", () => {
    const { d, fired } = detector();
    d.feedSample(0, 0, G, T0);
    for (let i = 1; i <= 12; i++) {
      d.feedSample((i % 2) * 5, 0, G, T0 + i * 100); // deltas of 5, below 22
    }
    expect(fired()).toBe(0);
  });

  it("throttles samples closer than the minimum interval", () => {
    const { d, fired } = detector();
    d.feedSample(0, 0, G, T0); // prime
    d.feedSample(40, 0, G, T0 + 10); // 10ms apart -> ignored
    d.feedSample(0, 0, G, T0 + 20); // still throttled
    expect(fired()).toBe(0);
  });

  it("enforces a cooldown between shakes", () => {
    const { d, fired } = detector();
    d.feedSample(0, 0, G, T0); // prime
    d.feedSample(40, 0, G, T0 + 100);
    d.feedSample(0, 0, G, T0 + 200); // shake #1
    expect(fired()).toBe(1);

    // More jerks inside the cooldown window do not fire again.
    d.feedSample(40, 0, G, T0 + 300);
    d.feedSample(0, 0, G, T0 + 400);
    expect(fired()).toBe(1);

    // After the cooldown, a fresh pair of jerks fires again.
    d.feedSample(40, 0, G, T0 + 1600);
    d.feedSample(0, 0, G, T0 + 1700);
    expect(fired()).toBe(2);
  });
});
