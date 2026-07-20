// Reassembly of a large reply from the reliable `bulk` channel: one text
// header {"type":T,"bytes":N} announcing the transfer, then binary chunks
// concatenating to exactly N bytes. `screenshot` → a PNG; `sims` → the JSON
// simulator list. Either reply is bigger than one packet and black-holes as a
// single multi-packet SCTP message on IPv6 (1280 B min MTU, PMTUD filtered),
// so the daemon splits every reply into ≤1 KB frames and we stitch them back
// here in arrival order (bulk is reliable + ordered → no sequence numbers).
// Failure is a single text error frame. Success vs failure is the FRAME TYPE
// — never parse binary as JSON.

export type BulkKind = "screenshot" | "sims";

export type BulkResult =
  | { status: "pending" }
  | { status: "done"; kind: BulkKind; bytes: Uint8Array }
  | { status: "error"; msg: string; code?: string };

export class BulkReceiver {
  private kind: BulkKind | null = null;
  private total: number | null = null;
  private chunks: Uint8Array[] = [];
  private received = 0;

  /** Feed one frame (string = text frame, Uint8Array = binary frame). */
  feed(frame: string | Uint8Array): BulkResult {
    if (typeof frame === "string") {
      let msg: { type?: string; bytes?: number; msg?: string; code?: string };
      try {
        msg = JSON.parse(frame);
      } catch {
        return { status: "error", msg: "malformed reply" };
      }
      if ((msg.type === "screenshot" || msg.type === "sims") && typeof msg.bytes === "number") {
        this.kind = msg.type;
        this.total = msg.bytes;
        return this.received >= this.total ? this.finish() : { status: "pending" };
      }
      const out: BulkResult = { status: "error", msg: msg.msg ?? "transfer failed" };
      if (msg.code !== undefined) out.code = msg.code;
      return out;
    }

    this.chunks.push(frame);
    this.received += frame.length;
    if (this.total !== null && this.received >= this.total) return this.finish();
    return { status: "pending" };
  }

  private finish(): BulkResult {
    const total = this.total ?? this.received;
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) {
      bytes.set(c.subarray(0, Math.min(c.length, total - off)), off);
      off += c.length;
    }
    return { status: "done", kind: this.kind ?? "screenshot", bytes };
  }
}
