import type { DeviceKind } from "../protocol/messages";
import { svg } from "./dom";

const stroke = "#6b6b72";

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
