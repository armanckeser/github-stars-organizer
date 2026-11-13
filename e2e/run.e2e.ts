import { expect, test, type Page } from "@playwright/test";
import { APP_URL } from "../src/lib/published-list.ts";
import type { Player } from "../src/lib/run.ts";
import { poolFor } from "./pool.ts";

// The Play screen in a real browser with the 3D board, against made-up accounts
// (e2e/pool.ts). Drags are real mouse drags to where the board says a cell is drawn.

type Spot = { clientX: number; clientY: number };

declare global {
  interface Window {
    /** Set by the board in development builds (src/components/battle/board3d.tsx). */
    stardBoard?: { screenOf: (x: number, y: number) => Spot; screenOfSlot: (slot: number) => Spot; screenOfArchive: () => Spot; screenOfUnit: (id: string) => Spot | null };
  }
}
/** A player's cell as column and row (row 0 in front), and the board cell it is drawn on. */
const boardCell = (col: number, row: number) => ({ x: col, y: 1 - row });

async function startRun(page: Page, search = "", pool: (login: string) => Player = poolFor) {
  await page.route("**/api/run/pool?*", (route) => route.fulfill({ json: pool(new URL(route.request().url()).searchParams.get("login") ?? "abed") }));
  await page.goto(`/run${search}`);
  await page.getByLabel("Your GitHub username").fill("abed");
  await page.getByRole("button", { name: "Start a run" }).click();
  await expect(page.getByLabel("1 of 2 cards on the board").locator("visible=true")).toBeVisible();
  await page.waitForFunction(() => window.stardBoard !== undefined);
}

const gold = async (page: Page) => Number((await page.getByLabel(/^\d+ gold$/).first().getAttribute("aria-label"))!.split(" ")[0]);
const cellSpot = (page: Page, col: number, row: number) => page.evaluate(({ x, y }) => window.stardBoard!.screenOf(x, y), boardCell(col, row));
const archiveSpot = (page: Page) => page.evaluate(() => window.stardBoard!.screenOfArchive());
const slotSpot = (page: Page, slot: number) => page.evaluate((index) => window.stardBoard!.screenOfSlot(index), slot);
const unitSpot = (page: Page, fullName: string) => page.evaluate((id) => window.stardBoard!.screenOfUnit(id), `0:${fullName}`);
const aceName = () => poolFor("abed").team[0].fullName;

/** Waits until the camera has stopped moving: it dollies when the shop folds or opens, as after a boost pick. */
async function settled(page: Page) {
  await expect.poll(async () => {
    const before = await cellSpot(page, 0, 0);
    await page.waitForTimeout(150);
    const after = await cellSpot(page, 0, 0);
    return Math.hypot(after.clientX - before.clientX, after.clientY - before.clientY);
  }).toBeLessThan(1);
}

async function drag(page: Page, from: Spot, to: Spot) {
  await page.mouse.move(from.clientX, from.clientY);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.clientX + ((to.clientX - from.clientX) * i) / 8, from.clientY + ((to.clientY - from.clientY) * i) / 8);
  await page.mouse.up();
}

/** Buys the cheapest card the gold allows. Returns its name, or null when none fits. */
async function buyCheapest(page: Page): Promise<string | null> {
  const cards = page.getByRole("button", { name: /^Look at .*, \d+ gold$/ });
  const labels = await cards.evaluateAll((all) => all.map((card) => card.getAttribute("aria-label") ?? ""));
  const priced = labels.map((label) => ({ label, price: Number(/, (\d+) gold$/.exec(label)![1]) })).sort((a, b) => a.price - b.price);
  const cheapest = priced[0];
  if (!cheapest || cheapest.price > (await gold(page))) return null;
  await page.getByRole("button", { name: cheapest.label, exact: true }).click();
  const buy = page.getByRole("button", { name: /^Buy for / });
  if (!(await buy.isEnabled())) {
    await page.keyboard.press("Escape");
    return null;
  }
  await buy.click();
  return /^Look at (.*), \d+ gold$/.exec(cheapest.label)![1];
}

