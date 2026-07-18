import type { KV } from "../protocol/identity";

/**
 * A Mac the user has paired with — pinned permanently until unpaired. The broker
 * is not stored per-Mac: every Mac is reached through the single {@link SIGNAL_URL}.
 */
export interface SavedMac {
  /** Daemon id (public key), also the answer-verification key. */
  daemon: string;
  /** Display name, learned from the daemon's `hello`. */
  name: string;
  /** macOS version from `hello`, if known. */
  osVersion?: string;
}

const MACS_KEY = "simbeam_macs";

export const localKV: KV = {
  get: (k) => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
  remove: (k) => localStorage.removeItem(k),
};

export function loadMacs(kv: KV): SavedMac[] {
  try {
    const raw = kv.get(MACS_KEY);
    return raw ? (JSON.parse(raw) as SavedMac[]) : [];
  } catch {
    return [];
  }
}

export function saveMac(kv: KV, mac: SavedMac): SavedMac[] {
  const macs = loadMacs(kv).filter((m) => m.daemon !== mac.daemon);
  macs.push(mac);
  kv.set(MACS_KEY, JSON.stringify(macs));
  return macs;
}

export function removeMac(kv: KV, daemon: string): SavedMac[] {
  const macs = loadMacs(kv).filter((m) => m.daemon !== daemon);
  kv.set(MACS_KEY, JSON.stringify(macs));
  return macs;
}
