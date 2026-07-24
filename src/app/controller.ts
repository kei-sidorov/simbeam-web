import { SIGNAL_URL } from "../config";
import { BulkReceiver } from "../protocol/bulk";
import { parsePairingFragment } from "../protocol/enroll";
import type { Identity, KV } from "../protocol/identity";
import type { ControlReply, SimInfo, SimsPayload } from "../protocol/messages";
import { PresenceWatcher } from "../protocol/presence";
import { Session, type SessionTarget } from "../protocol/session";
import { FAKE_BOOT_MS } from "./phases";
import { type SavedMac, loadMacs, removeMac, saveMac } from "./storage";
import type { State, Store } from "./store";
import { applyTheme, loadThemePref, nextThemePref, saveThemePref, watchSystemTheme } from "./theme";

/** Intents the UI can trigger; the controller owns all connection logic. */
export interface Intents {
  confirmPairing(): void;
  cancelPairing(): void;
  dialMac(mac: SavedMac): void;
  cancelDial(): void;
  unpairMac(mac: SavedMac): void;
  goMain(): void;
  goList(): void;
  cycleTheme(): void;
  openSim(sim: SimInfo): void;
  bootSim(sim: SimInfo): void;
  shutdownSim(sim: SimInfo): void;
  toggleShutdownSims(): void;
  toggleMenu(): void;
  closeMenu(): void;
  togglePause(): void;
  home(): void;
  shake(): void;
  screenshot(): void;
  sendTap(x: number, y: number): void;
  sendSwipe(x1: number, y1: number, x2: number, y2: number, duration: number): void;
  sendKey(key: string): void;
}

const RECONNECT_MAX_MS = 15_000;
/** Re-request the simulator list this often until a `sims` reply arrives. */
const LIST_RETRY_MS = 1000;

export class Controller implements Intents {
  private session: Session | null = null;
  private send: ((obj: unknown) => void) | null = null;
  private presence: PresenceWatcher | null = null;
  /** Reassembles chunked bulk replies (screenshot / sims); reset after each. */
  private bulkRx = new BulkReceiver();

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listRetryTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectDelay = 1000;
  private bootTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** Persistent video element, re-parented across renders to keep the stream. */
  readonly video: HTMLVideoElement;
  /** True while a user-initiated teardown is in progress (suppresses reconnect). */
  private intentionalClose = false;

  constructor(
    private store: Store,
    private identity: Identity,
    private kv: KV,
  ) {
    this.video = document.createElement("video");
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;
  }

  init(): void {
    const themePref = loadThemePref(this.kv);
    applyTheme(themePref);
    // In `auto`, follow the OS live — `data-theme` re-resolves, no re-render needed.
    watchSystemTheme(() => {
      if (this.store.get().themePref === "auto") applyTheme("auto");
    });

    const pairing = parsePairingFragment(location.hash);
    const macs = loadMacs(this.kv);
    this.store.set({ themePref, macs, pairing, route: pairing ? "pairing" : "main" });
    this.startPresence(macs);
  }

  cycleTheme(): void {
    const pref = nextThemePref(this.store.get().themePref);
    saveThemePref(this.kv, pref);
    applyTheme(pref);
    this.store.set({ themePref: pref });
  }

  // ---- presence ----

  private startPresence(macs: SavedMac[]): void {
    this.presence?.close();
    this.presence = null;
    if (!macs.length) return;
    const daemons = macs.map((m) => m.daemon);
    this.presence = new PresenceWatcher({
      signal: SIGNAL_URL,
      daemons,
      onUpdate: (states) =>
        this.store.set({ presence: { ...this.store.get().presence, ...states } }),
      onDown: () => {
        const p = { ...this.store.get().presence };
        for (const d of daemons) delete p[d];
        this.store.set({ presence: p });
      },
    });
  }

  // ---- toasts ----

