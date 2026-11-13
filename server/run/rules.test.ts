import { describe, expect, it } from "vitest";
import { fight } from "./fight.ts";
import { NEW_TALLY, boardLimit, costOf, countRound, newRunSeed, opponentUnits, shopFor, snapshot, type RunFighter, type Unit } from "./rules.ts";
import { card, cityCollege } from "./testbed.ts";

const unit = (name: string, col: number): Unit => ({ fighter: { fullName: `greendale/${name}`, card: card(`greendale/${name}`, { hp: 600 }) } as RunFighter, col, row: 0 });

describe("snapshot", () => {
  // Regression guarded: the Play screen sent no boosts, so a picked boost never fired.
  it("carries the picked boosts into the fight", () => {
    const team = [unit("troy", 1), unit("abed", 2)];
    const events = fight(snapshot("greendale", 3, team, ["head-start"]), cityCollege, "greendale");

    expect(snapshot("greendale", 3, team, ["head-start"]).boosts).toEqual(["head-start"]);
    expect(events.some((event) => event.kind === "ability" && event.side === 0 && event.ability === "boost:head-start")).toBe(true);
  });

  it("carries none when none were picked", () => {
    const events = fight(snapshot("greendale", 3, [unit("troy", 1)]), cityCollege, "greendale");

    expect(events.some((event) => event.kind === "ability" && event.side === 0 && event.ability.startsWith("boost:"))).toBe(false);
  });
});

describe("shopFor", () => {
  const pool = { login: "greendale", team: ["dreamatorium", ...Array.from({ length: 39 }, (_, i) => `study-room-${i}`)].map((name) => ({ fullName: `greendale/${name}` })) };
  const names = (seed: string) => shopFor(pool, [], 1, 0, seed).map((card) => card.fullName);

  // Regression guarded: every run on one day dealt the same first shop, because it was seeded with the date.
  it("deals two run seeds two first shops from the same pool", () => {
    expect(names("greendale-run-1")).not.toEqual(names("greendale-run-2"));
  });

  it("deals the same shop for the same run seed, round and reroll, without the ace", () => {
    expect(names("greendale-run-1")).toEqual(names("greendale-run-1"));
    expect(names("greendale-run-1")).toHaveLength(5);
    expect(names("greendale-run-1")).not.toContain("greendale/dreamatorium");
  });
});

describe("opponentUnits", () => {
  const fighter = (name: string): RunFighter => ({ fullName: `greendale/${name}`, defense: 100, card: card(`greendale/${name}`) }) as RunFighter;
  const pool = { login: "greendale", team: ["dreamatorium", ...Array.from({ length: 39 }, (_, i) => `study-room-${i}`)].map(fighter) };
  const fielded = (round: number) => opponentUnits(pool, round, "greendale-run-1").map((unit) => unit.fighter.fullName);

  // Regression guarded: round 1's opponent fielded its ace and a free card from its shop,
  // so a player's ace and one bought card lost round 1 more often than not.
  it("fields only the ace in round 1", () => {
    expect(fielded(1)).toEqual(["greendale/dreamatorium"]);
  });

  it.each([
    [2, 3],
    [3, 4],
    [4, 5],
    [7, 5],
  ])("fields a full team of round %i: %i cards, the ace among them", (round, size) => {
    expect(fielded(round)).toHaveLength(size);
    expect(fielded(round)).toContain("greendale/dreamatorium");
  });

  it("fields the ace alone in a later round when the account has no other card", () => {
    expect(opponentUnits({ login: "greendale", team: [fighter("dreamatorium")] }, 3, "greendale-run-1").map((unit) => unit.fighter.fullName)).toEqual(["greendale/dreamatorium"]);
  });
});

describe("newRunSeed", () => {
  it("gives a new 32-character hex seed each time", () => {
    const seeds = Array.from({ length: 20 }, () => newRunSeed());
    expect(new Set(seeds).size).toBe(20);
    expect(seeds.every((seed) => /^[0-9a-f]{32}$/.test(seed))).toBe(true);
  });
});

describe("boardLimit", () => {
  // Regression guarded: bought slots must lift the round's limit, and never past 7.
  it.each([
    [1, 0, 2],
    [1, 2, 4],
    [4, 0, 5],
    [4, 2, 7],
    [6, 5, 7],
  ])("round %i with %i bought slots holds %i cards", (round, bought, limit) => {
    expect(boardLimit(round, bought)).toBe(limit);
  });
});

describe("countRound", () => {
  // Regression guarded: Continue pressed again after the next round failed to open counted the round twice.
  it("counts a won round once, when Continue is pressed twice for it", () => {
    const first = countRound(NEW_TALLY, 1, 0);
    const again = countRound(first.tally, 1, 0);
    expect(first).toEqual({ tally: { wins: 1, losses: 0, counted: 1 }, earned: 6 });
    expect(again).toEqual({ tally: { wins: 1, losses: 0, counted: 1 }, earned: 0 });
  });

  it.each([
    ["a loss", 1, { wins: 0, losses: 1, counted: 1 }, 5],
    ["a draw", null, { wins: 0, losses: 0, counted: 1 }, 5],
  ] as const)("counts %s for its side and earns the round's gold", (_, winner, tally, earned) => {
    expect(countRound(NEW_TALLY, 1, winner)).toEqual({ tally, earned });
  });

  it("earns no gold for the round that ends the run, when it is the third loss", () => {
    expect(countRound({ wins: 2, losses: 2, counted: 4 }, 5, 1)).toEqual({ tally: { wins: 2, losses: 3, counted: 5 }, earned: 0 });
  });
});

describe("costOf", () => {
  // Regression guarded: the Play screen priced a card by its stars while the Worker priced it
  // by its card, so a 69-star creator card showed 1 gold and the Worker charged 5.
  it("charges a card's rarity, whatever its stars", () => {
    const creator = { fullName: "armanckeser/github-stars-organizer", stars: 69, card: card("armanckeser/github-stars-organizer", { rarity: 4 }) } as RunFighter;
    expect(costOf(creator)).toBe(5);
  });

  it("charges 1 gold for a common", () => {
    const common = { fullName: "greendale/troy", stars: 5_000_000, card: card("greendale/troy", { rarity: 0 }) } as RunFighter;
    expect(costOf(common)).toBe(1);
  });
});
