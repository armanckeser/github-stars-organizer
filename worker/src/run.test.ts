import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fighter } from "../../server/battle.ts";
import { defaultCharacter } from "../../server/character.ts";
import { OPPONENTS, type RunFighter } from "../../server/run/rules.ts";
import { rarityOf } from "../../server/run/stats.ts";
import type { Card } from "../../server/run/types.ts";
import type { RunPool } from "./battle.ts";
import { RunRefused, runResponse, type RunDeps } from "./run.ts";

// The run's routes, driven the way the Play screen drives them: JSON in, JSON out.
// GitHub is faked at the boundary the Worker hands a run (`read`); a real fetch fails the test.

const KEY = "the-key-to-greendale";
const NOW = Date.parse("2026-11-11T12:00:00Z");
const PLAYER = "greendale";
const POOL = 21;

const fighter = (fullName: string, over: Partial<Fighter> = {}): RunFighter => {
  const base: Fighter = {
    fullName, description: null, language: "TypeScript", color: null, avatarUrl: null, stars: 50, contributors: 1, commits: 1, age: 1, health: 5,
    type: "web", weakness: null, resistance: null, level: 10, hp: 100, attack: 40, defense: 30, speed: 20,
    moves: [{ name: "Hot Reload", power: 1, damage: 20 }, { name: "Hotfix", power: 1.6, damage: 30 }], shiny: false, home: false, retired: false, perk: false, ...over,
  };
  const card: Card = { fullName, type: base.type, sets: [], rarity: rarityOf(base.stars), hp: base.hp, attack: base.attack, guard: base.defense, speed: base.speed, range: 1, ability: "none", shiny: false };
  return { ...base, card };
};

const teamOf = (login: string, over: Partial<Fighter> = {}): RunPool => ({
  login, avatarUrl: null, source: "stars",
  character: { ...defaultCharacter(login), level: 1, since: null, followers: 0, ownStars: 0, custom: false },
  team: Array.from({ length: POOL }, (_, i) => fighter(`${login}/repo-${i}`, over)),
  facts: { readAt: new Date(NOW).toISOString(), character: null, ace: null, source: "stars", repos: [] },
});

const STRONG = { hp: 1000, attack: 400, defense: 100, speed: 100 };
const WEAK = { hp: 50, attack: 5, defense: 5, speed: 5 };

type Body = Record<string, unknown> & { token: string; error: string; run: Record<string, unknown> & { shop: ({ card: number; price: number } | null)[]; team: { card: number; col: number; row: number }[]; offer: string[]; boosts: string[] } };

function depsFor(player: Partial<Fighter>, others: Partial<Fighter>, reads: string[] = [], key = KEY): RunDeps {
  return {
    key,
    now: NOW,
    optedOut: async () => [],
    read: async (login) => {
      reads.push(login);
      if (login === "nobody-here") throw new RunRefused("No GitHub user called nobody-here.", 404);
      return teamOf(login, login === PLAYER ? player : others);
    },
  };
}

const commons = depsFor({}, {});

async function call(kind: "new" | "act", body: unknown, deps: RunDeps = commons, method = "POST"): Promise<{ status: number; body: Body }> {
  const request = new Request(`https://stars-demo.example/api/run/${kind}`, { method, body: method === "POST" ? JSON.stringify(body) : undefined });
  const response = await runResponse(kind, request, deps);
  return { status: response.status, body: (await response.json()) as Body };
}

async function started(deps: RunDeps = commons) {
  return (await call("new", { login: PLAYER }, deps)).body;
}

async function act(token: string, choice: Record<string, unknown>, deps: RunDeps = commons) {
  return call("act", { token, ...choice }, deps);
}

