import { describe, expect, it } from "vitest";
import { fight } from "./fight.ts";
import { NEW_TALLY, boardLimit, costOf, countRound, snapshot, type RunFighter, type Unit } from "./rules.ts";
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