/** Waits until a creature stands in a slot of the Drafts shelf. */
async function expectOnShelf(page: Page, fullName: string, slot: number) {
  await expectNear(page, fullName, await slotSpot(page, slot));
}

/** Waits until a creature has walked to the cell, a drag's glide included. */
async function expectAt(page: Page, fullName: string, col: number, row: number) {
  await expectNear(page, fullName, await cellSpot(page, col, row));
}

async function expectNear(page: Page, fullName: string, target: Spot) {
  await expect.poll(async () => {
    const at = await unitSpot(page, fullName);
    return at ? Math.hypot(at.clientX - target.clientX, at.clientY - target.clientY) : Infinity;
  }).toBeLessThan(30);
}

test("a bought card waits on the Drafts shelf, then drags to a cell on the board", async ({ page }) => {
  await startRun(page);
  const name = await buyCheapest(page);
  expect(name).not.toBeNull();
  await expectOnShelf(page, name!, 0);
  await expect(page.getByLabel("1 of 2 cards on the board").locator("visible=true")).toBeVisible();

  await drag(page, (await unitSpot(page, name!))!, await cellSpot(page, 2, 1));

  await expect(page.getByLabel("2 of 2 cards on the board").locator("visible=true")).toBeVisible();
  await expectAt(page, name!, 2, 1);
});

test("a board creature dragged to a free cell moves there", async ({ page }) => {
  await startRun(page);
  await expectAt(page, aceName(), 1, 0);
  await drag(page, (await unitSpot(page, aceName()))!, await cellSpot(page, 3, 1));
  await expectAt(page, aceName(), 3, 1);
});

test("two creatures trade cells when one is dropped on the other", async ({ page }) => {
  await startRun(page);
  const name = (await buyCheapest(page))!;
  await expectOnShelf(page, name, 0);
  await drag(page, (await unitSpot(page, name))!, await cellSpot(page, 0, 1));
  await expectAt(page, name, 0, 1);

  await drag(page, (await unitSpot(page, aceName()))!, await cellSpot(page, 0, 1));

  await expectAt(page, aceName(), 0, 1);
  await expectAt(page, name, 1, 0);
});

test("a creature dropped in the Archive is sold for its price", async ({ page }) => {
  await startRun(page);
  const before = await gold(page);
  const name = (await buyCheapest(page))!;
  const paid = before - (await gold(page));
  await drag(page, (await unitSpot(page, name))!, await cellSpot(page, 2, 1));
  await expect(page.getByLabel("2 of 2 cards on the board").locator("visible=true")).toBeVisible();

  await drag(page, (await unitSpot(page, name))!, await archiveSpot(page));

  await expect(page.getByLabel("1 of 2 cards on the board").locator("visible=true")).toBeVisible();
  expect(await gold(page)).toBe(before);
  expect(paid).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: new RegExp(`^Look at ${name.replace("/", "\\/")}, `) })).toBeVisible();
});

test("the last card sells, and Fight waits for a card on the board", async ({ page }) => {
  // Regression guarded: the Archive refused the last card ("Keep one"), so a player
  // couldn't sell everything to afford one better card.
  await startRun(page);
  const before = await gold(page);
  await drag(page, (await unitSpot(page, aceName()))!, await archiveSpot(page));
  await expect(page.getByLabel("0 of 2 cards on the board").locator("visible=true")).toBeVisible();
  expect(await gold(page)).toBeGreaterThan(before);
  const fight = page.getByRole("button", { name: "Fight" }).locator("visible=true");
  await expect(fight).toBeDisabled();
  // With no checks of your own, the other team's checks still sit at the right edge.
  const theirs = (await page.locator(".checks-right").locator("visible=true").boundingBox())!;
  expect(theirs.x + theirs.width).toBeGreaterThan(page.viewportSize()!.width * 0.8);

  const name = (await buyCheapest(page))!;
  await settled(page);
  await drag(page, (await unitSpot(page, name))!, await cellSpot(page, 1, 0));
  await expect(page.getByLabel("1 of 2 cards on the board").locator("visible=true")).toBeVisible();
  await expect(fight).toBeEnabled();
});

