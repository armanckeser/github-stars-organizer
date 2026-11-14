import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOST, RIVAL, fakeGitHubWhere } from "../../worker/src/fake-github.test-helper.ts";
import { runReads } from "./run-reads.ts";

// The npx app's run reads: the hosted Worker's code, with the player's own token.

let tokens: string[];

beforeEach(() => {
  tokens = [];
  const github = fakeGitHubWhere({ noPlay: [RIVAL] });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    tokens.push(new Headers(init?.headers).get("Authorization") ?? "");
    return github.fetch(input, init);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("a run from the npx app", () => {
  // Regression guarded: the npx app read its cards from the hosted Worker, so it spent
  // the Worker's GitHub points and stopped when the Worker said it was busy.
  it("reads the player's cards here, with their own token", async () => {
    const reply = await runReads("their-token").request(`/pool?login=${HOST}`);
    const pool = (await reply.json()) as { login: string; team: unknown[] };

    expect(reply.status).toBe(200);
    expect(pool.team.length).toBeGreaterThan(0);
    expect(tokens.length).toBeGreaterThan(0);
    expect(new Set(tokens)).toEqual(new Set(["bearer their-token"]));
  });

  it("doesn't play an account that asked to be left out", async () => {
    const api = runReads("their-token");

    expect(await (await api.request("/opponents")).json()).toEqual({ optedOut: [RIVAL] });
    expect((await api.request(`/pool?login=${RIVAL}&for=${HOST}`)).status).toBe(403);
  });
});
