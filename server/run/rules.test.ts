import { describe, expect, it } from "vitest";
import { fight } from "./fight.ts";
import { boardLimit, snapshot, type RunFighter, type Unit } from "./rules.ts";
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
