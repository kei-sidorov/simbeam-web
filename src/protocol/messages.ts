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
  /** Broker's verdict: both peers asked for trickle. Absent/false = old flow. */
  trickle?: boolean;
}

/** One trickled ICE candidate; an empty `candidate` means end-of-candidates. */
export interface CandidateMsg {
  type: "candidate";
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
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

export type SignalMsg =
  | ChallengeMsg
  | IceServersMsg
  | CandidateMsg
  | AnswerMsg
  | ErrorMsg
  | PeerLeftMsg;

// ---- presence ----

export interface PresenceMsg {
  type: "presence";
  states: Record<string, boolean>;
}

// ---- control channel (client commands) ----

export type TouchAction = "down" | "move" | "up";

/** A raw touch event; x/y are normalized [0,1] against the displayed frame. */
export interface TouchMsg {
  type: "touch";
  action: TouchAction;
  x: number;
  y: number;
}

// ---- control channel (daemon replies) ----

export interface SimInfo {
  udid: string;
  name: string;
  state: string; // "Booted" | "Shutdown" | …
  os_version: string;
}

/**
 * The daemon's answer to the client's `{"type":"hello"}`. `caps` is absent on
 * daemons that predate capability negotiation — treat that as none (see
 * protocol/caps.ts).
 */
export interface HelloMsg {
  type: "hello";
  name?: string;
  osVersion?: string;
  paired?: boolean;
  /** Daemon version, e.g. "0.12.0" — for the log and the "please update" hint. */
  version?: string;
  caps?: unknown;
}

/**
 * `sims` arrives on the reliable bulk channel (not control) as a chunked bulk
 * transfer: a text header {"type":"sims","bytes":N} then binary chunks whose
 * reassembled bytes are the JSON array `SimInfo[]` (see protocol/bulk.ts).
 */
export type SimsPayload = SimInfo[];

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
