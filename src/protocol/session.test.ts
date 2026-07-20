import { describe, expect, it } from "vitest";
import { classifyTransport } from "./session";

describe("classifyTransport", () => {
  it("calls two host ends a LAN link", () => {
    expect(classifyTransport("host", "host")).toBe("lan");
  });

  it("calls any relay end a relayed link", () => {
    expect(classifyTransport("relay", "host")).toBe("relay");
    expect(classifyTransport("host", "relay")).toBe("relay");
    expect(classifyTransport("relay", "relay")).toBe("relay");
  });

  it("calls a reflexive (NAT-traversed) pair a direct P2P link", () => {
    expect(classifyTransport("srflx", "srflx")).toBe("p2p");
    expect(classifyTransport("host", "srflx")).toBe("p2p");
    expect(classifyTransport("prflx", "host")).toBe("p2p");
  });

  it("prefers relay over any other classification", () => {
    // relay wins even when a host end could otherwise read as LAN/P2P
    expect(classifyTransport("relay", "srflx")).toBe("relay");
  });
});
