// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Identity, KV } from "../protocol/identity";
import { Controller } from "./controller";
import { Store, initialState } from "./store";

const identity: Identity = {
  pub: "client",
  sign: async () => "signature",
};

function memKV(): KV {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}

/** Enough of a WebSocket for the signalling handshake; records what was sent. */
class FakeWS {
  static readonly OPEN = 1;
  static instances: FakeWS[] = [];
  readyState = FakeWS.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWS.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  /** Closing fires `onclose` once, whichever end asked for it. */
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
  /** The first message the client sends after the socket opens. */
  join(): Record<string, unknown> {
    this.onopen?.();
    return JSON.parse(this.sent[0] ?? "{}") as Record<string, unknown>;
  }
  deliver(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

/** The peer connection is irrelevant here — signalling never gets that far. */
class FakePC {
  connectionState = "new";
  iceGatheringState = "complete";
  localDescription = { sdp: "v=0" };
  addTransceiver(): void {}
  createDataChannel(): unknown {
    return { readyState: "connecting", binaryType: "", bufferedAmount: 0, send() {}, close() {} };
  }
  async createOffer(): Promise<unknown> {
    return { type: "offer", sdp: "v=0" };
  }
  async setLocalDescription(): Promise<void> {}
  async setRemoteDescription(): Promise<void> {}
  async addIceCandidate(): Promise<void> {}
  setConfiguration(): void {}
  getReceivers(): unknown[] {
    return [];
  }
  close(): void {}
}

describe("Controller single-session gate", () => {
  const mac = { daemon: "D1", name: "Mac" };
  /** The socket the client is on right now. */
  const ws = (): FakeWS => FakeWS.instances[FakeWS.instances.length - 1] as FakeWS;

  beforeEach(() => {
    FakeWS.instances = [];
    vi.useFakeTimers();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.stubGlobal("WebSocket", FakeWS);
    vi.stubGlobal("RTCPeerConnection", FakePC);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Refuse the dial the way the broker does: error, then close the socket. */
  async function refuse(code: string, msg: string): Promise<void> {
    ws().deliver({ type: "error", code, msg });
    ws().close(); // the broker hangs up right after
    await vi.advanceTimersByTimeAsync(0);
  }

  it("stops on `busy` without auto-reconnecting, then takes over when told to", async () => {
    const store = new Store({ ...initialState(), route: "main", macs: [mac] });
    const controller = new Controller(store, identity, memKV());

    controller.dialMac(mac);
    expect(ws().join().takeover).toBeUndefined();
    await refuse("busy", "another client is connected");

    expect(store.get().blocked).toEqual({ code: "busy", msg: "another client is connected" });
    expect(store.get().dialingDaemon).toBeNull();

    // The whole point of the gate: a refusal must never dial again on a timer.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWS.instances).toHaveLength(1);

    controller.retryBlocked(true);
    expect(ws().join().takeover).toBe(true);
    expect(store.get().blocked).toBeNull();
  });

  it("shows `taken_over` and stays put until the user asks to reconnect", async () => {
    const store = new Store({ ...initialState(), route: "sim", macs: [mac], connectedMac: mac });
    const controller = new Controller(store, identity, memKV());

    controller.dialMac(mac);
    ws().join();
    await refuse("taken_over", "another device took over this Mac");

    expect(store.get().blocked?.code).toBe("taken_over");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWS.instances).toHaveLength(1);

    // Reconnecting is the plain dial again — no eviction of whoever holds it.
    controller.retryBlocked(false);
    expect(ws().join().takeover).toBeUndefined();
  });
});

describe("Controller video lifecycle", () => {
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("explicitly resumes a mounted Safari video while the stream is playing", async () => {
    const store = new Store({
      ...initialState(),
      route: "sim",
      canvas: "playing",
      currentSim: {
        udid: "u1",
        name: "iPhone 17",
        state: "Booted",
        os_version: "iOS 26.1",
      },
    });
    const controller = new Controller(store, identity, memKV());
    controller.video.srcObject = {} as MediaStream;

    controller.videoMounted();
    await Promise.resolve();

    expect(play).toHaveBeenCalledOnce();
  });

  it("keeps the negotiated MediaStream when returning to the simulator list", () => {
    const store = new Store({
      ...initialState(),
      route: "sim",
      canvas: "playing",
      currentSim: {
        udid: "u1",
        name: "iPhone 17",
        state: "Booted",
        os_version: "iOS 26.1",
      },
    });
    const controller = new Controller(store, identity, memKV());
    const stream = {} as MediaStream;
    controller.video.srcObject = stream;

    controller.goList();

    expect(pause).toHaveBeenCalledOnce();
    expect(controller.video.srcObject).toBe(stream);
    expect(store.get().route).toBe("list");
  });
});