/** Fights until the run is done, taking the first boost whenever one is offered. */
async function playOut(deps: RunDeps) {
  let body = await started(deps);
  for (let round = 0; round < 10 && body.run.status === "playing"; round++) {
    const boost = body.run.offer[0];
    body = (await act(body.token, { fight: true, ...(boost ? { boost } : {}) }, deps)).body;
  }
  return body;
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("A run test reached the network.");
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/run/new", () => {
  it("starts with the ace on the team, 4 gold and a five-card shop without the ace", async () => {
    const body = await started();
    expect(body.run).toMatchObject({ login: PLAYER, day: "2026-11-11", status: "playing", round: 1, gold: 4, wins: 0, losses: 0, teamSize: 2, team: [{ card: 0, col: 1, row: 0 }], boosts: [], offer: [] });
    expect(body.run.shop).toHaveLength(5);
    expect(body.run.shop.every((slot) => slot !== null && slot.card !== 0 && slot.price === 1)).toBe(true);
    expect(body.ace).toMatchObject({ fullName: "greendale/repo-0" });
    expect(OPPONENTS).toContain(body.run.opponent);
  });

  it("reads the player's cards once and freezes their numbers into the run", async () => {
    // Regression guarded: a run that re-read GitHub each round would let a repo's numbers change mid-run.
    const reads: string[] = [];
    const deps = depsFor({ hp: 123 }, {}, reads);
    const body = await started(deps);
    await act(body.token, { buy: 0 }, deps);
    expect(reads).toEqual([PLAYER]);
    expect((body.run.pool as { hp: number }[])[0].hp).toBe(123);
  });

  it("refuses a username GitHub can't have", async () => {
    const { status, body } = await call("new", { login: "not a login" });
    expect(status).toBe(400);
    expect(body.error).toBe("A run needs a GitHub username.");
  });

  it("passes on the answer when the account doesn't exist", async () => {
    const { status, body } = await call("new", { login: "nobody-here" });
    expect(status).toBe(404);
    expect(body.error).toBe("No GitHub user called nobody-here.");
  });
});

