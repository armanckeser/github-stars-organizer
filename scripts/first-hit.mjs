// Seconds from opening a link to the first hit on screen, in a browser with an empty
// cache (Task 6 in docs/AGENT-TASKS.md). Each link gets a new browser context, and the
// caller starts a fresh Worker for each run so its edge cache is empty too.
//
//   npm i --no-save playwright
//   (cd worker && npx wrangler dev --port 8787 --persist-to "$(mktemp -d)")   # cold Worker cache
//   VITE_DEMO=1 VITE_CARD_ORIGIN= npx vite build && VITE_DEMO=1 npx vite preview --port 4173   # /api to the Worker
//   node scripts/first-hit.mjs <battle|run|front> [base url]
//
// A hit is on screen when the Battle screen's counter reads "Hit 1 of", or when the
// Play board draws its first damage number. On the Play screen the first hit needs the
// Fight button, which this presses the moment it can be pressed.

import { chromium } from "playwright";

const [kind = "battle", base = "http://localhost:4173"] = process.argv.slice(2);
const A = process.env.FIRST_HIT_A ?? "armanckeser";
const B = process.env.FIRST_HIT_B ?? "simonw";
const TIMEOUT = 90_000;

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const seconds = (ms) => (ms / 1000).toFixed(2);
const since = async () => page.evaluate(() => performance.now());

// A damage number is a span with only digits, added inside the board's canvas host.
const firstDamage = () =>
  page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => [...(canvas.parentElement?.querySelectorAll("span") ?? [])].some((span) => /^\d+$/.test(span.textContent ?? ""))), null, { timeout: TIMEOUT, polling: 16 });

async function fightWhenReady(marks) {
  const fight = page.getByRole("button", { name: "Fight" }).last();
  await fight.waitFor({ state: "visible", timeout: TIMEOUT });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim().endsWith("Fight") && !button.disabled && button.offsetParent !== null), null, { timeout: TIMEOUT });
  marks.ready = await since();
  await fight.click();
  marks.pressed = await since();
  await firstDamage();
  marks.hit = await since();
}

const marks = {};
if (kind === "battle") {
  await page.goto(`${base}/battle?a=${A}&b=${B}&play=1`);
  await page.getByText(/^Hit 1 of/).waitFor({ timeout: TIMEOUT });
  marks.hit = await since();
} else if (kind === "run") {
  await page.goto(`${base}/run?me=${A}`);
  await fightWhenReady(marks);
} else {
  await page.goto(`${base}/`);
  await page.getByRole("link", { name: "Play" }).first().click();
  await page.getByRole("button", { name: "Try with a sample account" }).click();
  await fightWhenReady(marks);
}
const report = { link: kind, firstHit: seconds(marks.hit) };
if (marks.ready !== undefined) Object.assign(report, { fightReady: seconds(marks.ready), pressToHit: seconds(marks.hit - marks.pressed) });
console.log(JSON.stringify(report));
await browser.close();
