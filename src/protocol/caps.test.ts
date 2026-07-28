import { describe, expect, it } from "vitest";
import { CAPS, capGap, isCap, parseCaps } from "./caps";

describe("caps", () => {
  it("keeps only the capabilities this client knows", () => {
    expect(parseCaps(["touch", "app_switcher", "teleport"])).toEqual(["touch", "app_switcher"]);
    expect(isCap("touch")).toBe(true);
    expect(isCap("teleport")).toBe(false);
  });

  it("treats a daemon that predates capabilities as supporting none", () => {
    for (const raw of [undefined, null, "touch", 42, {}]) {
      expect(parseCaps(raw)).toEqual([]);
    }
  });

  it("reports what the daemon is missing so we can ask for an update", () => {
    expect(capGap(["touch"]).missing).toEqual(["app_switcher"]);
    expect(capGap([]).missing).toEqual([...CAPS]);
    expect(capGap([...CAPS]).missing).toEqual([]);
  });

  it("reports capabilities we do not know — then this client is the old one", () => {
    const gap = capGap(["touch", "app_switcher", "haptics"]);
    expect(gap.unknown).toEqual(["haptics"]);
    expect(gap.missing).toEqual([]);
  });

  it("survives junk inside the array", () => {
    const gap = capGap(["touch", 7, null]);
    expect(gap.unknown).toEqual([]);
    expect(gap.missing).toEqual(["app_switcher"]);
    expect(parseCaps(["touch", 7, null])).toEqual(["touch"]);
  });
});
