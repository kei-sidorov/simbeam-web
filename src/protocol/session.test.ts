import { describe, expect, it } from "vitest";
import { candidateQueue, classifyTransport } from "./session";

describe("candidateQueue", () => {
  it("holds candidates until the remote description is applied, then flushes in order", () => {
    const applied: string[] = [];
    const q = candidateQueue((c) => applied.push(String(c.candidate)));
    q.add({ candidate: "a" });
    q.add({ candidate: "b" });
    expect(applied).toEqual([]);
    q.open();
    expect(applied).toEqual(["a", "b"]);
  });

  it("drops candidates past the buffer cap", () => {
    const applied: string[] = [];
    const q = candidateQueue((c) => applied.push(String(c.candidate)), 2);
    for (const candidate of ["a", "b", "c"]) q.add({ candidate });
    q.open();
    expect(applied).toEqual(["a", "b"]);
  });

  it("applies straight through once open", () => {
    const applied: string[] = [];
    const q = candidateQueue((c) => applied.push(String(c.candidate)));
    q.open();
    q.add({ candidate: "a" });
    expect(applied).toEqual(["a"]);
  });
});

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
