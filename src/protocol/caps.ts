// Capability negotiation.
//
// The client opens the control channel with `{"type":"hello"}`; the daemon
// answers with its version and the capabilities it supports. Everything the
// two sides disagree about is decided from that list — never from a version
// comparison, which would need a table of who shipped what when.
//
// CAPS is the whole list this client knows how to use, and it is iterable on
// purpose: the gap in either direction is computed, not hand-maintained. A cap
// we know and the daemon does not means the Mac needs updating; a cap the
// daemon reports and we do not means this web client is the old one.

/**
 * Every capability this client can make use of. Add a case, get the checks.
 *
 * `trickle` is the odd one: nothing branches on it, because the ICE path is
 * decided by the broker's verdict on `iceServers`, long before `hello` exists.
 * It is listed only so a daemon that cannot trickle reads as behind — do not
 * gate the candidate flow on it.
 */
export const CAPS = ["touch", "app_switcher", "trickle"] as const;

export type Cap = (typeof CAPS)[number];

const KNOWN: ReadonlySet<string> = new Set<string>(CAPS);

export function isCap(value: string): value is Cap {
  return KNOWN.has(value);
}

/**
 * The `caps` field of a `hello`, defensively: absent, null or a non-array (an
 * older daemon that predates capabilities) all mean "nothing supported".
 */
export function parseCaps(raw: unknown): Cap[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is Cap => typeof v === "string" && isCap(v));
}

export interface CapGap {
  /** Known here, not offered by the daemon — the Mac is behind. */
  missing: Cap[];
  /** Offered by the daemon, unknown here — this client is behind. */
  unknown: string[];
}

export function capGap(raw: unknown): CapGap {
  const reported = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  const offered = new Set(reported);
  return {
    missing: CAPS.filter((c) => !offered.has(c)),
    unknown: reported.filter((c) => !isCap(c)),
  };
}
