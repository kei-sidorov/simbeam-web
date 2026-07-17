type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;
type Child = Node | string | null | undefined | false;

/** Minimal hyperscript. Event handlers are `on*` keys (e.g. onclick). */
export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === "class") {
      el.className = String(v);
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

/** Inline SVG helper (namespaced). */
export function svg(paths: { tag: string; attrs: Record<string, string | number> }[]): SVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const root = document.createElementNS(ns, "svg");
  root.setAttribute("width", "22");
  root.setAttribute("height", "22");
  root.setAttribute("viewBox", "0 0 24 24");
  root.setAttribute("fill", "none");
  for (const p of paths) {
    const node = document.createElementNS(ns, p.tag);
    for (const [k, val] of Object.entries(p.attrs)) node.setAttribute(k, String(val));
    root.append(node);
  }
  return root;
}
