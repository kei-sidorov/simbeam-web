import { describe, expect, it } from "vitest";
import { type LogEnv, SessionLog, safeUrl } from "./log";

const ENV: LogEnv = {
  url: "https://app.simbeam.dev/",
  signal: "wss://signal.simbeam.dev/ws",
  userAgent: "TestBrowser/1.0",
  viewport: "390x844 dpr 3",
  identity: "AbCdEfGh…",
};

/** A log on a clock we advance by hand. */
function harness() {
  let t = 1_000_000;
  const log = new SessionLog(() => t);
  return {
    log,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("SessionLog", () => {
  it("stamps entries relative to the session start", () => {
    const h = harness();
    h.advance(1500);
    h.log.info("dial");
    h.advance(250);
    h.log.error("boom");
    expect(h.log.entries()).toEqual([
      { at: 1500, level: "info", msg: "dial" },
      { at: 1750, level: "error", msg: "boom" },
    ]);
  });

  it("keeps the tail when the session runs long", () => {
    const h = harness();
    for (let i = 0; i < 700; i++) h.log.info(`event ${i}`);
    const entries = h.log.entries();
    expect(entries.length).toBe(600);
    expect(entries[0]?.msg).toBe("event 100");
    expect(entries.at(-1)?.msg).toBe("event 699");
  });

  it("truncates a runaway message", () => {
    const h = harness();
    h.log.error("x".repeat(1000));
    const msg = h.log.entries()[0]?.msg ?? "";
    expect(msg.length).toBe(401);
    expect(msg.endsWith("…")).toBe(true);
  });

  it("formats a header plus the entries", () => {
    const h = harness();
    h.advance(2000);
    h.log.info("phase: connected");
    h.advance(61_000);
    const text = h.log.format(ENV, "2026-07-28T09:00:00.000Z");
    expect(text).toContain("simbeam-web session log");
    expect(text).toContain("started  2026-07-28T09:00:00.000Z");
    expect(text).toContain("elapsed  1m 03s");
    expect(text).toContain("ua       TestBrowser/1.0");
    expect(text).toContain("identity AbCdEfGh…");
    expect(text).toContain("+2.000s  info   phase: connected");
  });

  it("never carries the pairing secret in the url", () => {
    const secret = "#daemon=D1&pair=SUPERSECRET";
    expect(safeUrl(`https://app.simbeam.dev/${secret}`)).toBe("https://app.simbeam.dev/#…");
    expect(safeUrl("https://app.simbeam.dev/")).toBe("https://app.simbeam.dev/");
    expect(safeUrl(`https://app.simbeam.dev/${secret}`)).not.toContain("SUPERSECRET");
  });
});
