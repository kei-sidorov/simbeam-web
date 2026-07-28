import { describe, expect, it } from "vitest";
import type { TouchMsg } from "./messages";
import { MOVE_BACKLOG_LIMIT, MOVE_MIN_INTERVAL_MS, TouchStream, UP_REPEAT_MS } from "./touch";

/** A stream on a fake clock; timers fire only when `runTimers` is called. */
function harness() {
  const sent: TouchMsg[] = [];
  const timers: Array<() => void> = [];
  let t = 0;
  let backlog = 0;
  const stream = new TouchStream((m) => sent.push(m), {
    now: () => t,
    setTimer: (fn) => void timers.push(fn),
    backlog: () => backlog,
  });
  return {
    stream,
    sent,
    setBacklog: (n: number) => {
      backlog = n;
    },
    advance: (ms: number) => {
      t += ms;
    },
    runTimers: () => {
      const due = timers.splice(0);
      for (const fn of due) fn();
    },
    actions: () => sent.map((m) => m.action),
  };
}

describe("TouchStream", () => {
  it("sends down immediately", () => {
    const h = harness();
    h.stream.down(0.5, 0.25);
    expect(h.sent).toEqual([{ type: "touch", action: "down", x: 0.5, y: 0.25 }]);
    expect(h.stream.isDown).toBe(true);
  });

  it("ignores moves and ups with no finger down", () => {
    const h = harness();
    h.stream.move(0.5, 0.5);
    h.stream.up(0.5, 0.5);
    expect(h.sent).toEqual([]);
  });

  it("thins moves that arrive faster than the interval", () => {
    const h = harness();
    h.stream.down(0, 0);
    for (let i = 1; i <= 5; i++) {
      h.advance(2);
      h.stream.move(i / 100, 0);
    }
    expect(h.actions()).toEqual(["down"]);
    h.advance(MOVE_MIN_INTERVAL_MS);
    h.stream.move(0.2, 0);
    expect(h.actions()).toEqual(["down", "move"]);
  });

  it("drops moves that barely travel", () => {
    const h = harness();
    h.stream.down(0.5, 0.5);
    h.advance(100);
    h.stream.move(0.5000001, 0.5);
    expect(h.actions()).toEqual(["down"]);
  });

  it("lifts at the last position seen, even if that move was thinned", () => {
    const h = harness();
    h.stream.down(0, 0);
    h.stream.move(0.4, 0.6); // thinned — too soon after `down`
    h.stream.up();
    expect(h.sent.at(-1)).toEqual({ type: "touch", action: "up", x: 0.4, y: 0.6 });
  });

  it("repeats up — the channel is lossy and a stuck finger is worse", () => {
    const h = harness();
    h.stream.down(0.1, 0.2);
    h.stream.up(0.1, 0.2);
    expect(h.actions()).toEqual(["down", "up"]);
    h.runTimers();
    expect(h.actions()).toEqual(["down", "up", ...UP_REPEAT_MS.map(() => "up")]);
    expect(h.sent.every((m) => m.action !== "up" || (m.x === 0.1 && m.y === 0.2))).toBe(true);
  });

  it("suppresses stale up repeats once the next gesture starts", () => {
    const h = harness();
    h.stream.down(0, 0);
    h.stream.up(0, 0);
    h.stream.down(0.9, 0.9);
    h.runTimers();
    expect(h.actions()).toEqual(["down", "up", "down"]);
  });

  it("closes an orphaned gesture when a new down arrives", () => {
    const h = harness();
    h.stream.down(0.2, 0.2);
    h.stream.down(0.8, 0.8);
    expect(h.actions()).toEqual(["down", "up", "down"]);
    expect(h.sent[1]).toEqual({ type: "touch", action: "up", x: 0.2, y: 0.2 });
  });

  it("holds moves back while the channel is congested", () => {
    const h = harness();
    h.stream.down(0, 0);
    h.setBacklog(MOVE_BACKLOG_LIMIT + 1);
    h.advance(100);
    h.stream.move(0.3, 0.3);
    expect(h.actions()).toEqual(["down"]);
    h.setBacklog(0);
    h.advance(100);
    h.stream.move(0.4, 0.4);
    expect(h.actions()).toEqual(["down", "move"]);
  });

  it("never holds back down or up, however congested", () => {
    const h = harness();
    h.setBacklog(MOVE_BACKLOG_LIMIT * 100);
    h.stream.down(0.5, 0.5);
    h.stream.up(0.5, 0.5);
    h.runTimers();
    expect(h.actions()).toEqual(["down", "up", "up", "up"]);
  });

  it("rounds coordinates to what the wire needs", () => {
    const h = harness();
    h.stream.down(0.5123456789012345, 0.32165498);
    h.advance(100);
    h.stream.move(0.98765432, 0.11111111);
    h.stream.up(0.4999999, 0.5000001);
    expect(h.sent).toEqual([
      { type: "touch", action: "down", x: 0.5123, y: 0.3217 },
      { type: "touch", action: "move", x: 0.9877, y: 0.1111 },
      { type: "touch", action: "up", x: 0.5, y: 0.5 },
    ]);
  });

  it("cancel lifts the finger, and is a no-op afterwards", () => {
    const h = harness();
    h.stream.down(0.3, 0.3);
    h.stream.cancel();
    h.stream.cancel();
    expect(h.actions()).toEqual(["down", "up"]);
    expect(h.stream.isDown).toBe(false);
  });
});
