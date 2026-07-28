// Session log: what happened since this page was opened.
//
// A reload starts a new one — nothing is persisted, and that is the point.
// The log exists so a bad session can be handed over as text without asking
// the user to open devtools on a phone.
//
// Never log a secret. The pairing fragment carries `pair=` (an HMAC key) and
// the URL is stripped of its fragment before it goes into the header.

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  /** Milliseconds since the log was created. */
  at: number;
  level: LogLevel;
  msg: string;
}

/** Keep the tail: a long session must not grow the page's memory without end. */
const MAX_ENTRIES = 600;
/** One runaway message (a stack, a JSON blob) must not swallow the log. */
const MAX_MSG_CHARS = 400;

/** Everything about the environment worth having in a bug report. */
export interface LogEnv {
  url: string;
  signal: string;
  userAgent: string;
  viewport: string;
  identity?: string;
}

export class SessionLog {
  private entries_: LogEntry[] = [];
  readonly startedAt: number;

  constructor(private now: () => number = () => Date.now()) {
    this.startedAt = this.now();
  }

  add(level: LogLevel, msg: string): void {
    const text = msg.length > MAX_MSG_CHARS ? `${msg.slice(0, MAX_MSG_CHARS)}…` : msg;
    this.entries_.push({ at: this.now() - this.startedAt, level, msg: text });
    if (this.entries_.length > MAX_ENTRIES)
      this.entries_.splice(0, this.entries_.length - MAX_ENTRIES);
  }

  info(msg: string): void {
    this.add("info", msg);
  }

  warn(msg: string): void {
    this.add("warn", msg);
  }

  error(msg: string): void {
    this.add("error", msg);
  }

  entries(): readonly LogEntry[] {
    return this.entries_;
  }

  /** The whole log as the plain text that gets shared or copied. */
  format(env: LogEnv, startedISO: string): string {
    const head = [
      "simbeam-web session log",
      `started  ${startedISO}`,
      `elapsed  ${fmtElapsed(this.now() - this.startedAt)}`,
      `url      ${env.url}`,
      `signal   ${env.signal}`,
      `viewport ${env.viewport}`,
      `ua       ${env.userAgent}`,
    ];
    if (env.identity) head.push(`identity ${env.identity}`);
    const body = this.entries_.map((e) => `${fmtAt(e.at)}  ${e.level.padEnd(5)}  ${e.msg}`);
    return `${head.join("\n")}\n${"-".repeat(52)}\n${body.join("\n")}\n`;
  }
}

/** `+12.345s`, right-aligned so the messages line up. */
function fmtAt(ms: number): string {
  return `+${(ms / 1000).toFixed(3)}s`.padStart(11);
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** Drops the fragment — it carries the pairing secret. */
export function safeUrl(href: string): string {
  const hash = href.indexOf("#");
  return hash === -1 ? href : `${href.slice(0, hash)}#…`;
}

/** The single log for this page load; imported wherever something is worth noting. */
export const sessionLog = new SessionLog();
