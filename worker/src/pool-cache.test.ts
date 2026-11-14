import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FactsNode, RunPool } from "./battle.ts";
import { WRITTEN_AT, readThrough } from "./edge-cache.ts";
import { GUEST, HOST, RIVAL, fakeGitHub, unreachable } from "./fake-github.test-helper.ts";
import { RESERVE, askGitHub } from "./github-budget.ts";
import { cachedPool, poolReply, type PoolDeps } from "./pool.ts";
import type { FactsStore, KeptFacts } from "./repo-facts.ts";
import { runResponse } from "./run.ts";

// How long the edge keeps an account's pool, through the one way the Worker reads it
// (GET /api/run/pool and a run's referee both call worker/src/pool.ts). GitHub is faked at fetch, the clock at Date, and the edge's Cache API by a
// map that drops an entry once its Cache-Control max-age has passed, as the edge does.

const ORIGIN = "https://stars-demo.example";
const START = Date.parse("2026-11-11T12:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Stored = { body: ArrayBuffer; status: number; headers: [string, string][]; storedAt: number };

class EdgeCacheFake {
  readonly entries = new Map<string, Stored>();

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const stored = this.entries.get(new Request(request).url);
    if (!stored) return undefined;
    const maxAge = Number(/max-age=(\d+)/.exec(new Headers(stored.headers).get("Cache-Control") ?? "")?.[1] ?? 0);
    if (Date.now() - stored.storedAt >= maxAge * 1000) return undefined;
    return new Response(stored.body.slice(0), { status: stored.status, headers: stored.headers });
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    const headers = [...response.headers.entries()];
    this.entries.set(new Request(request).url, { body: await response.arrayBuffer(), status: response.status, headers, storedAt: Date.now() });
  }
}

let edge: EdgeCacheFake;
let pending: Promise<unknown>[];
let userReads: string[];

const KEY = "the-key-to-greendale";

const poolDeps = (): PoolDeps => ({ cache: edge, now: Date.now(), waitUntil: (work) => void pending.push(work), origin: ORIGIN, token: "a-token" });

/** A GitHub that answers with `answer` and notes each account it was asked about. */
function github(answer: typeof fetch) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const { query } = JSON.parse(String(init?.body)) as { query: string };
    const login = /user\(login: "([^"]+)"\)/.exec(query)?.[1];
    if (login) userReads.push(login);
    return answer(input, init);
  });
}

const nobodyThere: typeof fetch = async () => Response.json({ data: { user: null } });

async function getPool(login: string, at: number): Promise<{ status: number; pool: RunPool }> {
  vi.setSystemTime(at);
  const response = await poolReply(login, poolDeps());
  return { status: response.status, pool: (await response.json()) as RunPool };
}

async function settled() {
  await Promise.all(pending.splice(0));
}

