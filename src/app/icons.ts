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