test("a check's hover names the cards on the board that fill it", async ({ page }) => {
  // Regression guarded: the hover gave a set's bonus but not which cards were in it,
  // so a player couldn't tell what to keep or swap to finish the set.
  await startRun(page);
  const check = page.getByTestId("set-bonus").locator("visible=true").first();
  await check.hover();
  await expect(check.getByRole("tooltip")).toContainText(aceName().split("/")[1]);
});

test("a reroll costs one gold and shows other cards", async ({ page }) => {
  await startRun(page);
  const shopNames = () => page.getByRole("button", { name: /^Look at / }).evaluateAll((all) => all.map((card) => card.getAttribute("aria-label")));
  const before = await shopNames();
  const goldBefore = await gold(page);

  await page.getByRole("button", { name: /^Reroll/ }).click();

  expect(await gold(page)).toBe(goldBefore - 1);
  expect(await shopNames()).not.toEqual(before);
});

test("a bought slot lets one more card on the board", async ({ page }) => {
  await startRun(page);
  expect(await gold(page)).toBe(4);
  await page.getByRole("button", { name: "One more board slot for 4 gold" }).locator("visible=true").click();
  await expect(page.getByLabel("1 of 3 cards on the board").locator("visible=true")).toBeVisible();
  expect(await gold(page)).toBe(0);
  await expect(page.getByRole("button", { name: "One more board slot for 4 gold" }).locator("visible=true")).toBeDisabled();
});

test("a whole run plays to its end, with the two boost picks", async ({ page }) => {
  // Seven rounds of software WebGL: about 40 s on a laptop and over 120 s on CI's runner.
  test.setTimeout(360_000);
  await startRun(page);
  const free = [[2, 0], [0, 0], [3, 0], [1, 1], [2, 1], [0, 1], [3, 1]];
  let picks = 0;
  for (let round = 1; round <= 7; round++) {
    const limit = Number(/of (\d+) cards/.exec((await page.getByLabel(/ cards on the board$/).locator("visible=true").getAttribute("aria-label"))!)![1]);
    let onBoard = Number(/^(\d+) of/.exec((await page.getByLabel(/ cards on the board$/).locator("visible=true").getAttribute("aria-label"))!)![1]);
    let bought: string | null;
    while (onBoard < limit && free.length > 0 && (bought = await buyCheapest(page))) {
      const [col, row] = free.shift()!;
      await settled(page);
      await expectOnShelf(page, bought, 0);
      await drag(page, (await unitSpot(page, bought))!, await cellSpot(page, col, row));
      onBoard++;
      await expect(page.getByLabel(`${onBoard} of ${limit} cards on the board`).locator("visible=true")).toBeVisible();
    }
    await page.getByRole("button", { name: "Fight" }).locator("visible=true").click();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    const ended = page.getByText(/^Run (finished|over)$/);
    const boost = page.getByRole("dialog", { name: "Pick a boost" });
    const next = page.getByLabel(/ cards on the board$/).locator("visible=true");
    // The next shop's card art is drawn before the round opens, which takes seconds in software WebGL.
    await expect(ended.or(boost).or(next).first()).toBeVisible({ timeout: 30_000 });
    if (await ended.isVisible()) break;
    if (await boost.isVisible()) {
      await boost.getByRole("button").first().click();
      picks++;
    }
  }
  await expect(page.getByText(/^Run (finished|over)$/)).toBeVisible();
  await expect(page.getByText(/^\d wins?, \d loss(es)?$/)).toBeVisible();
  expect(picks).toBe(2);
});

test("?fps=1 shows a frame counter", async ({ page }) => {
  await startRun(page, "?fps=1");
  await expect(page.getByTestId("fps")).toHaveText(/^\d+ fps$/);
});

test("without ?fps=1 there is no frame counter", async ({ page }) => {
  await startRun(page);
  await expect(page.getByTestId("fps")).toHaveCount(0);
});

