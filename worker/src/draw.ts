import { Resvg, initWasm } from "@resvg/resvg-wasm";
import wasm from "@resvg/resvg-wasm/index_bg.wasm";
import font from "./SpaceGrotesk-Bold.ttf";

// The one place SVG becomes PNG: the share picture (share.ts) and a card's art (art.ts).
// The library can be started only once per Worker, so both go through here.

export const FONT_FAMILY = "Space Grotesk";

let ready: Promise<void> | undefined;

/** The SVG drawn as a PNG, at its own size or scaled to `width`. */
export async function png(svg: string, width?: number): Promise<Uint8Array> {
  await (ready ??= initWasm(wasm));
  const drawn = new Resvg(svg, {
    font: { fontBuffers: [new Uint8Array(font)], loadSystemFonts: false, defaultFontFamily: FONT_FAMILY },
    ...(width ? { fitTo: { mode: "width" as const, value: width } } : {}),
  }).render();
  const bytes = drawn.asPng();
  drawn.free();
  return bytes;
}
