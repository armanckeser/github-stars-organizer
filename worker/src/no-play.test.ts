import { afterEach, describe, expect, test, vi } from "vitest";
import { OPPONENTS } from "../../server/run/rules.ts";
import { HOST, fakeGitHubWhere } from "./fake-github.test-helper.ts";
import { callWorker, memoryCaches } from "./worker-host.test-helper.ts";

// An account with a `stard` repo holding a `no-play` file (OPPONENTS.md) is never a
// run's opponent, and its stars aren't read for someone else's run. GitHub is faked at
// the network; the edge cache is in memory.

// The share picture's assets are bundled by wrangler and can't load in Node; nothing here draws a picture.
vi.mock("@resvg/resvg-wasm/index_bg.wasm", () => ({ default: new Uint8Array() }));
vi.mock("./SpaceGrotesk-Bold.ttf", () => ({ default: new ArrayBuffer(0) }));

const LEFT_OUT = "torvalds";
const ALL_BUT_SIMONW = OPPONENTS.filter((login) => login !== "simonw");
const MOST_ROUNDS = 7;

function gitHubWhere(noPlay: readonly string[]) {
  const github = fakeGitHubWhere({ noPlay });
  vi.stubGlobal("fetch", github.fetch);
  vi.stubGlobal("caches", memoryCaches());
  return github;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/run/pool", () => {
  test("refuses an opted-out account's stars when the read is for someone else's run", async () => {
    // Regression guarded: the Play screen reads each opponent's pool from the browser, so
    // an opted-out account's stars were read and played against anyway.
    const github = gitHubWhere([LEFT_OUT]);
    const { status, body } = await callWorker(`/api/run/pool?login=${LEFT_OUT}&for=${HOST}`);
    expect(status).toBe(403);
    expect(body.error).toBe("torvalds has asked not to be played against.");
    expect(github.usersRead).toEqual([]);
  });

  test("still reads an opted-out account's stars for the account's own run", async () => {
    gitHubWhere([LEFT_OUT]);
    const own = await callWorker(`/api/run/pool?login=${LEFT_OUT}`);
    const named = await callWorker(`/api/run/pool?login=${LEFT_OUT}&for=Torvalds`);
    expect(own.status).toBe(200);
    expect(own.body.login).toBe(LEFT_OUT);
    expect(named.status).toBe(200);
  });

  test("never hands a pool cached from the account's own run to someone else's run", async () => {
    // Regression guarded: the check sitting behind the pool's cache, so one read of
    // the account's own pool would then be served to everyone for an hour.
    gitHubWhere([LEFT_OUT]);
    expect((await callWorker(`/api/run/pool?login=${LEFT_OUT}`)).status).toBe(200);
    expect((await callWorker(`/api/run/pool?login=${LEFT_OUT}&for=${HOST}`)).status).toBe(403);
  });

  test("reads an account that hasn't opted out for anyone's run", async () => {
    const github = gitHubWhere([LEFT_OUT]);
    const { status, body } = await callWorker(`/api/run/pool?login=simonw&for=${HOST}`);
    expect(status).toBe(200);
    expect(body.login).toBe("simonw");
    expect(github.usersRead).toEqual(["simonw"]);
  });
});

describe("GET /api/run/opponents", () => {
  test("lists the opponents that opted out, and only those", async () => {
    gitHubWhere([LEFT_OUT, "study-group-pierce"]);
    const { status, body } = await callWorker("/api/run/opponents");
    expect(status).toBe(200);
    expect(body).toEqual({ optedOut: ["torvalds"] });
  });
});

describe("a run on the Worker", () => {
  test("plays only accounts that haven't opted out, and never reads the others", async () => {
    // Regression guarded: the Worker picking a round's opponent from the whole list
    // and reading that account's stars to draft its team.
    const github = gitHubWhere(ALL_BUT_SIMONW);
    let { body } = await callWorker("/api/run/new", { login: HOST });
    let run = body.run as { status: string; opponent: string | null; offer: string[]; results: { opponent: string }[] };
    expect(run.opponent).toBe("simonw");
    for (let round = 0; round < MOST_ROUNDS && run.status === "playing"; round++) {
      ({ body } = await callWorker("/api/run/act", { token: body.token, fight: true, ...(run.offer[0] ? { boost: run.offer[0] } : {}) }));
      expect((body.fight as { opponent: { login: string } }).opponent.login).toBe("simonw");
      run = body.run as typeof run;
    }
    expect(run.status).not.toBe("playing");
    expect(new Set(run.results.map((result) => result.opponent))).toEqual(new Set(["simonw"]));
    expect(new Set(github.usersRead)).toEqual(new Set([HOST, "simonw"]));
  });

  test("refuses to start when every opponent opted out", async () => {
    gitHubWhere(OPPONENTS);
    const { status, body } = await callWorker("/api/run/new", { login: HOST });
    expect(status).toBe(503);
    expect(body.error).toBe("No opponents are free to play right now. Try again later.");
  });
});