// A share link's token, as the Worker would hand one back; the browser never opens it.
const TOKEN = "abeds-team-token";
// Every card a hundred times as strong, so the run wins every round whatever the day's opponents.
const STRENGTH = 100;
const strongAbed = (login: string): Player => {
  const pool = poolFor(login);
  if (login !== "abed") return pool;
  return { ...pool, team: pool.team.map((fighter) => ({ ...fighter, card: { ...fighter.card, hp: fighter.card.hp * STRENGTH, attack: fighter.card.attack * STRENGTH } })) };
};

test("the end screen names who the run beat, and copies a challenge with the friend on the link", async ({ page, context }) => {
  // Regression guarded: a run's end was a dead end, with no one named and nothing to send a friend.
  test.setTimeout(360_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/run/team", (route) => (route.request().method() === "POST" ? route.fulfill({ json: { token: TOKEN } }) : route.fallback()));
  await startRun(page, "", strongAbed);
  const beaten: string[] = [];
  const ended = page.getByText(/^Run (finished|over)$/);
  for (let round = 1; round <= 5 && !(await ended.isVisible()); round++) {
    const about = await page.getByRole("button", { name: /^About / }).evaluateAll((all) => all.map((button) => button.getAttribute("aria-label")!.slice("About ".length)));
    beaten.push(about.find((login) => login !== "abed")!);
    await page.getByRole("button", { name: "Fight" }).locator("visible=true").click();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page.getByText(`Round ${round} won`)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    const boost = page.getByRole("dialog", { name: "Pick a boost" });
    const next = page.getByLabel(/ cards on the board$/).locator("visible=true");
    await expect(ended.or(boost).or(next).first()).toBeVisible({ timeout: 30_000 });
    if (await boost.isVisible()) await boost.getByRole("button").first().click();
  }
  await expect(page.getByText("Run finished")).toBeVisible();
  expect(new Set(beaten).size).toBe(5);
  const [first, second, third] = beaten;
  await expect(page.getByText(`You beat @${first}, @${second}, @${third} and 2 more`)).toBeVisible();

  await page.getByLabel("Friend's GitHub username").fill("@annie");
  await page.getByRole("button", { name: "Challenge a friend" }).click();
  await expect(page.getByRole("button", { name: "Copied" }).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`I beat @${first}, @${second}, @${third} and 2 more with my GitHub stars on Stard. @annie, beat my team: ${APP_URL}team?t=${TOKEN}&to=annie`);
});

/** abed's saved team, as GET /api/run/team answers for a link. */
function savedAbed() {
  const pool = poolFor("abed");
  return { v: 1, login: "abed", avatarUrl: null, character: pool.character, day: "2026-11-11", wins: 5, losses: 0, fighters: [pool.team[0]], rounds: [{ units: [{ fighter: 0, col: 1, row: 0 }], boosts: [] }] };
}

test("a challenge link greets the friend, and Beat this team fills in their name without starting", async ({ page }) => {
  // Regression guarded: a challenged friend landing on a page that doesn't say it's for them, or a run started as someone else.
  await page.route("**/api/run/team?t=*", (route) => route.fulfill({ json: savedAbed() }));
  await page.goto(`/team?t=${TOKEN}&to=annie`);
  await expect(page.getByText("@abed challenges you")).toBeVisible();
  await page.getByRole("link", { name: "Beat this team" }).click();
  await expect.poll(() => Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ against: TOKEN, name: "annie" });
  await expect(page.getByLabel("Your GitHub username")).toHaveValue("annie");
  await expect(page.getByRole("button", { name: "Start a run" })).toBeEnabled();
});

test("a team link without a friend, or with one that isn't a username, greets no one", async ({ page }) => {
  await page.route("**/api/run/team?t=*", (route) => route.fulfill({ json: savedAbed() }));
  await page.goto(`/team?t=${TOKEN}&to=${encodeURIComponent("<b>annie")}`);
  await expect(page.getByRole("heading", { name: "A team from @abed's stars" })).toBeVisible();
  await expect(page.getByText(/challenges you/)).toHaveCount(0);
  await page.getByRole("link", { name: "Beat this team" }).click();
  await expect.poll(() => Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ against: TOKEN });
});
