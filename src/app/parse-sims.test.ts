import { describe, expect, it } from "vitest";
import { parseSims } from "./controller";

const enc = (s: string) => new TextEncoder().encode(s);

describe("parseSims", () => {
  it("reads the daemon's wrapped {type,sims} object", () => {
    const sims = parseSims(
      enc(
        '{"type":"sims","sims":[{"udid":"A","name":"iPhone","state":"Booted","os_version":"18.0"}]}',
      ),
    );
    expect(sims).toEqual([{ udid: "A", name: "iPhone", state: "Booted", os_version: "18.0" }]);
  });

  it("also accepts a bare JSON array", () => {
    expect(parseSims(enc('[{"udid":"B","name":"iPad"}]'))).toEqual([{ udid: "B", name: "iPad" }]);
  });

  it("returns [] for an empty list either way", () => {
    expect(parseSims(enc('{"type":"sims","sims":[]}'))).toEqual([]);
    expect(parseSims(enc("[]"))).toEqual([]);
  });

  it("returns [] on malformed or unexpected JSON", () => {
    expect(parseSims(enc("not json"))).toEqual([]);
    expect(parseSims(enc('{"type":"sims"}'))).toEqual([]);
  });
});
