import type { PresenceMsg } from "./messages";

/** daemonID → online; a missing key means presence is not known (yet). */
export type PresenceMap = Record<string, boolean>;

/** Merges a presence snapshot or a one-key delta into the current map. */
export function mergePresence(current: PresenceMap, msg: PresenceMsg): PresenceMap {
  return { ...current, ...msg.states };
}

export interface PresenceWatcherOpts {
  signal: string;
  daemons: string[];
  onUpdate(states: PresenceMap): void;
  /** Called when the link drops — known states become stale/unknown. */
  onDown(): void;
}

/**
 * A presence WebSocket per broker: sends `watch` on open, merges snapshots
 * and deltas, reconnects with exponential backoff. `close()` tears it down.
 */
export class PresenceWatcher {
  private ws: WebSocket | null = null;
  private states: PresenceMap = {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 1000;
  private closed = false;

  constructor(private opts: PresenceWatcherOpts) {
    this.open();
  }

  private open(): void {
    const ws = new WebSocket(this.opts.signal);
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 1000;
      ws.send(JSON.stringify({ type: "watch", daemons: this.opts.daemons }));
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data)) as PresenceMsg;
      if (m.type === "presence" && m.states) {
        this.states = mergePresence(this.states, m);
        this.opts.onUpdate(this.states);
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      this.states = {};
      this.opts.onDown();
      this.timer = setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 30000);
    };
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }
}
