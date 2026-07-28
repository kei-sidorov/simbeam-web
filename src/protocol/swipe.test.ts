import { describe, expect, it } from "vitest";
import { type SwipeMsg, SwipeSynth, type TapMsg } from "./swipe";

function harness() {
  const sent: (TapMsg | SwipeMsg)[] = [];
  let t = 0;
  const synth = new SwipeSynth((m) => sent.push(m), { now: () => t });
  return {
    synth,
    sent,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("SwipeSynth", () => {
  it("sends nothing until the gesture ends", () => {
    const h = harness();
    h.synth.down(0.5, 0.5);
    h.advance(50);
    h.synth.move(0.5, 0.7);
    expect(h.sent).toEqual([]);
  });

  it("calls a short gesture a tap, at the point it started", () => {
    const h = harness();
    h.synth.down(0.5, 0.5);
    h.advance(80);
    h.synth.move(0.502, 0.501);
    h.synth.up(0.502, 0.501);
    expect(h.sent).toEqual([{ type: "tap", x: 0.5, y: 0.5 }]);
  });

  it("calls a long one a swipe, with its duration in seconds", () => {
    const h = harness();
    h.synth.down(0.5, 0.8);
    h.advance(300);
    h.synth.up(0.5, 0.2);
    expect(h.sent).toEqual([{ type: "swipe", x1: 0.5, y1: 0.8, x2: 0.5, y2: 0.2, duration: 0.3 }]);
  });

  it("floors the duration — the daemon rejects an instant swipe", () => {
    const h = harness();
    h.synth.down(0.1, 0.1);
    h.synth.up(0.9, 0.9);
    expect((h.sent[0] as SwipeMsg).duration).toBe(0.05);
  });

  it("lifts at the last position seen when up brings none", () => {
    const h = harness();
    h.synth.down(0.2, 0.2);
    h.advance(200);
    h.synth.move(0.8, 0.2);
    h.synth.up();
    expect(h.sent).toEqual([{ type: "swipe", x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.2, duration: 0.2 }]);
  });

  it("sends nothing for a cancelled gesture — there is no half a tap", () => {
    const h = harness();
    h.synth.down(0.5, 0.5);
    h.synth.cancel();
    h.synth.up(0.5, 0.5);
    expect(h.sent).toEqual([]);
  });

  it("ignores moves and ups with no gesture in flight", () => {
    const h = harness();
    h.synth.move(0.5, 0.5);
    h.synth.up(0.5, 0.5);
    expect(h.sent).toEqual([]);
  });
});
