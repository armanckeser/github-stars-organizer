import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fighter } from "../../server/battle.ts";
import { defaultCharacter } from "../../server/character.ts";
import { OPPONENTS, type RunFighter } from "../../server/run/rules.ts";
import { rarityOf } from "../../server/run/stats.ts";
import type { Card } from "../../server/run/types.ts";
import type { RunPool } from "./battle.ts";
import { runResponse, type RunDeps } from "./run.ts";
import { teamResponse } from "./team.ts";

// A finished run's team: saved by the Worker after it replays the run, read back from
// the share link's token, and played against from "Beat this team". GitHub is faked
// at the boundary the Worker hands a run (`read`); a real fetch fails the test.

const KEY = "the-key-to-greendale";
const NOW = Date.parse("2026-11-11T12:00:00Z");
const PLAYER = "greendale";
const CHALLENGER = "city-college";
const POOL = 21;

const fighter = (fullName: string, over: Partial<Fighter>): RunFighter => {
  const base: Fighter = {
    fullName, description: null, language: "TypeScript", color: null, avatarUrl: null, stars: 50, contributors: 1, commits: 1, age: 1, health: 5,
    type: "web", weakness: null, resistance: null, level: 10, hp: 100, attack: 40, defense: 30, speed: 20,
    moves: [{ name: "Hot Reload", power: 1, damage: 20 }, { name: "Hotfix", power: 1.6, damage: 30 }], shiny: false, home: false, retired: false, perk: false, ...over,
  };
  const card: Card = { fullName, type: base.type, sets: [], rarity: rarityOf(base.stars), hp: base.hp, attack: base.attack, guard: base.defense, speed: base.speed, range: 1, ability: "none", shiny: false };
  return { ...base, card };
};

const poolOf = (login: string, over: Partial<Fighter>): RunPool => ({
  login, avatarUrl: null, source: "stars",
  character: { ...defaultCharacter(login), level: 1, since: null, followers: 0, ownStars: 0, custom: false },
  team: Array.from({ length: POOL }, (_, i) => fighter(`${login}/repo-${i}`, over)),
  facts: { readAt: new Date(NOW).toISOString(), character: null, ace: null, source: "stars", repos: [] },
});

const STRONG = { hp: 1000, attack: 400, defense: 100, speed: 100 };
const WEAK = { hp: 50, attack: 5, defense: 5, speed: 5 };

/** The player's cards are `strengths[login]`, everyone else's weak; every read is noted in `reads`. */
function depsFor(strengths: Record<string, Partial<Fighter>>, reads: string[] = []): RunDeps {
  return {
    key: KEY,
    now: NOW,
    read: async (login) => {
      reads.push(login);
      return poolOf(login, strengths[login] ?? WEAK);
    },
  };
}

type Saved = { token: string; error: string; team: { login: string; day: string; wins: number; losses: number; fighters: { fullName: string; card: { attack: number } }[]; rounds: { units: { fighter: number; col: number; row: number }[]; boosts: string[] }[] } };

/** A round where the team is just the ace, up close in the front row. */
const aceOnly = (login = PLAYER) => ({ units: [{ repo: `${login}/repo-0`, col: 1, row: 0 }], boosts: [] });

async function post(body: unknown, deps: RunDeps): Promise<{ status: number; body: Saved }> {
  const request = new Request("https://stars-demo.example/api/run/team", { method: "POST", body: JSON.stringify(body) });
  const response = await teamResponse(request, new URL(request.url), deps);
  return { status: response.status, body: (await response.json()) as Saved };
}

async function read(token: string, deps: RunDeps): Promise<{ status: number; body: Saved["team"] & { error: string } }> {
  const url = new URL(`https://stars-demo.example/api/run/team?t=${encodeURIComponent(token)}`);
  const response = await teamResponse(new Request(url), url, deps);
  return { status: response.status, body: (await response.json()) as Saved["team"] & { error: string } };
}

