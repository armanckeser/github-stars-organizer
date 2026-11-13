import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type CDPSession, type Page } from "@playwright/test";
import type { Player } from "../../src/lib/run.ts";
import type { RenderInfo } from "../../src/components/battle/three/board.ts";
import { poolFor } from "../pool.ts";
import { instrument, seeded, type Recording } from "./instrument.ts";
import { appCallers, hotFunctions, summarize, type CpuProfile, type FrameStats, type HotFunction } from "./summary.ts";

// A whole seeded run on the production build, with every scenario the owner plays
// measured: the shop at rest, a drag, fights at 1x and 2x, a fight with the creature
// panel open, the round's end into the next, the boost pick and a new run. Opt-in:
// `npx playwright test -c playwright.perf.config.ts` (see playwright.perf.config.ts).

type Spot = { clientX: number; clientY: number };
type Scenario = { name: string; round: number; stats: FrameStats; hot: HotFunction[]; callers: HotFunction[] };
type Snapshot = { round: number; when: string; heapMb: number; render: RenderInfo };

/** The board as the perf build leaves it on the page (src/components/battle/board3d.tsx). */
type Exposed = { stardBoard: { screenOf: (x: number, y: number) => Spot; screenOfUnit: (id: string) => Spot | null; renderInfo: () => RenderInfo } };

const SEED = 20261113;
/** The CPU slowdown on the phone profile: a mid-range phone against this machine. */
const PHONE_THROTTLE = 4;
const IDLE = 5_000;
const DRAG = 5_000;
const TRANSITION = 3_000;
const BOOST = 2_500;
const NEW_RUN = 4_000;
/** The longest a fight is followed; most end well before. */
const FIGHT_LIMIT = 40_000;
/** Which opponent, by the order the run first meets them, the player loses to: W L W L W W W plays all 7 rounds. */
const LOSE_TO = new Set([1, 3]);
/** How much weaker an opponent the player beats is, and how much stronger one it loses to. */
const BEATABLE = 0.25;
const UNBEATABLE = 6;
const PROFILE = process.env.PERF_PROFILE === "1";
const LABEL = process.env.PERF_LABEL ?? "run";
const OUT = path.resolve(process.env.PERF_OUT ?? "test-results/perf");
const DIST = path.resolve("dist-perf");

const scaled = (player: Player, by: number): Player => ({ ...player, team: player.team.map((fighter) => ({ ...fighter, hp: Math.round(fighter.hp * by), card: { ...fighter.card, hp: Math.round(fighter.card.hp * by), attack: Math.round(fighter.card.attack * by) } })) });

async function routes(page: Page) {
  const met: string[] = [];
  // Nothing leaves the machine: the live Worker, analytics and beacons are all refused.
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  await page.route("**/api/run/opponents", (route) => route.fulfill({ json: { optedOut: [] } }));
  await page.route("**/api/run/pool?*", (route) => {
    const login = new URL(route.request().url()).searchParams.get("login") ?? "abed";
    if (login === "abed") return route.fulfill({ json: poolFor(login) });
    if (!met.includes(login)) met.push(login);
    return route.fulfill({ json: scaled(poolFor(login), LOSE_TO.has(met.indexOf(login)) ? UNBEATABLE : BEATABLE) });
  });
}

const unitSpot = (page: Page, fullName: string) => page.evaluate((id) => (window as unknown as Exposed).stardBoard.screenOfUnit(id), `0:${fullName}`);
const cellSpot = (page: Page, col: number, row: number) => page.evaluate(({ x, y }) => (window as unknown as Exposed).stardBoard.screenOf(x, y), { x: col, y: 1 - row });
const boardCount = async (page: Page) => Number((await page.getByLabel(/ cards on the board$/).locator("visible=true").first().getAttribute("aria-label"))!.split(" ")[0]);
const gold = async (page: Page) => Number((await page.getByLabel(/^\d+ gold$/).first().getAttribute("aria-label"))!.split(" ")[0]);

/** How long one pointer step may take: Playwright's mouse has no timeout of its own, and a step Chromium never acknowledges once held a run for its whole 30 minutes. */
const POINTER_LIMIT = 60_000;

