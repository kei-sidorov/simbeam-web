// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Identity, KV } from "../protocol/identity";
import { Controller } from "./controller";
import { Store, initialState } from "./store";

const identity: Identity = {
  pub: "client",
  sign: async () => "signature",
};

function memKV(): KV {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}

describe("Controller video lifecycle", () => {
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("explicitly resumes a mounted Safari video while the stream is playing", async () => {
    const store = new Store({
      ...initialState(),
      route: "sim",
      canvas: "playing",
      currentSim: {
        udid: "u1",
        name: "iPhone 17",
        state: "Booted",
        os_version: "iOS 26.1",
      },
    });
    const controller = new Controller(store, identity, memKV());
    controller.video.srcObject = {} as MediaStream;

    controller.videoMounted();
    await Promise.resolve();

    expect(play).toHaveBeenCalledOnce();
  });

  it("keeps the negotiated MediaStream when returning to the simulator list", () => {
    const store = new Store({
      ...initialState(),
      route: "sim",
      canvas: "playing",
      currentSim: {
        udid: "u1",
        name: "iPhone 17",
        state: "Booted",
        os_version: "iOS 26.1",
      },
    });
    const controller = new Controller(store, identity, memKV());
    const stream = {} as MediaStream;
    controller.video.srcObject = stream;

    controller.goList();

    expect(pause).toHaveBeenCalledOnce();
    expect(controller.video.srcObject).toBe(stream);
    expect(store.get().route).toBe("list");
  });
});
