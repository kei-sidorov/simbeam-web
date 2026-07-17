import "./style.css";
import { Controller } from "./app/controller";
import { render } from "./app/render";
import { localKV } from "./app/storage";
import { Store, initialState } from "./app/store";
import { loadOrCreateIdentity } from "./protocol/identity";

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);

async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("#app not found");

  if (!("subtle" in crypto) || !crypto.subtle) {
    root.textContent = "This browser lacks WebCrypto. Use Chrome 113+ or Safari 17+ over HTTPS.";
    return;
  }

  const identity = await loadOrCreateIdentity(localKV);
  const store = new Store(initialState());
  const controller = new Controller(store, identity, localKV);

  store.subscribe((s) => render(root, s, controller, controller.video));
  controller.init();
  render(root, store.get(), controller, controller.video);

  // Hardware key forwarding while a stream is playing.
  window.addEventListener("keydown", (e) => {
    if (store.get().canvas !== "playing") return;
    if (MODIFIERS.has(e.key) || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    controller.sendKey(e.key);
  });
}

void main();