async function bounded(step: Promise<void>, what: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`${what} took over ${POINTER_LIMIT / 1000} s`)), POINTER_LIMIT)));
  try {
    await Promise.race([step, limit]);
  } finally {
    clearTimeout(timer);
  }
}

async function drag(page: Page, from: Spot, to: Spot, steps = 8) {
  await bounded(page.mouse.move(from.clientX, from.clientY), "mouse.move");
  await bounded(page.mouse.down(), "mouse.down");
  for (let i = 1; i <= steps; i++) await bounded(page.mouse.move(from.clientX + ((to.clientX - from.clientX) * i) / steps, from.clientY + ((to.clientY - from.clientY) * i) / steps), "mouse.move");
  await bounded(page.mouse.up(), "mouse.up");
}

/** Buys the cheapest card the gold allows, and puts it on a free cell if the board has room. */
async function buyAndPlace(page: Page): Promise<boolean> {
  const cards = page.getByRole("button", { name: /^Look at .*, \d+ gold$/ });
  const labels = await cards.evaluateAll((all) => all.map((card) => card.getAttribute("aria-label") ?? ""));
  const [cheapest] = labels.map((label) => ({ label, price: Number(/, (\d+) gold$/.exec(label)![1]) })).sort((a, b) => a.price - b.price);
  if (!cheapest || cheapest.price > (await gold(page))) return false;
  await page.getByRole("button", { name: cheapest.label, exact: true }).click();
  // The card's buy button names why it can't buy: too little gold, or a full Drafts shelf.
  const buy = page.getByRole("button", { name: /^(Buy for |Costs |Bench is full)/ });
  if (!(await buy.isEnabled())) {
    await page.keyboard.press("Escape");
    return false;
  }
  await buy.click();
  const name = /^Look at (.*), \d+ gold$/.exec(cheapest.label)![1];
  const limit = Number((await page.getByLabel(/ cards on the board$/).locator("visible=true").first().getAttribute("aria-label"))!.split(" ")[2]);
  // A drop on a taken cell trades places, so the next cell is tried until one is free.
  for (let cell = 0; cell < 8 && (await boardCount(page)) < limit; cell++) {
    const before = await boardCount(page);
    await page.waitForTimeout(400);
    const from = await unitSpot(page, name);
    if (!from) break;
    await drag(page, from, await cellSpot(page, cell % 4, Math.floor(cell / 4)));
    await page.waitForTimeout(300);
    if ((await boardCount(page)) > before) break;
  }
  return true;
}

async function heapMb(cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  return Math.round((usedSize / 1048576) * 10) / 10;
}