  private toast(text: string, kind: "info" | "error" = "info"): void {
    this.store.set({ toast: { text, kind } });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.store.set({ toast: null }), 3200);
  }

  // ---- pairing ----

  confirmPairing(): void {
    const p = this.store.get().pairing;
    if (!p) return;
    this.store.set({ pairingBusy: true, pairingError: null });
    this.dial({ signal: SIGNAL_URL, daemon: p.daemon, pair: p.pair }, { enrolling: true });
  }

  cancelPairing(): void {
    this.clearPairingFragment();
    this.store.set({ pairing: null, pairingBusy: false, pairingError: null, route: "main" });
  }

  private clearPairingFragment(): void {
    history.replaceState(null, "", location.pathname + location.search);
  }

  // ---- dialing / session lifecycle ----

  dialMac(mac: SavedMac): void {
    const st = this.store.get();
    if (st.dialingDaemon) return; // one dial at a time (one-Mac rule)
    if (st.presence[mac.daemon] === false) {
      this.toast(`${mac.name} is offline`);
      return;
    }
    this.store.set({ dialingDaemon: mac.daemon, connectedMac: mac });
    this.dial({ signal: SIGNAL_URL, daemon: mac.daemon, pair: null }, { enrolling: false });
  }

  cancelDial(): void {
    this.intentionalClose = true;
    this.teardownSession();
    this.store.set({ dialingDaemon: null, connectedMac: null, phase: null });
  }

  private dial(target: SessionTarget, opts: { enrolling: boolean }): void {
    this.intentionalClose = false;
    this.teardownSession();
    this.store.set({ transport: null }); // unknown until ICE settles
    const session = new Session(target, this.identity, {
      onPhase: (phase) => {
        this.store.set({ phase });
        if (phase === "connected") this.reconnectDelay = 1000;
      },
      onControlOpen: (send) => {
        this.send = send;
      },
      onControlReply: (reply) => this.onControlReply(reply, opts.enrolling),
      // `list`/`sims` live on the reliable bulk channel; ask once it opens.
      // Fresh channel → drop any half-received transfer from a prior link.
      onBulkOpen: () => {
        this.bulkRx = new BulkReceiver();
        this.requestSimList();
      },
      onBulkFrame: (frame) => this.onBulkFrame(frame),
      onVideoTrack: (stream) => {
        this.video.srcObject = stream;
      },
      onIceServers: () => {},
      onTransport: (kind) => this.store.set({ transport: kind }),
      onPaired: () => this.onPaired(target),
      onAuthFail: () => {
        this.toast("Authentication failed — possible man-in-the-middle. Re-pair.", "error");
        this.store.set({
          pairingBusy: false,
          pairingError: "Answer was not signed by the expected Mac.",
        });
        this.teardownSession();
      },
      onUpsell: () => this.onUpsell(),
      onDrop: () => this.onDrop(),
      onError: (msg, code) => this.onSignalError(msg, code, opts.enrolling),
    });
    this.session = session;
    void session.start();
  }

  private onPaired(target: SessionTarget): void {
    // Pin optimistically; `hello` (paired:true) is the true confirmation and
    // fills in the name/osVersion. We save now so a drop reconnects key-only.
    const p = this.store.get().pairing;
    const mac: SavedMac = { daemon: target.daemon, name: "Mac" };
    const macs = saveMac(this.kv, mac);
    this.store.set({ macs, connectedMac: mac, pairing: p });
    this.startPresence(macs);
  }

  private onControlReply(reply: ControlReply, enrolling: boolean): void {
    const st = this.store.get();
    switch (reply.type) {
      case "hello": {
        if (st.connectedMac && (reply.name || reply.osVersion)) {
          const updated: SavedMac = {
            ...st.connectedMac,
            name: reply.name ?? st.connectedMac.name,
          };
          if (reply.osVersion !== undefined) updated.osVersion = reply.osVersion;
          const macs = saveMac(this.kv, updated);
          this.store.set({ macs, connectedMac: updated });
        }
        if (enrolling) {
          this.clearPairingFragment();
          this.store.set({ pairing: null, pairingBusy: false });
        }
        break;
      }
      case "booted": {
        const booting = { ...st.booting };
        delete booting[reply.udid];
        this.store.set({ booting, sims: markState(st.sims, reply.udid, "Booted") });
        this.clearBootTimer(reply.udid);
        // If the user is waiting on this sim's screen, attach now.
        if (st.currentSim?.udid === reply.udid) {
          this.send?.({ type: "attach", udid: reply.udid });
        }
        break;
      }
      case "shutdown": {
        this.store.set({ sims: markState(st.sims, reply.udid, "Shutdown") });
        if (st.currentSim?.udid === reply.udid) this.store.set({ canvas: "off" });
        break;
      }
      case "attached": {
        if (st.route === "sim") this.store.set({ canvas: "playing" });
        break;
      }
      case "detached": {
        if (st.route === "sim" && st.canvas === "playing") this.store.set({ canvas: "off" });
        break;
      }
      case "error": {
        this.toast(reply.msg ?? "Simulator error", "error");
        break;
      }
    }
  }

  /** Ask the daemon for the simulator list; retry until a `sims` reply lands. */
  private requestSimList(): void {
    this.session?.sendBulk({ type: "list" });
    if (this.listRetryTimer) return;
    this.listRetryTimer = setInterval(() => {
      this.session?.sendBulk({ type: "list" });
    }, LIST_RETRY_MS);
  }

  private stopSimListRetry(): void {
    if (this.listRetryTimer) {
      clearInterval(this.listRetryTimer);
      this.listRetryTimer = null;
    }
  }

  private handleSims(sims: SimInfo[]): void {
    const st = this.store.get();
    const patch: Partial<State> = { sims, listReconnecting: false };
    if (st.dialingDaemon || st.route === "pairing") {
      patch.dialingDaemon = null;
      patch.route = "list";
      patch.showShutdownSims = false; // fresh list starts collapsed
    }
    this.store.set(patch);
  }

  private onBulkFrame(frame: string | Uint8Array): void {
    // Both large replies — screenshot and sims — arrive as a text header
    // {"type","bytes"} then binary chunks (≤1 KB each, so they survive IPv6's
    // small MTU). The reassembler stitches them; we dispatch by the header type.
    // Bulk is ordered, so transfers never interleave — one receiver suffices.
    const res = this.bulkRx.feed(frame);
    if (res.status === "pending") return;
    this.bulkRx = new BulkReceiver();

    if (res.status === "error") {
      // Only screenshots surface failures; a failed list just keeps retrying.
      if (this.store.get().screenshotBusy) {
        this.store.set({ screenshotBusy: false });
        this.toast(`Screenshot failed: ${res.msg}`, "error");
      }
      return;
    }

    if (res.kind === "sims") {
      this.stopSimListRetry();
      this.handleSims(parseSims(res.bytes));
    } else {
      this.store.set({ screenshotBusy: false });
      this.saveScreenshot(res.bytes);
    }
  }

  private saveScreenshot(png: Uint8Array): void {
    const blob = new Blob([png as BlobPart], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const sim = this.store.get().currentSim?.name ?? "simulator";
    a.download = `${sim.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.toast("Screenshot saved");
  }

  private onUpsell(): void {
    this.toast("Could not connect peer-to-peer. Be on the same network as your Mac.", "error");
    if (this.store.get().route === "sim") this.store.set({ canvas: "disconnected" });
    this.store.set({ dialingDaemon: null, pairingBusy: false });
  }

  private onSignalError(msg: string, code: string | undefined, enrolling: boolean): void {
    if (enrolling) {
      this.store.set({ pairingBusy: false, pairingError: msg });
      this.toast(`Pairing failed: ${msg}`, "error");
      this.teardownSession();
      return;
    }
    if (code === "offline") {
      this.onDrop();
      return;
    }
    this.toast(msg, "error");
    this.store.set({ dialingDaemon: null });
  }

  private onDrop(): void {
    if (this.intentionalClose) return;
    const st = this.store.get();
    this.store.set({ transport: null }); // path is unknown until we reconnect
    if (st.route === "list") this.store.set({ listReconnecting: true });
    if (st.route === "sim") this.store.set({ canvas: "disconnected" });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const mac = this.store.get().connectedMac;
    if (!mac) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const st = this.store.get();
      if (this.intentionalClose || st.route === "main") return;
      if (st.route === "sim") this.store.set({ canvas: "connecting" });
      this.dial({ signal: SIGNAL_URL, daemon: mac.daemon, pair: null }, { enrolling: false });
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private teardownSession(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopSimListRetry();
    this.session?.close();
    this.session = null;
    this.send = null;
  }

  // ---- navigation ----

  goMain(): void {
    this.intentionalClose = true;
    this.teardownSession();
    this.video.srcObject = null;
    for (const t of this.bootTimers.values()) clearTimeout(t);
    this.bootTimers.clear();
    this.store.set({
      route: "main",
      connectedMac: null,
      dialingDaemon: null,
      phase: null,
      transport: null,
      sims: [],
      currentSim: null,
      listReconnecting: false,
      showShutdownSims: false,
      canvas: "connecting",
    });
  }

  goList(): void {
    // Leaving a simulator stops its stream but keeps the Mac session alive.
    this.send?.({ type: "detach" });
    this.video.srcObject = null;
    this.store.set({ route: "list", currentSim: null, canvas: "connecting", menuOpen: false });
  }

  openSim(sim: SimInfo): void {
    const booted = sim.state === "Booted";
    this.store.set({ route: "sim", currentSim: sim, canvas: booted ? "connecting" : "off" });
    if (booted) {
      this.send?.({ type: "attach", udid: sim.udid });
    }
  }

  bootSim(sim: SimInfo): void {
    this.send?.({ type: "boot", udid: sim.udid });
    this.startFakeBoot(sim.udid);
    if (this.store.get().currentSim?.udid === sim.udid) this.store.set({ canvas: "booting" });
  }

  shutdownSim(sim: SimInfo): void {
    this.send?.({ type: "shutdown", udid: sim.udid });
    this.clearBootTimer(sim.udid);
    const st = this.store.get();
    const booting = { ...st.booting };
    delete booting[sim.udid];
    this.store.set({ booting, sims: markState(st.sims, sim.udid, "Shutdown") });
    if (st.currentSim?.udid === sim.udid) this.store.set({ canvas: "off" });
  }

  toggleShutdownSims(): void {
    this.store.set({ showShutdownSims: !this.store.get().showShutdownSims });
  }

  toggleMenu(): void {
    this.store.set({ menuOpen: !this.store.get().menuOpen });
  }

  closeMenu(): void {
    if (this.store.get().menuOpen) this.store.set({ menuOpen: false });
  }

  private startFakeBoot(udid: string): void {
    this.clearBootTimer(udid);
    const st = this.store.get();
    this.store.set({ booting: { ...st.booting, [udid]: Date.now() + FAKE_BOOT_MS } });
    const timer = setTimeout(() => {
      const cur = this.store.get();
      const booting = { ...cur.booting };
      delete booting[udid];
      this.store.set({ booting });
      if (cur.currentSim?.udid === udid && cur.canvas === "booting") {
        this.store.set({ canvas: "off" });
      }
      this.bootTimers.delete(udid);
    }, FAKE_BOOT_MS);
    this.bootTimers.set(udid, timer);
  }

  private clearBootTimer(udid: string): void {
    const t = this.bootTimers.get(udid);
    if (t) {
      clearTimeout(t);
      this.bootTimers.delete(udid);
    }
  }

  unpairMac(mac: SavedMac): void {
    const macs = removeMac(this.kv, mac.daemon);
    this.store.set({ macs });
    this.startPresence(macs);
    this.toast(`Unpaired ${mac.name}`);
  }

  // ---- simulator screen actions ----

  togglePause(): void {
    const st = this.store.get();
    if (st.canvas === "playing") {
      this.send?.({ type: "detach" });
      this.store.set({ canvas: "paused" });
    } else if (st.canvas === "paused" && st.currentSim) {
      this.send?.({ type: "attach", udid: st.currentSim.udid });
      this.store.set({ canvas: "connecting" });
    }
  }

  home(): void {
    this.send?.({ type: "home" });
  }

  shake(): void {
    this.send?.({ type: "shake" });
  }

  screenshot(): void {
    if (this.store.get().screenshotBusy) return;
    this.store.set({ screenshotBusy: true });
    this.session?.sendBulk({ type: "screenshot" });
  }

  sendTap(x: number, y: number): void {
    if (this.store.get().canvas === "playing") this.send?.({ type: "tap", x, y });
  }

  sendSwipe(x1: number, y1: number, x2: number, y2: number, duration: number): void {
    if (this.store.get().canvas === "playing") {
      this.send?.({ type: "swipe", x1, y1, x2, y2, duration });
    }
  }

  sendKey(key: string): void {
    if (this.store.get().canvas === "playing") this.send?.({ type: "key", key });
  }
}

/** Returns a new sims array with one udid's state replaced. */
function markState(sims: SimInfo[], udid: string, state: string): SimInfo[] {
  return sims.map((s) => (s.udid === udid ? { ...s, state } : s));
}

/**
 * Decode the reassembled `sims` bulk transfer (UTF-8 JSON) to SimInfo[]. The
 * daemon chunks its existing wire object, so the payload is
 * `{"type":"sims","sims":[…]}` — but tolerate a bare `[…]` array as well.
 */
export function parseSims(bytes: Uint8Array): SimsPayload {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (Array.isArray(parsed)) return parsed as SimsPayload;
    const wrapped = (parsed as { sims?: unknown } | null)?.sims;
    return Array.isArray(wrapped) ? (wrapped as SimsPayload) : [];
  } catch {
    return [];
  }
}
