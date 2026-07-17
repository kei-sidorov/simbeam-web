import type { SessionPhase } from "../protocol/session";

/** User-visible connection phase labels (Concepts → connection lifecycle). */
export const PHASE_LABEL: Record<SessionPhase, string> = {
  requesting: "Requesting",
  handshaking: "Handshaking",
  ice: "Looking for the best connection",
  connecting: "Connecting",
  connected: "Connected",
  failed: "Connection failed",
};

/** How long the optimistic fake-boot window holds before reverting (ms). */
export const FAKE_BOOT_MS = 60_000;