test("a seeded 7-round run, measured scenario by scenario", async ({ page }, testInfo) => {
  test.setTimeout(30 * 60_000);
  const phone = testInfo.project.name === "phone";
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: PHONE_THROTTLE });
  if (PROFILE) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  }
  await page.addInitScript(seeded, SEED);
  await page.addInitScript(instrument);
  await routes(page);

  const scenarios: Scenario[] = [];
  const snapshots: Snapshot[] = [];
  const outcomes: string[] = [];
  const record = async (name: string, round: number, action: () => Promise<void>) => {
    console.log(`${testInfo.project.name} round ${round}: ${name}`);
    if (PROFILE) await cdp.send("Profiler.start");
    await page.evaluate(() => window.stardPerf!.begin());
    await action();
    const recording: Recording = await page.evaluate(() => window.stardPerf!.end());
    const profile = PROFILE ? ((await cdp.send("Profiler.stop")).profile as CpuProfile) : null;
    // The raw profile too, which Chrome DevTools' Performance panel opens.
    if (profile) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(path.join(OUT, `${LABEL}-${testInfo.project.name}-${scenarios.length}-${name.replace(/\W+/g, "-")}.cpuprofile`), JSON.stringify(profile));
    }
    scenarios.push({ name, round, stats: summarize(recording), hot: profile ? hotFunctions(profile, DIST, 12) : [], callers: profile ? appCallers(profile, DIST, 12) : [] });
  };
  const snapshot = async (round: number, when: string) => snapshots.push({ round, when, heapMb: await heapMb(cdp), render: await page.evaluate(() => (window as unknown as Exposed).stardBoard.renderInfo()) });

  await page.goto("/run");
  await page.getByLabel("Your GitHub username").fill("abed");
  await page.getByRole("button", { name: "Start a run" }).click();
  await expect(page.getByLabel(/ cards on the board$/).locator("visible=true").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => "stardBoard" in window);
  await page.waitForTimeout(2_000);
  await snapshot(1, "shop");

  await record("shop idle", 1, () => page.waitForTimeout(IDLE));
  const ace = poolFor("abed").team[0].fullName;
  await record("drag", 1, async () => {
    // The ace carried round its half in a loop, then put back where it stood.
    const home = (await unitSpot(page, ace))!;
    const corners = [await cellSpot(page, 0, 0), await cellSpot(page, 3, 0), await cellSpot(page, 3, 1), await cellSpot(page, 0, 1)];
    await page.mouse.move(home.clientX, home.clientY);
    await page.mouse.down();
    const started = Date.now();
    for (let step = 0; Date.now() - started < DRAG; step++) {
      const from = corners[step % 4];
      const to = corners[(step + 1) % 4];
      for (let i = 1; i <= 20; i++) await page.mouse.move(from.clientX + ((to.clientX - from.clientX) * i) / 20, from.clientY + ((to.clientY - from.clientY) * i) / 20);
    }
    await page.mouse.move(home.clientX, home.clientY, { steps: 10 });
    await page.mouse.up();
  });

  const ended = page.getByText(/^Run (finished|over)$/);
  const boost = page.getByRole("dialog", { name: "Pick a boost" });
  const speed = page.getByRole("button", { name: /^[12]×$/ });
  for (let round = 1; round <= 7 && !(await ended.isVisible()); round++) {
    if (round > 1) await record("shop idle", round, () => page.waitForTimeout(1_500));
    for (let buys = 0; buys < 2 && (await buyAndPlace(page)); buys++);
    await page.waitForTimeout(500);
    await snapshot(round, "before fight");

    // Round 1 at 1x, round 2 at 2x, round 3 at 1x with a creature's panel open, the rest at 2x.
    const name = round === 1 ? "fight 1x" : round === 3 ? "fight-inspect 1x" : "fight 2x";
    await page.getByRole("button", { name: "Fight" }).locator("visible=true").click();
    const wanted = round === 1 || round === 3 ? "1×" : "2×";
    if ((await speed.textContent()) !== wanted) await speed.click();
    await record(name, round, async () => {
      if (round === 3) {
        await page.waitForTimeout(1_200);
        const at = await unitSpot(page, ace);
        if (at) await page.mouse.click(at.clientX, at.clientY);
      }
      await expect(page.getByRole("button", { name: "Continue" })).toBeVisible({ timeout: FIGHT_LIMIT });
    });
    await snapshot(round, "after fight");
    outcomes.push((await page.getByText(/^(Round \d+ (won|lost)|A draw)$/).textContent()) ?? "");

    await record("round result → next round", round, async () => {
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForTimeout(TRANSITION);
    });
    if (await boost.isVisible()) {
      await record("boost pick", round, async () => {
        await page.waitForTimeout(BOOST);
        await boost.getByRole("button").first().click();
        await page.waitForTimeout(BOOST);
      });
    }
  }
  await expect(ended).toBeVisible({ timeout: 30_000 });
  const rounds = snapshots.at(-1)!.round;
  await snapshot(rounds, "end");
  await record("new run", rounds, async () => {
    await page.getByRole("button", { name: "New run" }).click();
    await page.waitForTimeout(NEW_RUN);
  });
  await snapshot(1, "new run");

  mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${LABEL}-${testInfo.project.name}.json`);
  writeFileSync(file, JSON.stringify({ label: LABEL, device: testInfo.project.name, rounds, outcomes, scenarios, snapshots }, null, 2));
  console.log(`\n${testInfo.project.name}: ${rounds} rounds (${outcomes.join(", ")}) → ${file}`);
  console.table(scenarios.map(({ name, round, stats }) => ({ name, round, fps: stats.fps, p50: stats.interval.p50, p95: stats.interval.p95, p99: stats.interval.p99, missed: stats.over16, missed2: stats.over33, workP95: stats.work.p95, workMax: stats.work.max, gpuP95: stats.gpu.p95, commits: stats.commitsPerSecond, long: stats.longTasks })));
  console.table(snapshots.map(({ round, when, heapMb: heap, render }) => ({ round, when, heap, ...render })));
});
