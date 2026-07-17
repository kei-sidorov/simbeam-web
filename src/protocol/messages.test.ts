import { describe, expect, it } from "vitest";
import { deviceKind } from "./messages";

describe("deviceKind", () => {
  it("classifies iPads", () => {
    expect(deviceKind('iPad Pro 13"')).toBe("ipad");
    expect(deviceKind("iPad mini")).toBe("ipad");
  });

  it("classifies home-button iPhones as legacy", () => {
    expect(deviceKind("iPhone SE (3rd gen)")).toBe("legacy");
    expect(deviceKind("iPhone 8 Plus")).toBe("legacy");
  });

  it("classifies modern iPhones as phone", () => {
    expect(deviceKind("iPhone 17")).toBe("phone");
    expect(deviceKind("iPhone 17 Pro")).toBe("phone");
    expect(deviceKind("iPhone 15")).toBe("phone");
  });
});
