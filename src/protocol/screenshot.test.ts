import { describe, expect, it } from "vitest";
import { ScreenshotReceiver } from "./screenshot";

describe("ScreenshotReceiver", () => {
  it("reassembles a chunked PNG in arrival order", () => {
    const r = new ScreenshotReceiver();
    expect(r.feed(JSON.stringify({ type: "screenshot", bytes: 5 }))).toEqual({ status: "pending" });
    expect(r.feed(new Uint8Array([1, 2]))).toEqual({ status: "pending" });
    const res = r.feed(new Uint8Array([3, 4, 5]));
    expect(res).toEqual({ status: "done", png: new Uint8Array([1, 2, 3, 4, 5]) });
  });

  it("completes when the header arrives after all chunks", () => {
    const r = new ScreenshotReceiver();
    expect(r.feed(new Uint8Array([9, 8]))).toEqual({ status: "pending" });
    const res = r.feed(JSON.stringify({ type: "screenshot", bytes: 2 }));
    expect(res).toEqual({ status: "done", png: new Uint8Array([9, 8]) });
  });

  it("reports a text error frame as failure", () => {
    const r = new ScreenshotReceiver();
    const res = r.feed(
      JSON.stringify({ type: "error", msg: "no attachment", code: "no_attachment" }),
    );
    expect(res).toEqual({ status: "error", msg: "no attachment", code: "no_attachment" });
  });

  it("trims to exactly `bytes` if a final chunk overshoots", () => {
    const r = new ScreenshotReceiver();
    r.feed(JSON.stringify({ type: "screenshot", bytes: 3 }));
    r.feed(new Uint8Array([1, 2]));
    const res = r.feed(new Uint8Array([3, 4, 5]));
    expect(res).toEqual({ status: "done", png: new Uint8Array([1, 2, 3]) });
  });
});
