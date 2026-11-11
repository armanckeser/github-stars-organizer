import { describe, expect, it } from "vitest";
import { plainFight } from "./plain-fight.ts";
import type { Card, Placed, Snapshot } from "./types.ts";

const card = (fullName: string, over: Partial<Card> = {}): Card => ({ fullName, type: "web", sets: [], rarity: 0, hp: 100, attack: 40, guard: 30, speed: 20, range: 1, ability: "none", shiny: false, ...over });
const team = (login: string, units: Placed[]): Snapshot => ({ login, round: 1, units, boosts: [] });
const at = (c: Card, col: number, row = 0): Placed => ({ card: c, col, row });

describe("plainFight", () => {
  it("gives the same events for the same teams and seed", () => {
    const a = team("a", [at(card("a/one"), 0), at(card("a/two"), 3, 1)]);
    const b = team("b", [at(card("b/one"), 1), at(card("b/two"), 2, 1)]);
    expect(plainFight(a, b, "seed")).toEqual(plainFight(a, b, "seed"));
  });

  it("walks cards into reach, and the side with a card left wins", () => {
    const events = plainFight(team("a", [at(card("a/strong", { attack: 400 }), 0, 1)]), team("b", [at(card("b/one"), 0, 1), at(card("b/two"), 3, 1)]), "seed");
    expect(events.at(-1)).toMatchObject({ kind: "end", winner: 0 });
    expect(events.filter((event) => event.kind === "faint")).toHaveLength(2);
    expect(events.some((event) => event.kind === "move")).toBe(true);
    expect(events.map((event) => event.t)).toEqual([...events.map((event) => event.t)].sort((x, y) => x - y));
  });

  it("lets a card with reach hit from the back row without walking", () => {
    const events = plainFight(team("a", [at(card("a/far", { range: 3, speed: 200 }), 0, 1)]), team("b", [at(card("b/still", { attack: 1, speed: 0 }), 3, 1)]), "seed");
    expect(events.find((event) => event.kind === "hit")).toMatchObject({ side: 0 });
    expect(events.some((event) => event.kind === "move" && event.side === 0)).toBe(false);
  });

  it("stops a fight nobody can finish and gives it to the side with more HP left", () => {
    const wall = { attack: 1, guard: 999, hp: 500 };
    const events = plainFight(team("a", [at(card("a/wall", { ...wall, hp: 600 }), 0)]), team("b", [at(card("b/wall", wall), 3)]), "seed");
    expect(events.at(-1)).toEqual({ t: 450, kind: "end", winner: 0 });
  });
});
