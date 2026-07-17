// Wire message types, mirroring docs/PROTOCOL.md. Field names are the wire's, verbatim.

// ---- signalling (broker WebSocket) ----

export interface ChallengeMsg {
  type: "challenge";
  nonce: string;
  brokerNonce: string;
}

export interface IceServersMsg {
  type: "iceServers";
  iceServers?: RTCIceServer[];
}

export interface AnswerMsg {
  type: "answer";
  sdp: string;
  sig: string;
}

export interface ErrorMsg {
  type: "error";
  msg?: string;
  /** Stable machine code — branch on this, never on msg. */
  code?: string;
}

export interface PeerLeftMsg {
  type: "peerLeft";
}

export type SignalMsg = ChallengeMsg | IceServersMsg | AnswerMsg | ErrorMsg | PeerLeftMsg;

// ---- presence ----

export interface PresenceMsg {
  type: "presence";
  states: Record<string, boolean>;
}

// ---- control channel (daemon replies) ----

export interface SimInfo {
  udid: string;
  name: string;
  state: string; // "Booted" | "Shutdown" | …
  os_version: string;
}

export interface HelloMsg {
  type: "hello";
  name?: string;
  osVersion?: string;
  paired?: boolean;
}

export interface SimsMsg {
  type: "sims";
  sims?: SimInfo[];
}

export interface BootedMsg {
  type: "booted";
  udid: string;
}

export interface ShutdownMsg {
  type: "shutdown";
  udid: string;
}

export interface AttachedMsg {
  type: "attached";
  /** Native pixel size of the simulator screen — use for aspect only. */
  w: number;
  h: number;
}

export interface DetachedMsg {
  type: "detached";
}

export type ControlReply =
  | HelloMsg
  | SimsMsg
  | BootedMsg
  | ShutdownMsg
  | AttachedMsg
  | DetachedMsg
  | ErrorMsg;

// ---- device kind (icon + canvas corner radius) ----

export type DeviceKind = "phone" | "legacy" | "ipad";

/** Infers the device kind from a simulator name (home-button era iPhones are "legacy"). */
export function deviceKind(name: string): DeviceKind {
  if (/ipad/i.test(name)) return "ipad";
  if (/iphone\s*(se|8|7|6|5|4)\b/i.test(name)) return "legacy";
  return "phone";
}
