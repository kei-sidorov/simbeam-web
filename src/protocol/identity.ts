import { b64ToBytes, bytesToB64 } from "./b64";

/** Minimal key-value storage; localStorage in the app, a Map in tests. */
export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const PRIV_KEY = "simbeam_priv_pkcs8";
const PUB_KEY = "simbeam_pub";

export interface Identity {
  /** base64 raw Ed25519 public key — the account id (clientPubKey). */
  pub: string;
  /** Ed25519 signature over `bytes`, base64. */
  sign(bytes: Uint8Array): Promise<string>;
}

export async function loadOrCreateIdentity(kv: KV): Promise<Identity> {
  let priv: CryptoKey;
  let pub: string;

  const storedPriv = kv.get(PRIV_KEY);
  const storedPub = kv.get(PUB_KEY);
  if (storedPriv && storedPub) {
    priv = await crypto.subtle.importKey(
      "pkcs8",
      b64ToBytes(storedPriv) as BufferSource,
      { name: "Ed25519" },
      true,
      ["sign"],
    );
    pub = storedPub;
  } else {
    const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
    priv = kp.privateKey;
    pub = bytesToB64(raw);
    kv.set(PRIV_KEY, bytesToB64(pkcs8));
    kv.set(PUB_KEY, pub);
  }

  return {
    pub,
    async sign(bytes: Uint8Array): Promise<string> {
      const sig = await crypto.subtle.sign("Ed25519", priv, bytes as BufferSource);
      return bytesToB64(new Uint8Array(sig));
    },
  };
}

/** Verifies an Ed25519 signature (both base64) over `text` against a base64 raw public key. */
export async function verifyEd25519(
  pubB64: string,
  text: string,
  sigB64: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      b64ToBytes(pubB64) as BufferSource,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      b64ToBytes(sigB64) as BufferSource,
      new TextEncoder().encode(text),
    );
  } catch {
    return false;
  }
}