describe("POST /api/run/act", () => {
  it("shows the same shop and opponent from the same token, and to a second run on the same day", async () => {
    const first = await started();
    const reload = (await act(first.token, {})).body;
    const again = await started();
    expect(reload.run.shop).toEqual(first.run.shop);
    expect(again.run.shop).toEqual(first.run.shop);
    expect(again.run.opponent).toBe(first.run.opponent);
  });

  it("refuses a token whose run was edited", async () => {
    // Regression guarded: a player giving themselves gold by editing the token.
    const { token } = await started();
    const [payload, signature] = token.split(".");
    const state = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { gold: number };
    const edited = btoa(JSON.stringify({ ...state, gold: 99 })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const { status, body } = await act(`${edited}.${signature}`, {});
    expect(status).toBe(403);
    expect(body.error).toBe("This run's token was changed, so the run can't go on.");
  });

  it("refuses a token signed with another key", async () => {
    const { token } = await started(depsFor({}, {}, [], "another-key"));
    expect((await act(token, {})).status).toBe(403);
  });

  it("buys a card into the next free front cell and empties its shop slot", async () => {
    const { token, run } = await started();
    const bought = run.shop[0]!.card;
    const { body } = await act(token, { buy: 0 });
    expect(body.run.gold).toBe(3);
    expect(body.run.shop[0]).toBeNull();
    expect(body.run.team).toEqual([{ card: 0, col: 1, row: 0 }, { card: bought, col: 2, row: 0 }]);
    const twice = await act(body.token, { buy: 0 });
    expect(twice.status).toBe(422);
    expect(twice.body.error).toBe("That shop slot is empty.");
  });

  it("refuses a buy past the round's team size", async () => {
    const { token } = await started();
    const one = (await act(token, { buy: 0 })).body;
    const two = await act(one.token, { buy: 1 });
    expect(two.status).toBe(422);
    expect(two.body.error).toBe("The team is full this round.");
  });

  it("refuses a card the gold can't pay for", async () => {
    // A legendary costs 5 and a run starts with 4.
    const deps = depsFor({ stars: 150_000 }, {});
    const { token, run } = await started(deps);
    expect(run.shop[0]!.price).toBe(5);
    const { status, body } = await act(token, { buy: 0 }, deps);
    expect(status).toBe(422);
    expect(body.error).toBe("Not enough gold.");
  });

  it("charges 1 gold for a new shop and refuses a reroll with no gold left", async () => {
    let body = await started();
    const first = body.run.shop;
    for (let gold = 3; gold >= 0; gold--) {
      body = (await act(body.token, { reroll: true })).body;
      expect(body.run.gold).toBe(gold);
    }
    expect(body.run.shop).not.toEqual(first);
    const broke = await act(body.token, { reroll: true });
    expect(broke.status).toBe(422);
    expect(broke.body.error).toBe("Not enough gold.");
  });

  it("gives a sold card's price back and keeps the last card on the team", async () => {
    const { token, run } = await started();
    const bought = run.shop[0]!.card;
    const one = (await act(token, { buy: 0 })).body;
    const sold = (await act(one.token, { sell: bought })).body;
    expect(sold.run.gold).toBe(4);
    expect(sold.run.team).toEqual([{ card: 0, col: 1, row: 0 }]);
    const last = await act(sold.token, { sell: 0 });
    expect(last.status).toBe(422);
    expect(last.body.error).toBe("A team needs at least one card.");
  });

  it("swaps two cards when one is placed on the other's cell, and refuses a cell off the half", async () => {
    const { token, run } = await started();
    const bought = run.shop[0]!.card;
    const one = (await act(token, { buy: 0 })).body;
    const moved = (await act(one.token, { place: { card: 0, col: 2, row: 0 } })).body;
    expect(moved.run.team).toEqual([{ card: 0, col: 2, row: 0 }, { card: bought, col: 1, row: 0 }]);
    const off = await act(moved.token, { place: { card: 0, col: 4, row: 0 } });
    expect(off.status).toBe(422);
    expect(off.body.error).toBe("That cell isn't on your half of the board.");
  });

  it("plays a won round against a listed account, pays 5 gold plus 1 for the win, and opens round 2", async () => {
    const reads: string[] = [];
    const deps = depsFor(STRONG, WEAK, reads);
    const { token } = await started(deps);
    const { body } = await act(token, { fight: true }, deps);
    const fight = body.fight as { winner: number; events: { kind: string }[]; opponent: { login: string }; teams: { units: unknown[] }[] };
    expect(fight.winner).toBe(0);
    expect(fight.events.at(-1)).toMatchObject({ kind: "end", winner: 0 });
    expect(OPPONENTS).toContain(fight.opponent.login);
    expect(reads).toEqual([PLAYER, fight.opponent.login]);
    // Round 1: the bot fields its ace and one card from its shop.
    expect(fight.teams[1].units).toHaveLength(2);
    expect(body.run).toMatchObject({ round: 2, gold: 10, wins: 1, losses: 0, teamSize: 3, results: [{ round: 1, opponent: fight.opponent.login, winner: 0 }] });
    expect(body.run.shop).toHaveLength(5);
    const replayed = (await act(token, { fight: true }, deps)).body;
    expect(replayed.fight).toEqual(body.fight);
  });

  it("offers three boosts after round 2 and holds the next fight until one is picked", async () => {
    const deps = depsFor(STRONG, WEAK);
    let body = await started(deps);
    body = (await act(body.token, { fight: true }, deps)).body;
    expect(body.run.offer).toEqual([]);
    body = (await act(body.token, { fight: true }, deps)).body;
    expect(body.run.offer).toHaveLength(3);

    const held = await act(body.token, { fight: true }, deps);
    expect(held.status).toBe(422);
    expect(held.body.error).toBe("Pick a boost first.");
    const unknown = await act(body.token, { boost: "free-gold", fight: true }, deps);
    expect(unknown.status).toBe(422);
    expect(unknown.body.error).toBe("That boost isn't on offer.");

    const picked = body.run.offer[1];
    const fought = (await act(body.token, { boost: picked, fight: true }, deps)).body;
    expect(fought.run.boosts).toEqual([picked]);
    expect((fought.fight as { teams: { boosts: string[] }[] }).teams[0].boosts).toEqual([picked]);
  });

  it("finishes the run at 5 wins and takes no more choices", async () => {
    const deps = depsFor(STRONG, WEAK);
    const body = await playOut(deps);
    expect(body.run).toMatchObject({ status: "finished", wins: 5, losses: 0, opponent: null, shop: [] });
    expect(body.run.boosts).toHaveLength(2);
    const after = await act(body.token, { fight: true }, deps);
    expect(after.status).toBe(422);
    expect(after.body.error).toBe("This run is over. Start a new one.");
  });

  it("ends the run at 3 losses", async () => {
    const body = await playOut(depsFor(WEAK, STRONG));
    expect(body.run).toMatchObject({ status: "over", wins: 0, losses: 3, round: 3 });
  });

  it.each([
    ["two choices at once", { buy: 0, reroll: true }, "One choice at a time."],
    ["a slot that isn't a number", { buy: "first" }, "buy has to be a whole number."],
    ["no token", { token: undefined, fight: true }, "A choice needs the run's token."],
    ["a token in the wrong shape", { token: "abc", fight: true }, "That isn't a run token."],
  ])("refuses %s with a 400", async (_, choice, error) => {
    const { token } = await started();
    const { status, body } = await call("act", { token, ...choice });
    expect(status).toBe(400);
    expect(body.error).toBe(error);
  });
});

describe("the run routes", () => {
  it("only take POST", async () => {
    expect((await call("new", null, commons, "GET")).status).toBe(405);
  });

  it("refuse a body that isn't a JSON object", async () => {
    const response = await runResponse("new", new Request("https://stars-demo.example/api/run/new", { method: "POST", body: "[1]" }), commons);
    expect(response.status).toBe(400);
  });

  it("answer 503 when the server has no BATTLE_KEY", async () => {
    const { status, body } = await call("new", { login: PLAYER }, { ...commons, key: undefined });
    expect(status).toBe(503);
    expect(body.error).toBe("Runs aren't set up on this server yet.");
  });
});
