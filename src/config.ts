/**
 * The single broker this web client talks to. The pairing URL no longer carries
 * a `signal` parameter — production always uses signal.simbeam.dev.
 *
 * Override at build/dev time with `VITE_SIGNAL_URL` to point at a local broker,
 * e.g. `VITE_SIGNAL_URL=ws://localhost:9000/ws npm run dev` for the local stand.
 */
export const SIGNAL_URL = import.meta.env.VITE_SIGNAL_URL ?? "wss://signal.simbeam.dev/ws";
