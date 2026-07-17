import { describe, expect, it } from "vitest";
import { b64ToBytes, bytesToB64 } from "./b64";

describe("base64", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 255, 42, 13]);
    expect(b64ToBytes(bytesToB64(bytes))).toEqual(bytes);
  });

  it("encodes known vectors", () => {
    expect(bytesToB64(new Uint8Array([104, 105]))).toBe("aGk=");
    expect(b64ToBytes("aGk=")).toEqual(new Uint8Array([104, 105]));
  });

  it("handles empty input", () => {
    expect(bytesToB64(new Uint8Array([]))).toBe("");
    expect(b64ToBytes("")).toEqual(new Uint8Array([]));
  });
});
