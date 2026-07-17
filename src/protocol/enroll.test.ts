import { describe, expect, it } from "vitest";
import { enrollProof, parsePairingFragment } from "./enroll";

describe("enrollProof", () => {
  // Reference vector computed independently with Node crypto over the exact
  // byte layout: base64(pub) ‖ 0x00 ‖ base64(nonce), HMAC-SHA256 keyed by S.
  it("matches the canonical byte layout", async () => {
    const proof = await enrollProof("s3cret", "cHVia2V5", "bm9uY2U=");
    expect(proof).toBe("lzrgRSCoKgabMdIWc8LlOx+xbH+kRzwPGciVK0+KToM=");
  });

  it("changes when any input changes", async () => {
    const base = await enrollProof("s", "p", "n");
    expect(await enrollProof("s2", "p", "n")).not.toBe(base);
    expect(await enrollProof("s", "p2", "n")).not.toBe(base);
    expect(await enrollProof("s", "p", "n2")).not.toBe(base);
  });

  it("places a zero byte between pub and nonce (not concatenated)", async () => {
    // "ab"+0+"c" must differ from "a"+0+"bc" — proves the separator is positional.
    const a = await enrollProof("k", "ab", "c");
    const b = await enrollProof("k", "a", "bc");
    expect(a).not.toBe(b);
  });
});

describe("parsePairingFragment", () => {
  it("parses a full fragment", () => {
    const p = parsePairingFragment("#signal=wss://b/ws&daemon=DKEY&pair=SECRET");
    expect(p).toEqual({ signal: "wss://b/ws", daemon: "DKEY", pair: "SECRET" });
  });

  it("tolerates a missing leading hash", () => {
    const p = parsePairingFragment("signal=wss://b/ws&daemon=DKEY&pair=SECRET");
    expect(p?.daemon).toBe("DKEY");
  });

  it("returns null when any parameter is missing", () => {
    expect(parsePairingFragment("#signal=x&daemon=y")).toBeNull();
    expect(parsePairingFragment("#daemon=y&pair=z")).toBeNull();
    expect(parsePairingFragment("")).toBeNull();
  });

  it("url-decodes values", () => {
    const p = parsePairingFragment("#signal=wss%3A%2F%2Fb%2Fws&daemon=d&pair=p");
    expect(p?.signal).toBe("wss://b/ws");
  });
});
