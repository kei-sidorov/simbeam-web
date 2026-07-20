import { describe, expect, it } from "vitest";
import type { KV } from "../protocol/identity";
import { loadThemePref, nextThemePref, resolveTheme, saveThemePref } from "./theme";

function fakeKV(seed: Record<string, string> = {}): KV {
  const store = new Map(Object.entries(seed));
  return {
    get: (k) => store.get(k) ?? null,
    set: (k, v) => void store.set(k, v),
    remove: (k) => void store.delete(k),
  };
}

describe("theme preference", () => {
  it("cycles auto → light → dark → auto", () => {
    expect(nextThemePref("auto")).toBe("light");
    expect(nextThemePref("light")).toBe("dark");
    expect(nextThemePref("dark")).toBe("auto");
  });

  it("defaults to auto when nothing (or garbage) is stored", () => {
    expect(loadThemePref(fakeKV())).toBe("auto");
    expect(loadThemePref(fakeKV({ simbeam_theme: "neon" }))).toBe("auto");
  });

  it("round-trips a saved preference", () => {
    const kv = fakeKV();
    saveThemePref(kv, "dark");
    expect(loadThemePref(kv)).toBe("dark");
  });

  it("resolves pinned preferences verbatim", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves auto to light without a matchMedia (Node) environment", () => {
    expect(resolveTheme("auto")).toBe("light");
  });
});
