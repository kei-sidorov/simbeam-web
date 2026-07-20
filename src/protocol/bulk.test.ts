import { describe, expect, it } from "vitest";
import { BulkReceiver } from "./bulk";

describe("BulkReceiver", () => {
  it("reassembles a chunked screenshot in arrival order", () => {
    const r = new BulkReceiver();
    expect(r.feed(JSON.stringify({ type: "screenshot", bytes: 5 }))).toEqual({ status: "pending" });
    expect(r.feed(new Uint8Array([1, 2]))).toEqual({ status: "pending" });
    const res = r.feed(new Uint8Array([3, 4, 5]));
    expect(res).toEqual({
      status: "done",
      kind: "screenshot",
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
    });
  });

  it("reassembles a chunked sims reply and tags it as sims", () => {
    const r = new BulkReceiver();
    const json = new TextEncoder().encode('[{"udid":"A","name":"iPhone"}]');
    expect(r.feed(JSON.stringify({ type: "sims", bytes: json.length }))).toEqual({
      status: "pending",
    });
    expect(r.feed(json.subarray(0, 10))).toEqual({ status: "pending" });
    const res = r.feed(json.subarray(10));
    expect(res).toEqual({ status: "done", kind: "sims", bytes: json });
  });

  it("completes when the header arrives after all chunks", () => {
    const r = new BulkReceiver();
    expect(r.feed(new Uint8Array([9, 8]))).toEqual({ status: "pending" });
    const res = r.feed(JSON.stringify({ type: "screenshot", bytes: 2 }));
    expect(res).toEqual({ status: "done", kind: "screenshot", bytes: new Uint8Array([9, 8]) });
  });

  it("reports a text error frame as failure", () => {
    const r = new BulkReceiver();
    const res = r.feed(
      JSON.stringify({ type: "error", msg: "no attachment", code: "no_attachment" }),
    );
    expect(res).toEqual({ status: "error", msg: "no attachment", code: "no_attachment" });
  });

  it("trims to exactly `bytes` if a final chunk overshoots", () => {
    const r = new BulkReceiver();
    r.feed(JSON.stringify({ type: "screenshot", bytes: 3 }));
    r.feed(new Uint8Array([1, 2]));
    const res = r.feed(new Uint8Array([3, 4, 5]));
    expect(res).toEqual({ status: "done", kind: "screenshot", bytes: new Uint8Array([1, 2, 3]) });
  });
});
