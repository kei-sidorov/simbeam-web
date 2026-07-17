import { describe, expect, it } from "vitest";
import { mergePresence } from "./presence";

describe("mergePresence", () => {
  it("applies a full snapshot", () => {
    const next = mergePresence({}, { type: "presence", states: { a: true, b: false } });
    expect(next).toEqual({ a: true, b: false });
  });

  it("applies a one-key delta without dropping others", () => {
    const next = mergePresence({ a: true, b: false }, { type: "presence", states: { b: true } });
    expect(next).toEqual({ a: true, b: true });
  });

  it("does not mutate the input map", () => {
    const cur = { a: true };
    mergePresence(cur, { type: "presence", states: { a: false } });
    expect(cur).toEqual({ a: true });
  });
});
