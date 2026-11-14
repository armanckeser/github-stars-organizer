import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type * as THREE from "three";
import { poolFor } from "../pool.ts";
import { instrument, seeded, type Recording } from "./instrument.ts";
import { RESULTS, summarize } from "./summary.ts";

// What the visual trade-offs would buy, none of which ship: a lower pixel ratio, a smaller
// shadow or none, and no blur behind the panels over the board. The phone is drawn on
// SwiftShader (the "phone-software" project), a GPU in software, so what the GPU spends
// shows up as time; this machine's own GPU draws every option well inside a frame. The
// numbers compare the options with each other, not with any real phone.
//   PERF_LABEL=options npx playwright test -c playwright.perf.config.ts options.perf.ts
//
// The board's draw is timed for every option on one frozen frame, inside one synchronous
// loop: the shop, and a moment of the first fight. The blur is the browser compositing
// the page, outside the board's draw, so it is measured as the frame rate instead, with
// and without it in turns.

/** The board as the page holds it in the perf build: its renderer, scene and camera are private to the board's code, and read here only. */
type Internals = { stardBoard: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera } };
type DrawOption = { name: string; pixelRatio: number; shadow: number | null };

const SEED = 20261113;
/** The phone's pixel ratio and shadow as the board sets them (src/components/battle/three/board.ts). */
const SHIPPED: DrawOption = { name: "as shipped (pixel ratio 1.75, shadow 512)", pixelRatio: 1.75, shadow: 512 };
const DRAW_OPTIONS: DrawOption[] = [
  SHIPPED,
  { name: "pixel ratio 1.5", pixelRatio: 1.5, shadow: 512 },
  { name: "pixel ratio 1.25", pixelRatio: 1.25, shadow: 512 },
  { name: "pixel ratio 1", pixelRatio: 1, shadow: 512 },
  { name: "shadow 256", pixelRatio: 1.75, shadow: 256 },
  { name: "no shadows", pixelRatio: 1.75, shadow: null },
];
/** Draws timed per option, after a few to warm it up; the median is kept. */
const DRAWS = 15;
const WARM_UP = 3;
/** Turns with and without the blur, each this long. */
const BLUR_TURNS = 4;
const BLUR_TURN = 2_000;
const NO_BLUR = "*, *::before, *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }";
const LABEL = process.env.PERF_LABEL ?? "options";

/** The median ms the board takes to draw one frame, the GPU's work included, for each option, on the frame the board shows now. */
const drawCosts = (page: Page) =>
  page.evaluate(
    ({ options, draws, warmUp, shipped }) => {
      const { renderer, scene, camera } = (window as unknown as Internals).stardBoard;
      const context = renderer.getContext();
      const pixel = new Uint8Array(4);
      const set = (option: DrawOption) => {
        renderer.setPixelRatio(option.pixelRatio);
        scene.traverse((node) => {
          const light = node as THREE.DirectionalLight;
          if (!light.isDirectionalLight || !light.shadow) return;
          light.castShadow = option.shadow !== null;
          if (option.shadow === null || light.shadow.mapSize.x === option.shadow) return;
          light.shadow.mapSize.set(option.shadow, option.shadow);
          light.shadow.map?.dispose();
          light.shadow.map = null;
        });
      };
      // Reading back a pixel waits for the GPU to finish the draw.
      const draw = () => {
        renderer.render(scene, camera);
        context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
      };
      const costs: Record<string, number> = {};
      for (const option of options) {
        set(option);
        for (let i = 0; i < warmUp; i++) draw();
        const times: number[] = [];
        for (let i = 0; i < draws; i++) {
          const started = performance.now();
          draw();
          times.push(performance.now() - started);
        }
        times.sort((a, b) => a - b);
        costs[option.name] = Math.round(times[Math.floor(times.length / 2)] * 10) / 10;
      }
      set(shipped);
      return costs;
    },
    { options: DRAW_OPTIONS, draws: DRAWS, warmUp: WARM_UP, shipped: SHIPPED },
  );

async function frameRate(page: Page, ms: number): Promise<number> {
  await page.evaluate(() => window.stardPerf!.begin());
  await page.waitForTimeout(ms);
  const recording: Recording = await page.evaluate(() => window.stardPerf!.end());
  return summarize(recording).fps;
}

async function blurTurns(page: Page): Promise<{ withBlur: number[]; withoutBlur: number[] }> {
  const withBlur: number[] = [];
  const withoutBlur: number[] = [];
  for (let turn = 0; turn < BLUR_TURNS; turn++) {
    withBlur.push(await frameRate(page, BLUR_TURN));
    await page.evaluate((rule) => {
      const style = document.createElement("style");
      style.id = "perf-no-blur";
      style.textContent = rule;
      document.head.append(style);
    }, NO_BLUR);
    withoutBlur.push(await frameRate(page, BLUR_TURN));
    await page.evaluate(() => document.getElementById("perf-no-blur")?.remove());
  }
  return { withBlur, withoutBlur };
}

test("what each visual trade-off would buy, on a GPU in software", async ({ page }, testInfo) => {
  test.setTimeout(15 * 60_000);
  await page.addInitScript(seeded, SEED);
  await page.addInitScript(instrument);
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  await page.route("**/api/run/opponents", (route) => route.fulfill({ json: { optedOut: [] } }));
  await page.route("**/api/run/pool?*", (route) => route.fulfill({ json: poolFor(new URL(route.request().url()).searchParams.get("login") ?? "abed") }));
  await page.goto("/run");
  await page.getByLabel("Your GitHub username").fill("abed");
  await page.getByRole("button", { name: "Start a run" }).click();
  await expect(page.getByLabel(/ cards on the board$/).locator("visible=true").first()).toBeVisible({ timeout: 120_000 });
  await page.waitForFunction(() => "stardBoard" in window);
  await page.waitForTimeout(3_000);
  const gpu = await page.evaluate(() => {
    const context = (window as unknown as Internals).stardBoard.renderer.getContext();
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    return debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "unknown";
  });
  console.log(`drawn on: ${gpu}`);

  const shopDraw = await drawCosts(page);
  const shopBlur = await blurTurns(page);
  await page.getByRole("button", { name: "Fight" }).locator("visible=true").click();
  await page.waitForTimeout(1_500);
  const fightDraw = await drawCosts(page);
  const fightBlur = await blurTurns(page);

  mkdirSync(RESULTS, { recursive: true });
  const results = { gpu, draw: { shop: shopDraw, fight: fightDraw }, blur: { shop: shopBlur, fight: fightBlur } };
  writeFileSync(path.join(RESULTS, `${LABEL}-${testInfo.project.name}.json`), JSON.stringify(results, null, 2));
  console.table(DRAW_OPTIONS.map(({ name }) => ({ option: name, shopMs: shopDraw[name], fightMs: fightDraw[name] })));
  console.log("fps with and without the blur, in turns:", JSON.stringify(results.blur));
});
