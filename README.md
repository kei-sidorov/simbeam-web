# simbeam-web

Web client for [simbeam](https://github.com/kei-sidorov/simbeam) — stream an iOS
Simulator (or a demo device) from a Mac and control it from the browser: live H.264
video over WebRTC, taps, swipes and keyboard.

**Status: building.** The product client lives in `src/` — a minimalist,
monospace web app that pairs from the address bar and streams a simulator.
Deploys to [app.simbeam.dev](https://app.simbeam.dev).

| Path | What it is |
|------|------------|
| [`src/`](src) | The product client. `protocol/` is the DOM-free core (identity, signalling, presence, screenshots); `app/` is the UI (store, controller, three screens). |
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md) | The full wire protocol — actors, pairing, session handshake, control messages, TURN/subscriptions. Complete enough to implement a client against. |
| [`reference/client.html`](reference/client.html) | A **working** single-file vanilla client. Implements the whole path: Ed25519 identity, pairing, signalling, answer verification, WebRTC video, touch/keyboard input, presence. The behavioral reference for everything built here. |
| [`CLAUDE.md`](CLAUDE.md) | Working instructions for the coding agent (in Russian) — stack, layout, rules. |

## Stack

Vite + TypeScript (strict), no UI framework, **zero runtime dependencies** —
just browser APIs (WebCrypto, WebRTC, WebSocket). Biome for lint/format, Vitest
for tests, JetBrains Mono self-hosted. The whole app is ~8 KB of gzipped JS.

```bash
npm install        # also installs the pre-commit hook (lint + typecheck + test)
npm run dev        # dev server at http://localhost:5173
npm test           # unit + render tests
npm run build      # typechecked production build → dist/
```

**Pairing is address-bar only.** There is no QR scanner in the browser: open the
pairing URL the daemon prints, confirm on the "Pair this Mac?" screen, and the
Mac is saved. The daemon and one-time secret ride in the URL fragment
(`#daemon=…&pair=…`), which never leaves the device. The broker is fixed —
`signal.simbeam.dev` — not carried in the URL (override with `VITE_SIGNAL_URL`
for a local broker).

The server side — the macOS daemon `simbeamd` and the signalling broker
`simbeam-signal` — is open source and lives in the
[main repo](https://github.com/kei-sidorov/simbeam). Nothing server-side is
developed here.

## Trying the reference client

You need a daemon and a broker from the main repo.

**Easiest** — the main repo serves this same page itself:

```bash
# in the simbeam repo, on a Mac with Xcode + idb_companion
make run-remote        # daemon + local broker + debug web client
```

Press **P** in the daemon terminal, open the printed pairing URL, hit **Start** →
**Pair this Mac**, pick a simulator.

**This repo's copy** — serve it statically and reuse the pairing fragment:

```bash
python3 -m http.server 8000
# open http://localhost:8000/reference/client.html#<fragment from the pairing URL>
```

The fragment (`#signal=…&daemon=…&pair=…`) carries everything the page needs.

**No Mac at hand** — `simbeamd demo` (runs on Linux too) streams a headless
Chromium tab and prints a multi-use pairing URL. See the main repo's README.

Requirements: a browser with WebCrypto Ed25519 (Chrome 113+, Safari 17+) and a
secure context (`localhost` counts).