beforeEach(() => {
  edge = new EdgeCacheFake();
  pending = [];
  userReads = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubGlobal("caches", { default: edge });
  github(fakeGitHub);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("an opponent's pool at the edge", () => {
  // Regression guarded: every opponent's pool expired after an hour, so most runs'
  // next team waited 5 to 10 s on GitHub.
  it("is not read from GitHub again when read within 7 days", async () => {
    await getPool(RIVAL, START);
    await settled();
    const again = await getPool(RIVAL, START + 7 * DAY - MINUTE);
    await settled();

    expect(again.status).toBe(200);
    expect(again.pool.facts.readAt).toBe("2026-11-11T12:00:00.000Z");
    expect(userReads).toEqual([RIVAL]);
  });

  // Regression guarded: a run's own reads and GET /api/run/pool kept separate cache
  // rules, so a run read GitHub again for a pool the Play screen had just been sent.
  it("is the one a new run starts from, when GET /api/run/pool stored it 2 days earlier", async () => {
    await getPool(RIVAL, START);
    await settled();

    vi.setSystemTime(START + 2 * DAY);
    const request = new Request(`${ORIGIN}/api/run/new`, { method: "POST", body: JSON.stringify({ login: RIVAL }) });
    const response = await runResponse("new", request, { key: KEY, read: (login) => cachedPool(login, poolDeps()), optedOut: async () => [], now: Date.now(), newSeed: () => "greendale-run-1" });
    await settled();

    expect(response.status).toBe(200);
    expect(userReads).toEqual([RIVAL]);
  });

  // Regression guarded: a pool past its fresh week made the visitor wait on GitHub
  // instead of getting the old pool at once and a new one read behind it.
  it("is sent at once and replaced behind the reply when older than 7 days", async () => {
    await getPool(RIVAL, START);
    await settled();

    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    github(async (input, init) => {
      await gate;
      return fakeGitHub(input, init);
    });
    const stale = await getPool(RIVAL, START + 8 * DAY);
    expect(stale.status).toBe(200);
    expect(stale.pool.facts.readAt).toBe("2026-11-11T12:00:00.000Z");

    release();
    await settled();
    const refreshed = await getPool(RIVAL, START + 8 * DAY + MINUTE);

    expect(refreshed.pool.facts.readAt).toBe("2026-11-19T12:00:00.000Z");
    expect(userReads).toEqual([RIVAL, RIVAL]);
  });

  // Regression guarded: a refresh that GitHub refused (404) overwrote a good pool, so
  // every run against that opponent failed until the error entry expired. The 502 case
  // held before this change too: a no-store reply was never stored.
  it.each([
    ["GitHub is unreachable (502, no-store)", unreachable],
    ["GitHub says the account is gone (404)", nobodyThere],
  ])("is kept when the refresh fails: %s", async (_why, failure) => {
    await getPool(RIVAL, START);
    await settled();

    github(failure);
    await getPool(RIVAL, START + 8 * DAY);
    await settled();
    const after = await getPool(RIVAL, START + 8 * DAY + MINUTE);

    expect(after.status).toBe(200);
    expect(after.pool.facts.readAt).toBe("2026-11-11T12:00:00.000Z");
  });

  // Regression guarded: the browser was told to keep a pool as long as the edge did,
  // so a returning visitor never saw a refreshed one.
  it("is held by the browser at most 1 hour when the edge keeps it for 7 days", async () => {
    await getPool(RIVAL, START);
    await settled();
    vi.setSystemTime(START + DAY);
    const response = await poolReply(RIVAL, poolDeps());

    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });
});

describe("a player's own pool at the edge", () => {
  // Regression guarded: the opponents' long cache also held a player's own stars, so
  // a repo starred this morning stayed out of their runs for a week.
  it("is read from GitHub again when older than 1 hour", async () => {
    await getPool(HOST, START);
    await settled();
    await getPool(HOST, START + HOUR - MINUTE);
    await settled();
    const later = await getPool(HOST, START + HOUR + MINUTE);

    expect(later.pool.facts.readAt).toBe("2026-11-11T13:01:00.000Z");
    expect(userReads).toEqual([HOST, HOST]);
  });
});

describe("an entry stored before entries carried their time", () => {
  // Regression guarded: an entry written by the previous deploy (no time header) was
  // thrown away, so the first visitor after a deploy waited on GitHub.
  it("is served and read again", async () => {
    vi.setSystemTime(START);
    const key = new Request(`${ORIGIN}/thing`);
    await edge.put(key, new Response("old", { headers: { "Cache-Control": "public, max-age=3600" } }));
    const deps = { cache: edge, now: START, waitUntil: (work: Promise<unknown>) => void pending.push(work) };

    const served = await readThrough(key, async () => new Response("new", { headers: { "Cache-Control": "public, max-age=3600" } }), { fresh: HOUR, keep: DAY }, deps);
    expect(await served.text()).toBe("old");
    await settled();
    const stored = await edge.match(key);

    expect(await stored?.text()).toBe("new");
    expect(stored?.headers.get(WRITTEN_AT)).toBe(String(START));
  });
});

describe("repo facts kept for every pool", () => {
  // A Map in place of the D1 table, keyed as the table is: owner/repo in lower case.
  function mapStore(kept = new Map<string, KeptFacts>()): FactsStore {
    return {
      read: async (names) => names.flatMap((name) => kept.get(name.toLowerCase()) ?? []),
      keep: async (nodes: FactsNode[], readAt) => void nodes.forEach((node) => kept.set(node.nameWithOwner.toLowerCase(), { node, readAt })),
    };
  }

  // How many repos GitHub was asked the facts of: each is one ` r<i>: repository(owner:` in a query.
  let reposAsked: number;
  beforeEach(() => {
    reposAsked = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      reposAsked += (String(JSON.parse(String(init?.body)).query).match(/ r\d+: repository\(owner:/g) ?? []).length;
      return fakeGitHub(input, init);
    });
  });

  // Another data center has its own edge cache, so it reads the whole pool again.
  async function readIn(dataCenter: EdgeCacheFake, login: string, at: number, facts: FactsStore) {
    vi.setSystemTime(at);
    const response = await poolReply(login, { ...poolDeps(), cache: dataCenter, facts });
    await settled();
    return { status: response.status, pool: (await response.json()) as RunPool };
  }

  // Regression guarded: every data center, and every player sharing a repo, asked
  // GitHub for the same repo's facts again, at a point of the shared budget per 4 repos.
  it("are not asked of GitHub again by another data center later that day", async () => {
    const facts = mapStore();
    await readIn(new EdgeCacheFake(), HOST, START, facts);
    const first = reposAsked;
    const again = await readIn(new EdgeCacheFake(), HOST, START + 6 * HOUR, facts);

    expect(first).toBeGreaterThan(0);
    expect(again.status).toBe(200);
    expect(again.pool.team.length).toBeGreaterThan(0);
    expect(reposAsked).toBe(first);
  });

  it("are asked of GitHub again once a day old", async () => {
    const facts = mapStore();
    await readIn(new EdgeCacheFake(), HOST, START, facts);
    const first = reposAsked;
    await readIn(new EdgeCacheFake(), HOST, START + DAY + MINUTE, facts);

    expect(reposAsked).toBe(2 * first);
  });

  it("are read from GitHub when the table can't be read or written", async () => {
    const broken: FactsStore = { read: () => Promise.reject(new Error("D1 is down")), keep: () => Promise.reject(new Error("D1 is down")) };
    const read = await readIn(new EdgeCacheFake(), HOST, START, broken);

    expect(read.status).toBe(200);
    expect(read.pool.team.length).toBeGreaterThan(0);
  });
});

describe("a new player's pool when GitHub's hourly points run low", () => {
  const RESET = START + 25 * MINUTE;

  /** fakeGitHub, with each reply saying `points` are left until RESET. */
  const withPoints =
    (points: number, answer: typeof fetch = fakeGitHub): typeof fetch =>
    async (input, init) => {
      const reply = await answer(input, init);
      const headers = new Headers(reply.headers);
      headers.set("x-ratelimit-remaining", String(points));
      headers.set("x-ratelimit-reset", String(RESET / 1000));
      return new Response(reply.body, { status: reply.status, headers });
    };

  // Each isolate remembers the last reply's points, so give the next test a full hour.
  afterEach(async () => {
    github(withPoints(5000));
    await askGitHub("a-token", { query: "" });
  });

  // Regression guarded: the Worker read new players until GitHub refused every query,
  // and then the cards in people's READMEs broke along with the game.
  it("isn't read, and says when to come back, once fewer than the reserve are left", async () => {
    github(withPoints(RESERVE - 1));
    await getPool(HOST, START);
    await settled();

    const guest = await getPool(GUEST, START);

    expect(guest.status).toBe(503);
    expect((guest.pool as unknown as { error: string }).error).toContain("Try again in 25 minutes");
    expect(userReads).toEqual([HOST]);
  });

  it("is still sent to a player read before then", async () => {
    github(withPoints(RESERVE - 1));
    await getPool(HOST, START);
    await settled();

    expect((await getPool(HOST, START + MINUTE)).status).toBe(200);
  });

  it("is read again once the hour resets", async () => {
    github(withPoints(RESERVE - 1));
    await getPool(HOST, START);
    await settled();

    expect((await getPool(GUEST, RESET + MINUTE)).status).toBe(200);
  });

  // Regression guarded: a read GitHub refused for its rate limit said GitHub didn't answer.
  it("says busy when GitHub refuses the read for its rate limit", async () => {
    github(withPoints(0, async () => Response.json({ errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] })));

    const guest = await getPool(GUEST, START);

    expect(guest.status).toBe(503);
    expect((guest.pool as unknown as { error: string }).error).toContain("Stard is busy");
  });
});
