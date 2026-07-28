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

/** Every capability this client can make use of. Add a case, get the checks. */
export const CAPS = ["touch", "app_switcher"] as const;

export type Cap = (typeof CAPS)[number];

/**
 * What each capability is called when we have to tell the user it is missing.
 * Typed against Cap, so adding a case to CAPS is a compile error until it has
 * a name a person can read.
 */
export const CAP_LABEL: Record<Cap, string> = {
  touch: "real touch input",
  app_switcher: "App Switcher",
};

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
