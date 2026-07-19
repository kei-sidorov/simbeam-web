import { bytesToB64 } from "./b64";
import { enrollProof } from "./enroll";
import { type Identity, verifyEd25519 } from "./identity";
import type { ControlReply, SignalMsg } from "./messages";

export interface SessionTarget {
  /** Broker WebSocket URL. */
  signal: string;
  /** Daemon id (also pinned as daemonPub for answer verification). */
  daemon: string;
  /** One-time pairing secret, only on first enrollment; null on reconnect. */
  pair: string | null;
}

export type SessionPhase =
  | "requesting"
  | "handshaking"
  | "ice"
  | "connecting"
  | "connected"
  | "failed";

export interface SessionCallbacks {
  onPhase(phase: SessionPhase): void;
  /** Fired when the control channel opens (safe to send input commands). */
  onControlOpen(send: (obj: unknown) => void): void;
  onControlReply(reply: ControlReply): void;
  /** Fired when the bulk channel opens (safe to send `list`/`screenshot`). */
  onBulkOpen(): void;
  /** A frame arrived on the bulk channel (screenshot chunk, or `sims` text). */
  onBulkFrame(frame: string | Uint8Array): void;
  onVideoTrack(stream: MediaStream): void;
  onIceServers(servers: RTCIceServer[]): void;
  /** Pairing/enrollment succeeded — pin the Mac now (hello confirms). */
  onPaired?(): void;
  /** Fatal: the answer's signature did not match the pinned daemon key. */
  onAuthFail(): void;
  /** P2P could not be established (relay would be required). */
  onUpsell(): void;
  /** Transient drop — caller decides whether to reconnect. */
  onDrop(): void;
  onError(msg: string, code?: string): void;
}

/**
 * One RTC session: dials the broker, runs the mutual key challenge
 * (join → challenge → proof → iceServers → offer → verified answer),
 * then holds the peer connection with `control` + `bulk` data channels
 * and the video track. `close()` tears everything down.
 */
export class Session {
  private pc: RTCPeerConnection | null = null;
  private control: RTCDataChannel | null = null;
  private bulk: RTCDataChannel | null = null;
  private ws: WebSocket | null = null;
  private offerSent = false;
  private alive = true;

  constructor(
    private target: SessionTarget,
    private identity: Identity,
    private cb: SessionCallbacks,
  ) {}

  async start(): Promise<void> {
    this.cb.onPhase("requesting");
    const pc = new RTCPeerConnection();
    this.pc = pc;
    pc.addTransceiver("video", { direction: "recvonly" });

    // control: unreliable/unordered (taps). bulk: reliable/ordered (screenshots).
    const control = pc.createDataChannel("control", { ordered: false, maxRetransmits: 0 });
    this.control = control;
    const bulk = pc.createDataChannel("bulk", { ordered: true });
    this.bulk = bulk;
    bulk.binaryType = "arraybuffer";

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (stream) this.cb.onVideoTrack(stream);
      this.minimizeBuffer();
    };
    control.onopen = () => this.cb.onControlOpen((obj) => this.sendControl(obj));
    control.onmessage = (ev) => this.cb.onControlReply(JSON.parse(String(ev.data)) as ControlReply);
    bulk.onopen = () => this.cb.onBulkOpen();
    bulk.onmessage = (ev) => {
      const d = ev.data;
      this.cb.onBulkFrame(d instanceof ArrayBuffer ? new Uint8Array(d) : String(d));
    };

    pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      const s = this.pc.connectionState;
      if (s === "connected") this.cb.onPhase("connected");
      else if (s === "failed") {
        this.cb.onPhase("failed");
        this.cb.onUpsell();
      } else if (s === "disconnected") {
        this.cb.onDrop();
      }
    };

    await this.signal();
  }

  private sendControl(obj: unknown): void {
    if (this.control && this.control.readyState === "open") {
      this.control.send(JSON.stringify(obj));
    }
  }

  sendBulk(obj: unknown): void {
    if (this.bulk && this.bulk.readyState === "open") {
      this.bulk.send(JSON.stringify(obj));
    }
  }

  private async signal(): Promise<void> {
    const ws = new WebSocket(this.target.signal);
    this.ws = ws;

    ws.onopen = async () => {
      this.cb.onPhase("handshaking");
      const join: Record<string, unknown> = {
        type: "join",
        role: "client",
        daemon: this.target.daemon,
        pubkey: this.identity.pub,
      };
      if (this.target.pair) {
        const nonce = bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
        join.nonce = nonce;
        join.pair = await enrollProof(this.target.pair, this.identity.pub, nonce);
      }
      ws.send(JSON.stringify(join));
    };

    ws.onmessage = async (ev) => {
      if (!this.alive) return;
      const m = JSON.parse(String(ev.data)) as SignalMsg;
      switch (m.type) {
        case "challenge": {
          const enc = new TextEncoder();
          ws.send(
            JSON.stringify({
              type: "proof",
              sig: await this.identity.sign(enc.encode(m.nonce)),
              brokerSig: await this.identity.sign(enc.encode(m.brokerNonce)),
            }),
          );
          break;
        }
        case "iceServers": {
          const servers = m.iceServers ?? [];
          this.cb.onIceServers(servers);
          this.pc?.setConfiguration({ iceServers: servers });
          if (!this.offerSent && this.pc) {
            this.cb.onPhase("ice");
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            await this.iceGatheringComplete();
            if (!this.alive || !this.pc.localDescription) return;
            ws.send(JSON.stringify({ type: "offer", sdp: this.pc.localDescription.sdp }));
            this.offerSent = true;
            this.cb.onPhase("connecting");
          }
          break;
        }
        case "answer": {
          const ok = await verifyEd25519(this.target.daemon, m.sdp, m.sig);
          if (!ok) {
            this.cb.onAuthFail();
            this.close();
            return;
          }
          await this.pc?.setRemoteDescription({ type: "answer", sdp: m.sdp });
          this.minimizeBuffer();
          if (this.target.pair) this.cb.onPaired?.();
          break;
        }
        case "error": {
          if (m.code === "offline" || (m.msg ?? "").includes("offline")) {
            this.cb.onDrop();
          } else {
            this.cb.onError(m.msg ?? "signalling error", m.code);
          }
          break;
        }
        case "peerLeft":
          this.cb.onDrop();
          break;
      }
    };

    ws.onclose = () => {
      if (this.alive) this.cb.onDrop();
    };
  }

  private minimizeBuffer(): void {
    for (const r of this.pc?.getReceivers() ?? []) {
      try {
        (r as unknown as { jitterBufferTarget: number }).jitterBufferTarget = 0;
      } catch {}
      try {
        (r as unknown as { playoutDelayHint: number }).playoutDelayHint = 0;
      } catch {}
    }
  }

  private iceGatheringComplete(): Promise<void> {
    const pc = this.pc;
    if (!pc || pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", check);
    });
  }

  close(): void {
    this.alive = false;
    try {
      this.ws?.close();
    } catch {}
    try {
      this.control?.close();
    } catch {}
    try {
      this.bulk?.close();
    } catch {}
    try {
      this.pc?.close();
    } catch {}
    this.ws = null;
    this.control = null;
    this.bulk = null;
    this.pc = null;
  }
}
