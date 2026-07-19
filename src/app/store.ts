import type { PairingParams } from "../protocol/enroll";
import type { SimInfo } from "../protocol/messages";
import type { PresenceMap } from "../protocol/presence";
import type { SessionPhase } from "../protocol/session";
import type { SavedMac } from "./storage";

export type Route = "main" | "pairing" | "list" | "sim";

/** Video canvas states from the Simulator screen spec. */
export type CanvasState = "connecting" | "booting" | "playing" | "paused" | "disconnected" | "off";

/** A transient hint shown briefly at the top of the shell. */
export interface Toast {
  text: string;
  kind: "info" | "error";
}

export interface State {
  route: Route;
  /** Non-null while a pairing fragment is present in the URL. */
  pairing: PairingParams | null;
  /** Set while enrolling/dialing during pairing. */
  pairingBusy: boolean;
  pairingError: string | null;

  macs: SavedMac[];
  presence: PresenceMap;

  /** The Mac we are connected to / dialing, if any. */
  connectedMac: SavedMac | null;
  /** Which Mac row is mid-dial (daemon id), for the spinner + phase text. */
  dialingDaemon: string | null;
  phase: SessionPhase | null;

  sims: SimInfo[];
  listReconnecting: boolean;
  /** Whether the collapsed shut-down simulators are revealed on the list. */
  showShutdownSims: boolean;

  /** The simulator currently open on the Simulator screen. */
  currentSim: SimInfo | null;
  canvas: CanvasState;
  /** Optimistic boot deadlines by udid (epoch ms) — the fake-boot window. */
  booting: Record<string, number>;
  screenshotBusy: boolean;

  toast: Toast | null;
}

export function initialState(): State {
  return {
    route: "main",
    pairing: null,
    pairingBusy: false,
    pairingError: null,
    macs: [],
    presence: {},
    connectedMac: null,
    dialingDaemon: null,
    phase: null,
    sims: [],
    listReconnecting: false,
    showShutdownSims: false,
    currentSim: null,
    canvas: "connecting",
    booting: {},
    screenshotBusy: false,
    toast: null,
  };
}

export class Store {
  private state: State;
  private listeners = new Set<(s: State) => void>();

  constructor(initial: State) {
    this.state = initial;
  }

  get(): State {
    return this.state;
  }

  set(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  subscribe(fn: (s: State) => void): void {
    this.listeners.add(fn);
  }
}
