import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RunPool } from "./battle.ts";
import { COLLECTOR, GUEST, HOST, NEWCOMER, fakeGitHub } from "./fake-github.test-helper.ts";
import { poolReply, type PoolDeps } from "./pool.ts";

// A run's pool is topped up with popular repos when the account's stars and repos
// can't fill it, so the shop is never short (worker/src/popular.ts). GitHub is faked at
// fetch; its search finds the fake repos in each `stars:` range.

const POOL_SIZE = 40;
const GUEST_OWN = ["greendale/paintball-assassin", "city-college/mascot", "greendale/human-being"];

/** The edge cache, in memory, keeping every entry. */
class MemoryCache {
  private readonly entries = new Map<string, Response>();

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(new Request(request).url)?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(new Request(request).url, response.clone());
  }
}

let cache: MemoryCache;
let pending: Promise<unknown>[];
let searches: number;
let searchFails: boolean;

beforeEach(() => {
  cache = new MemoryCache();
  pending = [];
  searches = 0;
  searchFails = false;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const { query } = JSON.parse(String(init?.body)) as { query: string };
    if (query.includes("search(")) {
      searches += 1;
      if (searchFails) return Response.json({ errors: [{ message: "Something went wrong" }] }, { status: 502 });
    }
    return fakeGitHub(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const deps = (): PoolDeps => ({ cache, now: Date.now(), waitUntil: (work) => void pending.push(work), origin: "https://stars-demo.example", token: "a-token" });

async function poolOf(login: string): Promise<{ status: number; pool: RunPool & { error?: string } }> {
  const response = await poolReply(login, deps());
  const pool = (await response.json()) as RunPool & { error?: string };
  await Promise.all(pending);
  return { status: response.status, pool };
}

const popularIn = (pool: RunPool) => pool.team.filter((fighter) => fighter.popular);
const countByPrice = (pool: RunPool) => popularIn(pool).reduce<Record<number, number>>((counts, fighter) => ({ ...counts, [fighter.card.rarity + 1]: (counts[fighter.card.rarity + 1] ?? 0) + 1 }), {});

describe("a run's pool, topped up with popular repos", () => {
  // Regression guarded: an account with three cards got a shop of two, and no reroll could add any.
  test("fills a short pool to 40 cards, cheapest band first, around the four bands", async () => {
    const { status, pool } = await poolOf(GUEST);

    expect(status).toBe(200);
    expect(pool.team).toHaveLength(POOL_SIZE);
    expect(pool.team.slice(0, 3).map((fighter) => fighter.popular ?? false)).toEqual([false, false, false]);
    expect(popularIn(pool)).toHaveLength(37);
    // 37 cards over four bands, one band after another from the cheapest: 10, 9, 9 and 9.
    expect(countByPrice(pool)).toEqual({ 2: 10, 3: 9, 4: 9, 5: 9 });
    expect(popularIn(pool).filter((fighter) => GUEST_OWN.includes(fighter.fullName))).toEqual([]);
    expect(new Set(pool.team.map((fighter) => fighter.fullName)).size).toBe(POOL_SIZE);
    expect(pool.team.map((fighter) => fighter.fullName)).toEqual(expect.arrayContaining(GUEST_OWN));
  });

  // Regression guarded: an account with no stars and no repos was refused ("has no public repos to play with").
  test("deals an account with no stars and no repos a pool of popular repos", async () => {
    const { status, pool } = await poolOf(NEWCOMER);

    expect(status).toBe(200);
    expect(pool.source).toBe("popular");
    expect(pool.team).toHaveLength(POOL_SIZE);
    expect(popularIn(pool)).toHaveLength(POOL_SIZE);
  });

  test("doesn't search GitHub when the stars fill the pool", async () => {
    const { pool } = await poolOf(COLLECTOR);

    expect(pool.team).toHaveLength(POOL_SIZE);
    expect(popularIn(pool)).toHaveLength(0);
    expect(searches).toBe(0);
  });

  // Regression guarded: every short pool would run the day's search again, against GitHub's rate limit.
  test("reads the day's popular repos once, for every player", async () => {
    await poolOf(GUEST);
    await poolOf(NEWCOMER);

    expect(searches).toBe(1);
  });

  test("still deals the account's own cards when the search fails, and tries again on the next pool", async () => {
    searchFails = true;
    const failed = await poolOf(GUEST);
    const refused = await poolOf(NEWCOMER);
    const searchesWhileDown = searches;
    searchFails = false;
    const recovered = await poolOf(HOST);

    expect(failed.status).toBe(200);
    expect(failed.pool.team.map((fighter) => fighter.fullName).sort()).toEqual([...GUEST_OWN].sort());
    expect(refused.status).toBe(404);
    expect(refused.pool.error).toBe(`${NEWCOMER} has no public repos to play with.`);
    // The failed list wasn't kept: each pool asked again.
    expect(searchesWhileDown).toBe(2);
    expect(recovered.pool.team).toHaveLength(POOL_SIZE);
  });
});
