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
    expect(root.textContent).toContain("Shut Down · iPadOS 18.4");
    expect(root.textContent).toContain("2 simulators");
  });

  it("shows a reconnecting banner", () => {
    const root = mount({ route: "list", listReconnecting: true, sims: [] });
    expect(root.textContent).toContain("Reconnecting");
  });

  it("renders the playing simulator screen with a toolbar", () => {
    const root = mount({
      route: "sim",
      currentSim: { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
      canvas: "playing",
    });
    expect(root.textContent).toContain("iPhone 17");
    expect(root.textContent).toContain("Home");
    expect(root.textContent).toContain("Shake");
    expect(root.textContent).toContain("Screenshot");
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

  it("hides the toolbar while connecting", () => {
    const root = mount({
      route: "sim",
      currentSim: { udid: "u1", name: "iPhone 17", state: "Booted", os_version: "iOS 18.4" },
      canvas: "connecting",
    });
    expect(root.textContent).not.toContain("Screenshot");
    expect(root.textContent).toContain("Connecting");
  });
});
