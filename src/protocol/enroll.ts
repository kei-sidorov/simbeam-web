import { bytesToB64 } from "./b64";

/**
 * Enrollment proof: base64(HMAC-SHA256(S, clientPubKey ‖ 0x00 ‖ nonce)).
 * The message bytes must match the daemon byte-for-byte: the base64 pubkey
 * string, a single zero byte, then the base64 nonce string.
 */
export async function enrollProof(
  secret: string,
  pubB64: string,
  nonceB64: string,
): Promise<string> {
  const enc = new TextEncoder();
  const a = enc.encode(pubB64);
  const b = enc.encode(nonceB64);
  const msg = new Uint8Array(a.length + 1 + b.length);
  msg.set(a, 0);
  msg[a.length] = 0;
  msg.set(b, a.length + 1);

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, msg as BufferSource);
  return bytesToB64(new Uint8Array(sig));
}

export interface PairingParams {
  /** Broker WebSocket URL to dial. */
  signal: string;
  /** The daemon's public key — pinned as the Mac's identity. */
  daemon: string;
  /** One-time pairing secret S. */
  pair: string;
}

/**
 * Parses a pairing URL fragment (`#signal=…&daemon=…&pair=…`).
 * Returns null unless all three parameters are present.
 */
export function parsePairingFragment(hash: string): PairingParams | null {
  const f = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const signal = f.get("signal");
  const daemon = f.get("daemon");
  const pair = f.get("pair");
  return signal && daemon && pair ? { signal, daemon, pair } : null;
}
