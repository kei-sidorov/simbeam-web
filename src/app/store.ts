import type { Cap } from "../protocol/caps";
import type { PairingParams } from "../protocol/enroll";
import type { SimInfo } from "../protocol/messages";
import type { PresenceMap } from "../protocol/presence";
import type { SessionPhase, TransportKind } from "../protocol/session";
import type { SavedMac } from "./storage";
import type { ThemePref } from "./theme";

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
  /** How the current session connected (LAN / P2P / relay); null until known. */
  transport: TransportKind | null;
  /**
   * What the connected daemon says it supports. Empty until its `hello` lands
   * — and empty is the safe reading: every feature gated on a cap falls back
   * to what daemons did before capabilities existed.
   */
  caps: Cap[];
  /**
   * Capabilities this client knows and the daemon does not offer. Set from
   * `hello`, so an empty list also means "nothing asked yet" — which reads the
   * same way: nothing to warn about until the daemon has answered.
   */
  capsMissing: Cap[];
  daemonVersion: string | null;

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
  /** Whether the ⋯ action menu is open on the Simulator screen. */
  menuOpen: boolean;

  /** Light/dark preference; `auto` follows the OS. Applied to <html data-theme>. */
  themePref: ThemePref;

  /**
   * The session log sheet. `logsText` is snapshotted when the sheet opens, so
   * the text does not shift under the reader while events keep arriving.
   */
  logsOpen: boolean;
  logsText: string;

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
    transport: null,
    caps: [],
    capsMissing: [],
    daemonVersion: null,
    sims: [],
    listReconnecting: false,
    showShutdownSims: false,
    currentSim: null,
    canvas: "connecting",
    booting: {},
    screenshotBusy: false,
    menuOpen: false,
    themePref: "auto",
    logsOpen: false,
    logsText: "",
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
