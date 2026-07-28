// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Intents } from "./controller";
import { render } from "./render";
import { type State, initialState } from "./store";

// A no-op Intents stub; these tests assert rendered output, not behavior.
const noop = (): void => {};
const intents = new Proxy({}, { get: () => noop }) as Intents;

function mount(patch: Partial<State>): HTMLElement {
  const root = document.createElement("div");
  const video = document.createElement("video");
  render(root, { ...initialState(), ...patch }, intents, video);
  return root;
}

describe("render", () => {
  it("shows onboarding when no Macs are paired", () => {
    const root = mount({ route: "main", macs: [] });
    expect(root.textContent).toContain("No Macs paired yet");
  });

  it("renders the theme toggle reflecting the current preference", () => {
    const root = mount({ route: "main", macs: [], themePref: "dark" });
    const toggle = root.querySelector(".theme-toggle");
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("title")).toBe("Theme: Dark");
    expect(toggle?.querySelector("svg")).not.toBeNull();
  });

  it("lists paired Macs with presence text", () => {
    const root = mount({
      route: "main",
      macs: [{ daemon: "D1", name: "Kirill's MacBook Pro", osVersion: "15.4" }],
      presence: { D1: true },
    });
    expect(root.textContent).toContain("Kirill's MacBook Pro");
    expect(root.textContent).toContain("Online");
    expect(root.textContent).toContain("macOS 15.4");
  });

  it("shows the dialing phase on a Mac row", () => {
    const root = mount({
      route: "main",
      macs: [{ daemon: "D1", name: "Mac" }],
      dialingDaemon: "D1",
      phase: "ice",
    });
    expect(root.textContent).toContain("Looking for the best connection");
  });

  it("renders the simulators list with state + version", () => {
    const root = mount({
      route: "list",
      connectedMac: { daemon: "D1", name: "Mac", osVersion: "15.4" },
      presence: { D1: true },
      sims: [
        { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
        { udid: "u2", name: "iPad Pro", state: "Shutdown", os_version: "iPadOS 18.4" },
      ],
    });
    expect(root.textContent).toContain("iPhone 17");
    expect(root.textContent).toContain("Booted · iOS 18.4");
    expect(root.textContent).toContain("2 simulators");
  });

  it("keeps shut-down simulators collapsed behind a toggle", () => {
    const root = mount({
      route: "list",
      connectedMac: { daemon: "D1", name: "Mac" },
      showShutdownSims: false,
      sims: [
        { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
        { udid: "u2", name: "iPad Pro", state: "Shutdown", os_version: "iPadOS 18.4" },
        { udid: "u3", name: "iPhone SE", state: "Shutdown", os_version: "iOS 17.5" },
      ],
    });
    // Booted one is visible; shut-down rows are hidden behind the toggle.
    expect(root.textContent).toContain("iPhone 17");
    expect(root.textContent).not.toContain("iPad Pro");
    expect(root.textContent).not.toContain("iPhone SE");
    expect(root.querySelector(".sim-toggle")?.textContent).toContain("2 shut down");
  });

  it("reveals shut-down simulators when expanded", () => {
    const root = mount({
      route: "list",
      connectedMac: { daemon: "D1", name: "Mac" },
      showShutdownSims: true,
      sims: [
        { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
        { udid: "u2", name: "iPad Pro", state: "Shutdown", os_version: "iPadOS 18.4" },
      ],
    });
    expect(root.textContent).toContain("iPad Pro");
    expect(root.querySelector(".sim-toggle.open")).not.toBeNull();
  });

  it("renders no toggle when every simulator is booted", () => {
    const root = mount({
      route: "list",
      connectedMac: { daemon: "D1", name: "Mac" },
      sims: [{ udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" }],
    });
    expect(root.querySelector(".sim-toggle")).toBeNull();
  });

  it("shows the connection path badge when the transport is known", () => {
    const list = mount({
      route: "list",
      connectedMac: { daemon: "D1", name: "Mac" },
      transport: "lan",
    });
    const badge = list.querySelector(".net-badge");
    expect(badge?.textContent).toContain("LAN");
    expect(badge?.classList.contains("net-lan")).toBe(true);

    // On the stream screen the path shows borderless in the subtitle line.
    const sim = mount({
      route: "sim",
      currentSim: { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
      canvas: "playing",
      transport: "relay",
    });
    const inline = sim.querySelector(".net-inline");
    expect(inline?.textContent).toContain("REL");
    expect(inline?.classList.contains("net-rel")).toBe(true);
    expect(sim.textContent).toContain("iOS 18.4");
    expect(sim.textContent).not.toContain("Booted");
  });

  it("omits the path badge until the transport is known", () => {
    const root = mount({
      route: "list",
      connectedMac: { daemon: "D1", name: "Mac" },
      transport: null,
    });
    expect(root.querySelector(".net-badge")).toBeNull();
  });

  it("shows a reconnecting banner", () => {
    const root = mount({ route: "list", listReconnecting: true, sims: [] });
    expect(root.textContent).toContain("Reconnecting");
  });

  it("renders the playing simulator screen with an icon toolbar", () => {
    const root = mount({
      route: "sim",
      currentSim: { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
      canvas: "playing",
    });
    expect(root.textContent).toContain("iPhone 17");
    expect(root.querySelector('.capsule-v [aria-label="Home"]')).not.toBeNull();
    expect(root.querySelector('.capsule-v [aria-label="Shake"]')).not.toBeNull();
    expect(root.querySelector('.capsule-v [aria-label="Screenshot"]')).not.toBeNull();
    // Icons, not text labels.
    expect(root.querySelector(".capsule-v svg")).not.toBeNull();
  });

  it("shows Switch On in the switched-off canvas", () => {
    const root = mount({
      route: "sim",
      currentSim: { udid: "u1", name: "iPhone 17", state: "Shutdown", os_version: "iOS 18.4" },
      canvas: "off",
    });
    expect(root.textContent).toContain("Shut Down");
    expect(root.textContent).toContain("Switch On");
  });

  it("keeps the ⋯ dropdown closed by default", () => {
    const root = mount({
      route: "sim",
      currentSim: { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
      canvas: "playing",
    });
    expect(root.querySelector(".menu-pop")).toBeNull();
    expect(root.querySelector('[aria-haspopup="menu"]')?.getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("opens the ⋯ dropdown with the actions for the current state", () => {
    const root = mount({
      route: "sim",
      currentSim: { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
      canvas: "playing",
      caps: ["touch", "app_switcher"],
      menuOpen: true,
    });
    const pop = root.querySelector(".menu-pop");
    expect(pop).not.toBeNull();
    const labels = [...(pop?.querySelectorAll(".menu-item") ?? [])].map((b) => b.textContent);
    expect(labels).toEqual(["Pause", "Home", "App Switcher", "Shake", "Screenshot", "Switch Off"]);
    expect(pop?.querySelector(".menu-item-danger")?.textContent).toBe("Switch Off");
  });

  it("offers Send logs in the footer on every screen", () => {
    for (const route of ["main", "list", "sim"] as const) {
      const root = mount({ route });
      const btn = [...root.querySelectorAll(".shell-footer button")].find(
        (b) => b.textContent === "Send logs",
      );
      expect(btn, `missing on ${route}`).toBeDefined();
    }
  });

  it("shows the session log in a textarea with a copy action", () => {
    const root = mount({ logsOpen: true, logsText: "simbeam-web session log\n+0.001s  info  hi" });
    const ta = root.querySelector<HTMLTextAreaElement>(".log-text");
    expect(ta?.value).toContain("+0.001s  info  hi");
    expect(ta?.hasAttribute("readonly")).toBe(true);
    const labels = [...root.querySelectorAll(".sheet-actions button")].map((b) => b.textContent);
    expect(labels).toContain("Copy");
  });

  it("keeps the log sheet closed by default", () => {
    expect(mount({ route: "main" }).querySelector(".sheet")).toBeNull();
  });

  it("keeps App Switcher out of the side capsule", () => {
    const root = mount({
      route: "sim",
      currentSim: { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
      canvas: "playing",
      caps: ["touch", "app_switcher"],
    });
    expect(root.querySelector('.capsule-v [aria-label="App Switcher"]')).toBeNull();
  });

  it("stands a warning on screen while the daemon is behind this client", () => {
    for (const route of ["list", "sim"] as const) {
      const root = mount({
        route,
        connectedMac: { daemon: "D1", name: "Mac" },
        currentSim: { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
        canvas: "playing",
        caps: [],
        capsMissing: ["touch", "app_switcher"],
        daemonVersion: "0.11.0",
      });
      const banner = root.querySelector(".banner-warn");
      expect(banner?.textContent, `missing on ${route}`).toContain("0.11.0");
      expect(banner?.textContent).toContain("some actions are unavailable");
      // No capability names: the banner must not need a label per new cap.
      expect(banner?.textContent).not.toContain("touch");
    }
  });

  it("says nothing about capabilities before the daemon has answered", () => {
    const root = mount({
      route: "list",
      connectedMac: { daemon: "D1", name: "Mac" },
      caps: [],
      capsMissing: [],
    });
    expect(root.querySelector(".banner-warn")).toBeNull();
  });

  it("hides App Switcher from a daemon that cannot do it", () => {
    const root = mount({
      route: "sim",
      currentSim: { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
      canvas: "playing",
      caps: ["touch"],
      menuOpen: true,
    });
    const labels = [...root.querySelectorAll(".menu-pop .menu-item")].map((b) => b.textContent);
    expect(labels).not.toContain("App Switcher");
    expect(labels).toContain("Home");
  });

  it("offers Switch On in the ⋯ dropdown for a shut-down simulator", () => {
    const root = mount({
      route: "sim",
      currentSim: { udid: "u1", name: "iPhone 17", state: "Shutdown", os_version: "iOS 18.4" },
      canvas: "off",
      menuOpen: true,
    });
    const labels = [...root.querySelectorAll(".menu-pop .menu-item")].map((b) => b.textContent);
    expect(labels).toEqual(["Switch On"]);
  });

  it("hides the toolbar while connecting", () => {
    const root = mount({
      route: "sim",
      currentSim: { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
      canvas: "connecting",
    });
    expect(root.querySelector(".capsule-v")).toBeNull();
    expect(root.textContent).toContain("Connecting");
  });
});
