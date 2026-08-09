import { bytesToB64 } from "./b64";
import { enrollProof } from "./enroll";
import { type Identity, verifyEd25519 } from "./identity";
import type { CandidateMsg, ControlReply, SignalMsg } from "./messages";

export interface SessionTarget {
  /** Broker WebSocket URL. */
  signal: string;
  /** Daemon id (also pinned as daemonPub for answer verification). */
  daemon: string;
  /** One-time pairing secret, only on first enrollment; null on reconnect. */
  pair: string | null;
  /**
   * Evict the client holding this Mac's single session. Only ever set after
   * the user confirms a `busy` refusal — never on an automatic retry.
   */
  takeover?: boolean;
}

export type SessionPhase =
  | "requesting"
  | "handshaking"
  | "ice"
  | "connecting"
  | "connected"
  | "failed";

/** How the media/data actually flow once ICE settles. */
export type TransportKind =
  | "lan" // both ends `host` — same local network
  | "p2p" // reflexive candidate — NAT traversed, still direct
  | "relay"; // routed through a TURN relay

/**
 * Classify the live path from the selected ICE pair's candidate types.
 * Any relay end means relayed; two host ends means LAN; anything else
 * (server/peer-reflexive) is a NAT-traversed direct link.
 */
export function classifyTransport(local: string, remote: string): TransportKind {
  if (local === "relay" || remote === "relay") return "relay";
  if (local === "host" && remote === "host") return "lan";
  return "p2p";
}

/** Candidates held before the answer arrives; a real peer sends a handful. */
const CANDIDATE_BUFFER = 32;

/**
 * Trickled candidates can arrive before the answer is applied, and
 * `addIceCandidate` rejects in that window — hold them until `open()`.
 * Anything past the cap is dropped: a flood there is a broken or hostile
 * broker, and ICE only needs one working pair.
 */
export function candidateQueue(
  apply: (c: RTCIceCandidateInit) => void,
  limit = CANDIDATE_BUFFER,
): {
  add(c: RTCIceCandidateInit): void;
  open(): void;
} {
  let ready = false;
  const pending: RTCIceCandidateInit[] = [];
  return {
    add(c) {
      if (ready) apply(c);
      else if (pending.length < limit) pending.push(c);
    },
    open() {
      ready = true;
      for (const c of pending.splice(0)) apply(c);
    },
  };
}

export interface SessionCallbacks {
  onPhase(phase: SessionPhase): void;
  /** Fired when the control channel opens (safe to send input commands). */
  onControlOpen(send: (obj: unknown) => void): void;
  onControlReply(reply: ControlReply): void;
  /** Fired when the bulk channel opens (safe to send `list`/`screenshot`). */
  onBulkOpen(): void;
  /** A frame arrived on the bulk channel (chunked screenshot/sims transfer). */
  onBulkFrame(frame: string | Uint8Array): void;
  onVideoTrack(stream: MediaStream): void;
  /** `trickle` is the broker's verdict — false means the pre-trickle flow. */
  onIceServers(servers: RTCIceServer[], trickle: boolean): void;
  /** The live path (LAN / P2P / relay), read from ICE stats once connected. */
  onTransport(kind: TransportKind): void;
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
  /** The broker's trickle verdict from `iceServers` — not our own wish. */
  private trickle = false;
  private remoteCandidates = candidateQueue((c) => {
    this.pc?.addIceCandidate(c).catch(() => {});
  });

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
      if (s === "connected") {
        this.cb.onPhase("connected");
        void this.reportTransport();
      } else if (s === "failed") {
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

  /**
   * Bytes queued on `control` but not yet handed to the network. Non-zero means
   * the uplink is the bottleneck — callers streaming input should back off.
   */
  controlBacklog(): number {
    return this.control?.readyState === "open" ? this.control.bufferedAmount : 0;
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
        trickle: true,
      };
      if (this.target.takeover) join.takeover = true;
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
          this.trickle = m.trickle === true;
          this.cb.onIceServers(servers, this.trickle);
          this.pc?.setConfiguration({ iceServers: servers });
          if (!this.offerSent && this.pc) {
            this.cb.onPhase("ice");
            // Trickle: ship the offer as soon as it exists and stream candidates
            // after it. Otherwise they all have to ride inside the SDP.
            if (this.trickle) {
              this.pc.onicecandidate = (ev) => {
                if (!this.alive || ws.readyState !== WebSocket.OPEN) return;
                const c = ev.candidate;
                const msg: CandidateMsg = c
                  ? {
                      type: "candidate",
                      candidate: c.candidate,
                      sdpMid: c.sdpMid,
                      sdpMLineIndex: c.sdpMLineIndex,
                    }
                  : { type: "candidate" }; // end-of-candidates
                ws.send(JSON.stringify(msg));
              };
            }
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            if (!this.trickle) await this.iceGatheringComplete();
            if (!this.alive || !this.pc.localDescription) return;
            ws.send(JSON.stringify({ type: "offer", sdp: this.pc.localDescription.sdp }));
            this.offerSent = true;
            this.cb.onPhase("connecting");
          }
          break;
        }
        case "candidate": {
          // Unsolicited under a `false` verdict — the candidates are in the SDP.
          // Empty candidate is the daemon's end-of-candidates marker; nothing
          // to add, ICE just stops expecting more.
          if (this.trickle && m.candidate) {
            this.remoteCandidates.add({
              candidate: m.candidate,
              sdpMid: m.sdpMid ?? null,
              sdpMLineIndex: m.sdpMLineIndex ?? null,
            });
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
          this.remoteCandidates.open();
          this.minimizeBuffer();
          if (this.target.pair) this.cb.onPaired?.();
          break;
        }
        case "error": {
          if (m.code === "offline" || (m.msg ?? "").includes("offline")) {
            this.cb.onDrop();
          } else {
            // `busy` / `taken_over` come with the broker closing the socket;
            // the caller ends the session there, so the trailing close is not
            // read as a transient drop. See Controller.onBlocked.
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

  /** Inspect ICE stats for the nominated pair and report the live path. */
  private async reportTransport(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    let stats: RTCStatsReport;
    try {
      stats = await pc.getStats();
    } catch {
      return;
    }
    if (!this.alive) return;

    // The selected pair: prefer the transport's pointer, else the nominated,
    // succeeded candidate-pair. Field names vary a little across browsers.
    // (RTCStatsReport is Map-like but exposes only forEach for iteration.)
    type Pair = { localCandidateId?: string; remoteCandidateId?: string };
    let selectedId: string | undefined;
    let fallback: Pair | undefined;
    // biome-ignore lint/complexity/noForEach: RTCStatsReport only offers forEach
    stats.forEach((r) => {
      if (r.type === "transport" && r.selectedCandidatePairId) {
        selectedId = r.selectedCandidatePairId;
      } else if (
        r.type === "candidate-pair" &&
        (r.selected || (r.nominated && r.state === "succeeded"))
      ) {
        fallback ??= r as Pair;
      }
    });
    const pair = (selectedId ? (stats.get(selectedId) as Pair | undefined) : undefined) ?? fallback;
    if (!pair?.localCandidateId || !pair.remoteCandidateId) return;

    const local = stats.get(pair.localCandidateId) as { candidateType?: string } | undefined;
    const remote = stats.get(pair.remoteCandidateId) as { candidateType?: string } | undefined;
    if (!local?.candidateType || !remote?.candidateType) return;
    this.cb.onTransport(classifyTransport(local.candidateType, remote.candidateType));
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