// A team link's token is deflated JSON in base64url; these open and close one the way an editing player would.
const piped = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
async function inflated(payload: string): Promise<string> {
  const bytes = Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(await piped(bytes, new DecompressionStream("deflate-raw")));
}
async function deflated(text: string): Promise<string> {
  const bytes = await piped(new TextEncoder().encode(text), new CompressionStream("deflate-raw"));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function savedStrongTeam(): Promise<string> {
  const { status, body } = await post({ login: PLAYER, rounds: Array.from({ length: 5 }, () => aceOnly()) }, depsFor({ [PLAYER]: STRONG }));
  expect(status).toBe(200);
  return body.token;
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("A team test reached the network.");
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/run/team", () => {
  it("saves a finished run's team with the record its fights give, and the link reads the same team back", async () => {
    // Regression guarded: a share link that doesn't reopen the team the run ended with.
    const token = await savedStrongTeam();
    const { status, body } = await read(token, depsFor({}));
    expect(status).toBe(200);
    expect(body).toMatchObject({ login: PLAYER, day: "2026-11-11", wins: 5, losses: 0 });
    expect(body.fighters.map((card) => card.fullName)).toEqual(["greendale/repo-0"]);
    expect(body.rounds).toHaveLength(5);
    expect(body.rounds[4]).toEqual({ units: [{ fighter: 0, col: 1, row: 0 }], boosts: [] });
  });

  it("freezes each card's numbers as the Worker read them for the day", async () => {
    // Regression guarded: a team link that read the repos again would change the team when the repos change.
    const token = await savedStrongTeam();
    const later = await read(token, depsFor({ [PLAYER]: { attack: 1 } }));
    expect(later.body.fighters[0].card.attack).toBe(400);
  });

  it("counts the record from the Worker's own replay of the fights", async () => {
    // Regression guarded: a weak team claiming five wins. A team of 1-HP cards loses rounds 1 to 3, so the run ends there.
    const weak = await post({ login: PLAYER, rounds: Array.from({ length: 5 }, () => aceOnly()) }, depsFor({ [PLAYER]: { hp: 1, attack: 1, defense: 1, speed: 1 } }));
    expect(weak.status).toBe(422);
    expect(weak.body.error).toBe("The run was over before round 4.");
  });

  it("refuses a card that isn't one of the player's cards for the day", async () => {
    // Regression guarded: a forged legendary on a shared team.
    const rounds = [...Array.from({ length: 4 }, () => aceOnly()), { units: [{ repo: "torvalds/linux", col: 1, row: 0 }], boosts: [] }];
    const { status, body } = await post({ login: PLAYER, rounds }, depsFor({ [PLAYER]: STRONG }));
    expect(status).toBe(422);
    expect(body.error).toBe("torvalds/linux isn't one of greendale's cards today.");
  });

  it("refuses more cards than the round's team may hold", async () => {
    const three = { units: [0, 1, 2].map((i) => ({ repo: `${PLAYER}/repo-${i}`, col: i, row: 0 })), boosts: [] };
    const { status, body } = await post({ login: PLAYER, rounds: [three, ...Array.from({ length: 4 }, () => aceOnly())] }, depsFor({ [PLAYER]: STRONG }));
    expect(status).toBe(422);
    expect(body.error).toBe("A team holds 1 to 2 cards in round 1.");
  });

  it("refuses a boost before the round that offers one", async () => {
    const boosted = { ...aceOnly(), boosts: ["head-start"] };
    const { status, body } = await post({ login: PLAYER, rounds: [aceOnly(), boosted, ...Array.from({ length: 3 }, () => aceOnly())] }, depsFor({ [PLAYER]: STRONG }));
    expect(status).toBe(422);
    expect(body.error).toBe("Round 2's boosts don't follow the run.");
  });

  it("refuses a run that isn't over", async () => {
    const { status, body } = await post({ login: PLAYER, rounds: [aceOnly(), aceOnly()] }, depsFor({ [PLAYER]: STRONG }));
    expect(status).toBe(422);
    expect(body.error).toBe("The run isn't over yet.");
  });
});

describe("GET /api/run/team", () => {
  it("refuses a team link whose team was edited", async () => {
    // Regression guarded: a player editing their shared team's numbers in the link.
    const token = await savedStrongTeam();
    const [payload, signature] = token.split(".");
    const team = JSON.parse(await inflated(payload)) as { wins: number };
    const edited = await deflated(JSON.stringify({ ...team, wins: 9 }));
    const { status, body } = await read(`${edited}.${signature}`, depsFor({}));
    expect(status).toBe(403);
    expect(body.error).toBe("This team link was changed, so the team can't be trusted.");
  });

  it("refuses a run's token passed off as a team link", async () => {
    const request = new Request("https://stars-demo.example/api/run/new", { method: "POST", body: JSON.stringify({ login: PLAYER }) });
    const run = (await (await runResponse("new", request, depsFor({}))).json()) as { token: string };
    const { status } = await read(run.token, depsFor({}));
    expect(status).toBe(403);
  });
});

describe("Beat this team", () => {
  it("plays a Worker run's rounds against the saved team, not a well-known account", async () => {
    // Regression guarded: "Beat this team" starting a run against the usual opponents.
    const token = await savedStrongTeam();
    const reads: string[] = [];
    const deps = depsFor({}, reads);
    const start = new Request("https://stars-demo.example/api/run/new", { method: "POST", body: JSON.stringify({ login: CHALLENGER, against: token }) });
    const started = (await (await runResponse("new", start, deps)).json()) as { token: string; run: { opponent: string } };
    expect(started.run.opponent).toBe(PLAYER);

    const fight = new Request("https://stars-demo.example/api/run/act", { method: "POST", body: JSON.stringify({ token: started.token, fight: true }) });
    const played = (await (await runResponse("act", fight, deps)).json()) as { run: { losses: number }; fight: { opponent: { login: string }; teams: [unknown, { units: { card: { attack: number } }[] }] } };
    expect(played.fight.opponent.login).toBe(PLAYER);
    expect(played.fight.teams[1].units.map((unit) => unit.card.attack)).toEqual([400]);
    expect(played.run.losses).toBe(1);
    expect(reads.filter((login) => OPPONENTS.includes(login))).toEqual([]);
  });

  it("saves a run played against a saved team by replaying it against that team", async () => {
    // Against the strong saved team, a weak challenger loses three rounds straight.
    const against = await savedStrongTeam();
    const reads: string[] = [];
    const rounds = Array.from({ length: 3 }, () => aceOnly(CHALLENGER));
    const { status, body } = await post({ login: CHALLENGER, rounds, against }, depsFor({}, reads));
    expect(status).toBe(200);
    expect(body.team).toMatchObject({ login: CHALLENGER, wins: 0, losses: 3 });
    expect(reads).toEqual([CHALLENGER]);
  });

  it("refuses a run whose saved team link was made up", async () => {
    const { status, body } = await post({ login: CHALLENGER, rounds: [aceOnly(CHALLENGER)], against: "made.up" }, depsFor({}));
    expect(status).toBe(403);
    expect(body.error).toBe("This team link was changed, so the team can't be trusted.");
  });
});
