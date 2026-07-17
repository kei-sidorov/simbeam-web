// Reassembly of a full-resolution screenshot from the `bulk` channel:
// one text header {"type":"screenshot","bytes":N}, then binary chunks
// concatenating to exactly N bytes. Failure is a single text error frame.
// Success vs failure is the FRAME TYPE — never parse binary as JSON.

export type ScreenshotResult =
  | { status: "pending" }
  | { status: "done"; png: Uint8Array }
  | { status: "error"; msg: string; code?: string };

export class ScreenshotReceiver {
  private total: number | null = null;
  private chunks: Uint8Array[] = [];
  private received = 0;

  /** Feed one frame (string = text frame, Uint8Array = binary frame). */
  feed(frame: string | Uint8Array): ScreenshotResult {
    if (typeof frame === "string") {
      let msg: { type?: string; bytes?: number; msg?: string; code?: string };
      try {
        msg = JSON.parse(frame);
      } catch {
        return { status: "error", msg: "malformed reply" };
      }
      if (msg.type === "screenshot" && typeof msg.bytes === "number") {
        this.total = msg.bytes;
        return this.received >= this.total ? this.finish() : { status: "pending" };
      }
      const out: ScreenshotResult = { status: "error", msg: msg.msg ?? "screenshot failed" };
      if (msg.code !== undefined) out.code = msg.code;
      return out;
    }

    this.chunks.push(frame);
    this.received += frame.length;
    if (this.total !== null && this.received >= this.total) return this.finish();
    return { status: "pending" };
  }

  private finish(): ScreenshotResult {
    const total = this.total ?? this.received;
    const png = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) {
      png.set(c.subarray(0, Math.min(c.length, total - off)), off);
      off += c.length;
    }
    return { status: "done", png };
  }
}
