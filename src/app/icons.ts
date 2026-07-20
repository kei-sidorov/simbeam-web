import type { DeviceKind } from "../protocol/messages";
import { svg } from "./dom";

// Device glyphs inherit the container's text colour so they adapt to the theme.
const stroke = "currentColor";

export function macIcon(): SVGElement {
  return svg([
    {
      tag: "rect",
      attrs: { x: 2.5, y: 4, width: 19, height: 12.5, rx: 2, stroke, "stroke-width": 1.6 },
    },
    {
      tag: "path",
      attrs: {
        d: "M8.5 20h7l-.7-3.5h-5.6z",
        stroke,
        "stroke-width": 1.4,
        "stroke-linejoin": "round",
      },
    },
  ]);
}

function phone(): SVGElement {
  return svg([
    {
      tag: "rect",
      attrs: { x: 7, y: 2.5, width: 10, height: 19, rx: 2.6, stroke, "stroke-width": 1.6 },
    },
    {
      tag: "path",
      attrs: { d: "M10.5 5h3", stroke, "stroke-width": 1.4, "stroke-linecap": "round" },
    },
  ]);
}

function legacy(): SVGElement {
  return svg([
    {
      tag: "rect",
      attrs: { x: 7, y: 2.5, width: 10, height: 19, rx: 2, stroke, "stroke-width": 1.6 },
    },
    { tag: "circle", attrs: { cx: 12, cy: 18.6, r: 1.2, stroke, "stroke-width": 1.3 } },
    {
      tag: "path",
      attrs: { d: "M10.5 4.8h3", stroke, "stroke-width": 1.3, "stroke-linecap": "round" },
    },
  ]);
}

function ipad(): SVGElement {
  return svg([
    {
      tag: "rect",
      attrs: { x: 4.5, y: 3, width: 15, height: 18, rx: 2.4, stroke, "stroke-width": 1.6 },
    },
    { tag: "circle", attrs: { cx: 12, cy: 18.4, r: 0.9, fill: stroke } },
  ]);
}

export function simIcon(kind: DeviceKind): SVGElement {
  return kind === "legacy" ? legacy() : kind === "ipad" ? ipad() : phone();
}

// ---- toolbar icons (Lucide, ISC-licensed, inlined; stroke = currentColor) ----

const line = {
  stroke: "currentColor",
  "stroke-width": 1.8,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
};

export function homeIcon(): SVGElement {
  return svg([
    { tag: "path", attrs: { d: "M15 21v-7a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v7", ...line } },
    {
      tag: "path",
      attrs: {
        d: "M3 10.5a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6a2 2 0 0 1 .7 1.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
        ...line,
      },
    },
  ]);
}

export function shakeIcon(): SVGElement {
  return svg([
    { tag: "path", attrs: { d: "m2 8 2 2-2 2 2 2-2 2", ...line } },
    { tag: "path", attrs: { d: "m22 8-2 2 2 2-2 2 2 2", ...line } },
    { tag: "rect", attrs: { x: 8, y: 5, width: 8, height: 14, rx: 1.5, ...line } },
  ]);
}

export function cameraIcon(): SVGElement {
  return svg([
    {
      tag: "path",
      attrs: {
        d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z",
        ...line,
      },
    },
    { tag: "circle", attrs: { cx: 12, cy: 13, r: 3, ...line } },
  ]);
}

// ---- theme toggle glyphs (Lucide: sun / moon / contrast) ----

export function sunIcon(): SVGElement {
  return svg([
    { tag: "circle", attrs: { cx: 12, cy: 12, r: 4, ...line } },
    { tag: "path", attrs: { d: "M12 2v2", ...line } },
    { tag: "path", attrs: { d: "M12 20v2", ...line } },
    { tag: "path", attrs: { d: "m4.9 4.9 1.4 1.4", ...line } },
    { tag: "path", attrs: { d: "m17.7 17.7 1.4 1.4", ...line } },
    { tag: "path", attrs: { d: "M2 12h2", ...line } },
    { tag: "path", attrs: { d: "M20 12h2", ...line } },
    { tag: "path", attrs: { d: "m6.3 17.7-1.4 1.4", ...line } },
    { tag: "path", attrs: { d: "m19.1 4.9-1.4 1.4", ...line } },
  ]);
}

export function moonIcon(): SVGElement {
  return svg([{ tag: "path", attrs: { d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z", ...line } }]);
}

/** Half-filled circle — the "auto / follow system" state. */
export function autoIcon(): SVGElement {
  return svg([
    { tag: "circle", attrs: { cx: 12, cy: 12, r: 9, ...line } },
    { tag: "path", attrs: { d: "M12 3a9 9 0 0 1 0 18Z", fill: "currentColor" } },
  ]);
}

export function themeIcon(pref: "auto" | "light" | "dark"): SVGElement {
  return pref === "light" ? sunIcon() : pref === "dark" ? moonIcon() : autoIcon();
}
