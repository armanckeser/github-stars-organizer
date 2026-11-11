/// <reference types="node" />
// The Worker's drawing library run in Node for tests: the same Resvg the Worker uses
// (draw.ts), loaded from the package's file because Node can't import a .wasm module.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import type { Draw } from "./art.ts";

let ready: Promise<void> | undefined;
const started = () => (ready ??= initWasm(readFileSync(fileURLToPath(new URL("../node_modules/@resvg/resvg-wasm/index_bg.wasm", import.meta.url).href))));

export const drawInNode: Draw = async (svg, width) => {
  await started();
  const drawn = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render();
  const bytes = drawn.asPng();
  drawn.free();
  return bytes;
};

/** A real PNG of one colour. */
export async function pngOf(width: number, height: number, color: string): Promise<Uint8Array> {
  return drawInNode(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${color}"/></svg>`, width);
}

/** A PNG's size from its header and the colour of its middle pixel, as #rrggbb. */
export async function looksOf(png: Uint8Array): Promise<{ width: number; height: number; middle: string }> {
  await started();
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const href = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  const drawn = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="${href}" width="${width}" height="${height}"/></svg>`).render();
  const at = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
  const middle = `#${[...drawn.pixels.slice(at, at + 3)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  drawn.free();
  return { width, height, middle };
}
