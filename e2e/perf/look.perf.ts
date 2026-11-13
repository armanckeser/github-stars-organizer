import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { poolFor } from "../pool.ts";
import { seeded } from "./instrument.ts";

// The same seeded frames, saved so a perf change can show it changed nothing on screen:
// the shop and a moment of the first fight, drawn on a stopped clock, and every picture
// the run draws as an image (the shop's art, a card's portrait, the boost medallions),
// each with a hash of its pixels. Opt-in, with the perf harness:
//   PERF_LABEL=before npx playwright test -c playwright.perf.config.ts look.perf.ts
// writes test-results/perf/look/<label>-<device>-<name>.png and <label>-<device>.json.

type Spot = { clientX: number; clientY: number };
type Exposed = { stardBoard: { screenOfUnit: (id: string) => Spot | null } };

const SEED = 20261113;
/** How far into the first fight the fight's frame is taken, on the stopped clock. */
const INTO_FIGHT = 2_500;
const LABEL = process.env.PERF_LABEL ?? "look";
const OUT = path.resolve(process.env.PERF_OUT ?? "test-results/perf", "look");

/** The image's pixels, as the page decodes them, hashed: two images with the same hash look the same. */
const pixelHash = (image: Locator) =>
  image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const canvas = document.createElement("canvas");
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const pen = canvas.getContext("2d")!;
    pen.drawImage(element, 0, 0);
    const digest = await crypto.subtle.digest("SHA-256", pen.getImageData(0, 0, canvas.width, canvas.height).data);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
  });

/** The image's own bytes, saved as a PNG. */
async function saveImage(image: Locator, file: string) {
  const base64 = await image.evaluate(async (element: HTMLImageElement) => {
    const bytes = new Uint8Array(await (await fetch(element.src)).arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  writeFileSync(file, Buffer.from(base64, "base64"));
}

test("the run's frames and pictures, seeded", async ({ page }, testInfo) => {
  test.setTimeout(5 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const device = testInfo.project.name;
  const named = (name: string) => path.join(OUT, `${LABEL}-${device}-${name}.png`);
  const hashes: Record<string, string> = {};
  const picture = async (name: string, image: Locator) => {
    hashes[name] = await pixelHash(image);
    await saveImage(image, named(name));
  };

  await page.addInitScript(seeded, SEED);
  await page.clock.install();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  await page.route("**/api/run/opponents", (route) => route.fulfill({ json: { optedOut: [] } }));
  await page.route("**/api/run/pool?*", (route) => route.fulfill({ json: poolFor(new URL(route.request().url()).searchParams.get("login") ?? "abed") }));

  await page.goto("/run");
  await page.getByLabel("Your GitHub username").fill("abed");
  await page.getByRole("button", { name: "Start a run" }).click();
  await expect(page.getByLabel(/ cards on the board$/).locator("visible=true").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => "stardBoard" in window);
  const art = page.locator(".shop-art img");
  await expect(art).toHaveCount(5, { timeout: 30_000 });
  for (let slot = 0; slot < 5; slot++) await picture(`shop-art-${slot}`, art.nth(slot));

  const ace = poolFor("abed").team[0].fullName;
  const at = await page.evaluate((id) => (window as unknown as Exposed).stardBoard.screenOfUnit(id), `0:${ace}`);
  await page.mouse.click(at!.clientX, at!.clientY);
  const portrait = page.getByRole("dialog").locator("img").first();
  await expect(portrait).toBeVisible({ timeout: 30_000 });
  await picture("card-portrait", portrait);
  await page.keyboard.press("Escape");
  await expect(portrait).toBeHidden();

  await frameAt(page, 1_000, named("shop"));
  await page.getByRole("button", { name: "Fight" }).locator("visible=true").click();
  await frameAt(page, INTO_FIGHT, named("fight"));
  await page.clock.resume();

  const boost = page.getByRole("dialog", { name: "Pick a boost" });
  for (let round = 1; round <= 2; round++) {
    if (round > 1) await page.getByRole("button", { name: "Fight" }).locator("visible=true").click();
    const speed = page.getByRole("button", { name: /^[12]×$/ });
    if ((await speed.textContent()) !== "2×") await speed.click();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Continue" }).click();
  }
  const medallions = boost.locator(".boost-coin img");
  await expect(medallions).toHaveCount(3, { timeout: 30_000 });
  for (let index = 0; index < 3; index++) await picture(`medallion-${index}`, medallions.nth(index));

  writeFileSync(path.join(OUT, `${LABEL}-${device}.json`), JSON.stringify(hashes, null, 2));
  console.log(`${device}:`, hashes);
});

/** The board `ms` on from now on a stopped clock, every frame between drawn in order, saved as a screenshot. */
async function frameAt(page: Page, ms: number, file: string) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 100);
  await page.clock.runFor(ms);
  await page.screenshot({ path: file, animations: "disabled" });
}
