import { SIGNAL_URL } from "../config";
import { type SimInfo, deviceKind } from "../protocol/messages";
import type { PresenceMap } from "../protocol/presence";
import type { Intents } from "./controller";
import { h } from "./dom";
import { cameraIcon, homeIcon, macIcon, shakeIcon, simIcon, themeIcon } from "./icons";
import { PHASE_LABEL } from "./phases";
import type { SavedMac } from "./storage";
import type { CanvasState, State } from "./store";

type Presence = "online" | "offline" | "undefined";

function presenceOf(map: PresenceMap, daemon: string): Presence {
  if (map[daemon] === true) return "online";
  if (map[daemon] === false) return "offline";
  return "undefined";
}

function dot(p: Presence): HTMLElement {
  return h("span", { class: `dot dot-${p}` });
}

const THEME_LABEL: Record<State["themePref"], string> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
};

/** Cycles auto → light → dark; the glyph reflects the current preference. */
function themeToggle(st: State, intents: Intents): HTMLElement {
  const label = `Theme: ${THEME_LABEL[st.themePref]}`;
  return h(
    "button",
    {
      class: "theme-toggle",
      title: label,
      "aria-label": label,
      onclick: () => intents.cycleTheme(),
    },
    themeIcon(st.themePref),
  );
}

function shellLabel(right: string, st: State, intents: Intents): HTMLElement {
  return h(
    "div",
    { class: "shell-label" },
    h("span", {}, "SimBeam · Web"),
    h("span", { class: "shell-right" }, h("span", {}, right), themeToggle(st, intents)),
  );
}

// ---- Pairing confirmation ----

function pairingScreen(st: State, intents: Intents): HTMLElement {
  const p = st.pairing;
  const host = new URL(SIGNAL_URL.replace(/^ws/, "http")).host;
  const pane = h(
    "div",
    { class: "pane" },
    h("h2", {}, "Pair this Mac?"),
    h(
      "p",
      {},
      "A pairing link authorises this browser to connect to a Mac running the SimBeam daemon.",
    ),
    p && h("div", { class: "keybox" }, `broker ${host} · daemon ${p.daemon.slice(0, 16)}…`),
    st.pairingError && h("p", { class: "error-text" }, st.pairingError),
    h(
      "div",
      { class: "actions" },
      h(
        "button",
        {
          class: "btn-primary",
          disabled: st.pairingBusy,
          onclick: () => intents.confirmPairing(),
        },
        st.pairingBusy ? "Pairing…" : "Pair this Mac",
      ),
      h("button", { class: "btn-ghost", onclick: () => intents.cancelPairing() }, "Cancel"),
    ),
  );
  return h("div", { class: "card" }, pane);
}

// ---- Main: My Macs ----

