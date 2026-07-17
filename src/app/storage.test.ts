import { beforeEach, describe, expect, it } from "vitest";
import type { KV } from "../protocol/identity";
import { loadMacs, removeMac, saveMac } from "./storage";

function memKV(): KV {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

describe("saved Macs", () => {
  let kv: KV;
  beforeEach(() => {
    kv = memKV();
  });

  it("starts empty", () => {
    expect(loadMacs(kv)).toEqual([]);
  });

  it("saves and reloads a Mac", () => {
    saveMac(kv, { signal: "wss://b/ws", daemon: "D1", name: "Mac One" });
    expect(loadMacs(kv)).toEqual([{ signal: "wss://b/ws", daemon: "D1", name: "Mac One" }]);
  });

  it("deduplicates by daemon id (last write wins)", () => {
    saveMac(kv, { signal: "wss://b/ws", daemon: "D1", name: "Old" });
    const macs = saveMac(kv, { signal: "wss://b/ws", daemon: "D1", name: "New" });
    expect(macs).toHaveLength(1);
    expect(macs[0]?.name).toBe("New");
  });

  it("removes by daemon id", () => {
    saveMac(kv, { signal: "wss://b/ws", daemon: "D1", name: "One" });
    saveMac(kv, { signal: "wss://b/ws", daemon: "D2", name: "Two" });
    const macs = removeMac(kv, "D1");
    expect(macs.map((m) => m.daemon)).toEqual(["D2"]);
  });

  it("survives corrupt storage", () => {
    kv.set("simbeam_macs", "{not json");
    expect(loadMacs(kv)).toEqual([]);
  });
});
