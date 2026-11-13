import { describe, expect, it } from "vitest";
import { fight } from "./fight.ts";
import { NEW_TALLY, boardLimit, costOf, countRound, newRunSeed, opponentUnits, shopFor, snapshot, type RunFighter, type Unit } from "./rules.ts";
import { card, cityCollege } from "./testbed.ts";
import { roleOf } from "./stats.ts";
import type { Card } from "./types.ts";

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
  const fighter = (name: string, over: Partial<Card> = {}): RunFighter => ({ fullName: `greendale/${name}`, defense: over.guard ?? 100, card: card(`greendale/${name}`, over) }) as RunFighter;
  // A legendary ace with 460 points, as BUDGET gives one, and 39 commons at the common's 400.
  const legendary = { rarity: 4, hp: 230, attack: 115, guard: 115, speed: 115 } as const;
  const teamWith = (ace: Partial<Card>) => ({ login: "greendale", team: [fighter("dreamatorium", ace), ...Array.from({ length: 39 }, (_, i) => fighter(`study-room-${i}`))] });
  const unitsAt = (round: number, ace: Partial<Card> = legendary) => opponentUnits(teamWith(ace), round, "greendale-run-1");
  const numbers = (round: number) => unitsAt(round).map(({ fighter: { card: { fullName, hp, attack, guard, speed } } }) => ({ fullName, hp, attack, guard, speed }));
  const aceRole = (round: number, ace: Partial<Card>) => roleOf(unitsAt(round, ace).find((unit) => unit.fighter.fullName === "greendale/dreamatorium")!.fighter.card);

  // Regression guarded: round 1's opponent fielded its ace and free pick at full strength,
  // so a player's ace and one card bought with the starting gold lost round 1 more often than not.
  it("fields the ace and one card in round 1, the ace with 350 stat points", () => {
    expect(numbers(1)).toHaveLength(2);
    expect(numbers(1)).toContainEqual({ fullName: "greendale/dreamatorium", hp: 206, attack: 88, guard: 88, speed: 88 });
  });

  it("shrinks a common's 400 points to 350 in round 1, its HP above the floor only", () => {
    expect(numbers(1).find((unit) => unit.fullName !== "greendale/dreamatorium")).toMatchObject({ hp: 148, attack: 88, guard: 88, speed: 88 });
  });

  // Regression guarded: shrinking all of a card's HP turned a bruiser ace into an assassin in
  // round 1, so it wore another body on the board and another role on its card face; and
  // rounding the shrunk stats tipped a card sitting on a role's cut into the next role.
  it.each([
    ["kentcdodds' rare ace", { rarity: 2, hp: 155, attack: 120, guard: 101, speed: 110 }, "bruiser"],
    ["an uncommon on the assassin cut", { rarity: 1, hp: 152, attack: 116, guard: 102, speed: 109 }, "assassin"],
    ["an uncommon on the tank cut", { rarity: 1, hp: 152, attack: 110, guard: 111, speed: 107 }, "bruiser"],
  ] as const)("keeps %s in its role in round 1", (_, ace, role) => {
    expect(aceRole(2, ace)).toBe(role);
    expect(aceRole(1, ace)).toBe(role);
  });

  it.each([2, 3, 7])("fields the ace at its own numbers in round %i", (round) => {
    expect(numbers(round)).toContainEqual({ fullName: "greendale/dreamatorium", hp: 230, attack: 115, guard: 115, speed: 115 });
  });

  it.each([
    [2, 3],
    [3, 4],
    [4, 5],
    [7, 5],
  ])("fields a full team in round %i: %i cards", (round, size) => {
    expect(numbers(round)).toHaveLength(size);
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