function macRow(mac: SavedMac, st: State, intents: Intents): HTMLElement {
  const p = presenceOf(st.presence, mac.daemon);
  const dialing = st.dialingDaemon === mac.daemon;
  const subtitle = dialing
    ? st.phase
      ? PHASE_LABEL[st.phase]
      : "Connecting"
    : [
        p === "online" ? "Online" : p === "offline" ? "Offline" : null,
        mac.osVersion ? `macOS ${mac.osVersion}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Mac";

  const iconInner = dialing
    ? h("span", { class: "spinner" })
    : h("span", { class: "row-icon" }, macIcon(), h("span", { class: "dot-badge" }, dot(p)));

  const row = h(
    "div",
    {
      class: "row",
      onclick: () => (dialing ? intents.cancelDial() : intents.dialMac(mac)),
      oncontextmenu: (e: Event) => {
        e.preventDefault();
        if (confirm(`Unpair ${mac.name}? This forgets the Mac.`)) intents.unpairMac(mac);
      },
    },
    iconInner,
    h(
      "div",
      { class: "row-body" },
      h("div", { class: "row-title" }, mac.name),
      h("div", { class: "subtitle" }, subtitle),
    ),
    h("span", { class: "row-chevron" }, dialing ? "" : "›"),
  );
  return row;
}

function mainScreen(st: State, intents: Intents): HTMLElement {
  const topbar = h(
    "div",
    { class: "topbar" },
    h(
      "div",
      { class: "logo grow" },
      h("span", { class: "logo-mark" }),
      h("span", { class: "logo-name" }, "SimBeam"),
    ),
  );

  if (!st.macs.length) {
    const empty = h(
      "div",
      { class: "pane" },
      h("h2", {}, "No Macs paired yet"),
      h(
        "p",
        {},
        "Run the SimBeam companion on your Mac, press ",
        h("code", {}, "P"),
        " in its terminal, and open the pairing link it prints.",
      ),
    );
    return h("div", { class: "card" }, topbar, empty);
  }

  const list = h(
    "div",
    {},
    h("div", { class: "section-label" }, "MY MACS"),
    h("div", {}, ...st.macs.map((m) => macRow(m, st, intents))),
  );
  return h("div", { class: "card" }, topbar, h("div", { class: "content" }, list));
}

// ---- Simulators list ----

function simRow(sim: SimInfo, st: State, intents: Intents): HTMLElement {
  const kind = deviceKind(sim.name);
  const isBooting = st.booting[sim.udid] !== undefined;
  const booted = sim.state === "Booted";
  const stateText = isBooting ? "Booting…" : booted ? "Booted" : "Shut Down";
  const icon = h(
    "span",
    { class: "row-icon" },
    simIcon(kind),
    booted &&
      !isBooting &&
      h("span", { class: "dot-badge" }, h("span", { class: "dot dot-online" })),
  );
  const action = booted
    ? h(
        "button",
        { class: "btn-ghost row-action", onclick: stop(() => intents.shutdownSim(sim)) },
        "Switch Off",
      )
    : h(
        "button",
        {
          class: "btn-ghost row-action",
          disabled: isBooting,
          onclick: stop(() => intents.bootSim(sim)),
        },
        "Switch On",
      );

  return h(
    "div",
    { class: "row", onclick: () => intents.openSim(sim) },
    icon,
    h(
      "div",
      { class: "row-body" },
      h("div", { class: "row-title" }, sim.name),
      h("div", { class: "subtitle" }, `${stateText} · ${sim.os_version}`),
    ),
    action,
    h("span", { class: "row-chevron" }, "›"),
  );
}

function listScreen(st: State, intents: Intents): HTMLElement {
  const mac = st.connectedMac;
  const p = mac ? presenceOf(st.presence, mac.daemon) : "undefined";
  const subtitleBits = [
    `${st.sims.length} simulator${st.sims.length === 1 ? "" : "s"}`,
    p === "online" ? "online" : p === "offline" ? "offline" : null,
    mac?.osVersion ? `macOS ${mac.osVersion}` : null,
  ].filter(Boolean);

  const topbar = h(
    "div",
    { class: "topbar" },
    h("button", { class: "btn-ghost btn-back", onclick: () => intents.goMain() }, "‹"),
    h(
      "div",
      { class: "grow" },
      h("div", { class: "title" }, mac?.name ?? "Mac"),
      h("div", { class: "subtitle" }, subtitleBits.join(" · ")),
    ),
  );

  const banner =
    st.listReconnecting &&
    h("div", { class: "banner" }, h("span", { class: "spinner" }), "Reconnecting…");

  // Booted (and optimistically booting) simulators stay on top; shut-down ones
  // collapse behind a toggle so the ones you can use right now lead.
  const isUp = (s: SimInfo) => s.state === "Booted" || st.booting[s.udid] !== undefined;
  const up = st.sims.filter(isUp);
  const down = st.sims.filter((s) => !isUp(s));

  let body: HTMLElement;
  if (!st.sims.length) {
    body = h(
      "div",
      { class: "pane" },
      h("h2", {}, "No simulators"),
      h("p", {}, "This Mac has no simulators. Create one in Xcode and pull to refresh."),
    );
  } else {
    const children: (Node | false)[] = [...up.map((s) => simRow(s, st, intents))];
    if (down.length) {
      children.push(shutdownToggle(down.length, st.showShutdownSims, intents));
      if (st.showShutdownSims) children.push(...down.map((s) => simRow(s, st, intents)));
    }
    body = h(
      "div",
      { class: "content" },
      h("div", {}, ...children.filter(Boolean).map((c) => c as Node)),
    );
  }

  return h("div", { class: "card" }, topbar, banner || h("span", {}), body);
}

/** The collapsed shut-down section header — click to reveal/hide the rows. */
function shutdownToggle(count: number, open: boolean, intents: Intents): HTMLElement {
  return h(
    "button",
    { class: `sim-toggle${open ? " open" : ""}`, onclick: () => intents.toggleShutdownSims() },
    h("span", { class: "sim-toggle-chevron" }, "›"),
    h("span", {}, `${count} shut down`),
  );
}

// ---- Simulator screen ----

function canvasOverlay(state: CanvasState, sim: SimInfo | null): HTMLElement | false {
  const spinnerStates: CanvasState[] = ["connecting", "booting"];
  const title: Partial<Record<CanvasState, string>> = {
    connecting: "Connecting…",
    booting: "Booting…",
    paused: "Paused",
    disconnected: "Reconnecting…",
    off: "Shut Down",
  };
  if (state === "playing") return false;
  return h(
    "div",
    { class: "stage-overlay" },
    spinnerStates.includes(state) && h("span", { class: "spinner" }),
    h("span", { class: "big" }, title[state] ?? ""),
    sim && h("span", { class: "small" }, sim.name),
  );
}

function simScreen(st: State, intents: Intents, video: HTMLVideoElement): HTMLElement {
  const sim = st.currentSim;
  const kind = sim ? deviceKind(sim.name) : "phone";
  const booted = sim?.state === "Booted" || st.canvas === "playing";

  const topbar = h(
    "div",
    { class: "topbar" },
    h("button", { class: "btn-ghost btn-back", onclick: () => intents.goList() }, "‹"),
    h("div", { class: "grow title" }, sim?.name ?? "Simulator"),
    h("button", { class: "btn-ghost", onclick: () => menu(st, intents) }, "⋯"),
  );

  const infobar = h(
    "div",
    { class: "infobar" },
    sim && h("span", { class: "chip" }, sim.os_version),
    h(
      "span",
      { class: "status" },
      h("span", { class: `dot dot-${booted ? "online" : "offline"}` }),
      st.canvas === "off" ? "Shut Down" : booted ? "Booted" : "…",
    ),
  );

  video.className = kind === "legacy" ? "legacy" : "";
  video.style.display = st.canvas === "playing" ? "block" : "none";
  wireInput(video, intents);

  const overlay = canvasOverlay(st.canvas, sim);
  const stageChildren: (Node | false)[] = [video, overlay];
  if (st.canvas === "off") {
    stageChildren.push(
      h(
        "button",
        {
          class: "btn-primary",
          style: "pointer-events:auto;margin-top:8px",
          onclick: () => sim && intents.bootSim(sim),
        },
        "Switch On",
      ),
    );
  }
  if (st.canvas === "paused") {
    stageChildren.push(
      h(
        "button",
        {
          class: "btn-primary",
          style: "pointer-events:auto;margin-top:8px",
          onclick: () => intents.togglePause(),
        },
        "Play",
      ),
    );
  }

  // The command capsule sits vertically at the canvas's trailing edge and shows
  // only while the session is live (playing or paused). It duplicates the
  // ⋯ menu — icons, one tap away.
  const showToolbar = st.canvas === "playing" || st.canvas === "paused";
  const toolbar =
    showToolbar &&
    h(
      "div",
      { class: "toolbar-v" },
      h(
        "div",
        { class: "capsule-v" },
        iconButton(homeIcon(), "Home", () => intents.home()),
        iconButton(shakeIcon(), "Shake", () => intents.shake()),
        st.screenshotBusy
          ? h(
              "span",
              { class: "cap-btn", title: "Saving screenshot…" },
              h("span", { class: "spinner" }),
            )
          : iconButton(cameraIcon(), "Screenshot", () => intents.screenshot()),
      ),
    );

  const stage = h(
    "div",
    { class: "stage" },
    h("div", { class: "stage-inner" }, ...stageChildren.filter(Boolean).map((c) => c as Node)),
    toolbar || h("span", {}),
  );

  return h("div", { class: "card" }, topbar, infobar, stage);
}

/** A round icon button with an accessible label (the icon replaces text). */
function iconButton(icon: SVGElement, label: string, onClick: () => void): HTMLElement {
  return h(
    "button",
    { class: "cap-btn", title: label, "aria-label": label, onclick: onClick },
    icon,
  );
}

/** The three-dots menu — the surface that always carries every action. */
function menu(st: State, intents: Intents): void {
  const sim = st.currentSim;
  if (!sim) return;
  const live = st.canvas === "playing" || st.canvas === "paused";
  const options: [string, () => void][] = [];
  if (live) options.push([st.canvas === "playing" ? "Pause" : "Play", () => intents.togglePause()]);
  if (st.canvas === "playing") {
    options.push(["Home", () => intents.home()]);
    options.push(["Shake", () => intents.shake()]);
    options.push(["Screenshot", () => intents.screenshot()]);
  }
  const isBooted = sim.state === "Booted" || st.canvas === "playing";
  options.push(
    isBooted
      ? ["Switch Off", () => intents.shutdownSim(sim)]
      : ["Switch On", () => intents.bootSim(sim)],
  );

  const choice = prompt(
    `${sim.name}\n\n${options.map(([label], i) => `${i + 1}. ${label}`).join("\n")}\n\nType a number:`,
  );
  if (!choice) return;
  const idx = Number.parseInt(choice, 10) - 1;
  options[idx]?.[1]();
}

// ---- input wiring (tap / swipe / key) ----

const SWIPE_THRESHOLD_PX = 6;
let inputWired: WeakSet<HTMLVideoElement> | null = null;

function wireInput(video: HTMLVideoElement, intents: Intents): void {
  if (!inputWired) inputWired = new WeakSet();
  if (inputWired.has(video)) return;
  inputWired.add(video);

  let drag: { x: number; y: number; cx: number; cy: number; t: number } | null = null;

  const norm = (e: PointerEvent) => {
    const r = video.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  video.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const c = norm(e);
    drag = { x: c.x, y: c.y, cx: e.clientX, cy: e.clientY, t: Date.now() };
    video.setPointerCapture(e.pointerId);
  });
  video.addEventListener("pointerup", (e) => {
    if (e.button !== 0 || !drag) return;
    const dx = e.clientX - drag.cx;
    const dy = e.clientY - drag.cy;
    if (Math.hypot(dx, dy) < SWIPE_THRESHOLD_PX) {
      intents.sendTap(drag.x, drag.y);
    } else {
      const end = norm(e);
      const duration = Math.max(0.05, (Date.now() - drag.t) / 1000);
      intents.sendSwipe(drag.x, drag.y, end.x, end.y, duration);
    }
    drag = null;
  });
  video.addEventListener("pointercancel", () => {
    drag = null;
  });
}

function stop(fn: () => void): (e: Event) => void {
  return (e: Event) => {
    e.stopPropagation();
    fn();
  };
}

// ---- top-level render ----

export function render(
  root: HTMLElement,
  st: State,
  intents: Intents,
  video: HTMLVideoElement,
): void {
  let inner: HTMLElement;
  let label = "Paired via link";
  if (st.route === "pairing") {
    inner = pairingScreen(st, intents);
    label = "Pairing";
  } else if (st.route === "list") {
    inner = listScreen(st, intents);
  } else if (st.route === "sim") {
    inner = simScreen(st, intents, video);
  } else {
    inner = mainScreen(st, intents);
  }

  const shell = h(
    "div",
    { class: "shell" },
    shellLabel(label.toUpperCase(), st, intents),
    inner,
    st.toast &&
      h(
        "p",
        { class: "footnote", style: st.toast.kind === "error" ? "color:var(--red)" : "" },
        st.toast.text,
      ),
  );

  root.replaceChildren(shell);
}
