# simbeam-web

Web client for [simbeam](https://github.com/kei-sidorov/simbeam) — stream an iOS
Simulator (or a demo device) from a Mac and control it from the browser: live H.264
video over WebRTC, taps, swipes and keyboard.

**Status: early.** The product client has not been started yet, and its stack is
deliberately undecided. What this repo holds today:

| Path | What it is |
|------|------------|
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md) | The full wire protocol — actors, pairing, session handshake, control messages, TURN/subscriptions. Complete enough to implement a client against. |
| [`reference/client.html`](reference/client.html) | A **working** single-file vanilla client. Implements the whole path: Ed25519 identity, pairing, signalling, answer verification, WebRTC video, touch/keyboard input, presence. The behavioral reference for everything built here. |
| [`CLAUDE.md`](CLAUDE.md) | Working instructions for the coding agent (in Russian). |

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
