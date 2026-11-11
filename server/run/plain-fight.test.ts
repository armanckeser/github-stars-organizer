import { describe, expect, it } from "vitest";
import { plainFight } from "./plain-fight.ts";
import type { Card, Snapshot } from "./types.ts";

const card = (fullName: string, over: Partial<Card> = {}): Card => ({ fullName, type: "web", sets: [], rarity: 0, hp: 100, attack: 40, guard: 30, speed: 20, ability: "none", shiny: false, ...over });
const team = (login: string, cards: Card[]): Snapshot => ({ login, round: 1, cards, boosts: [] });

describe("plainFight", () => {
  it("gives the same events for the same teams and seed", () => {
    const a = team("a", [card("a/one"), card("a/two")]);
    const b = team("b", [card("b/one"), card("b/two")]);
    expect(plainFight(a, b, "seed")).toEqual(plainFight(a, b, "seed"));
  });

  it("ends with the side that still has a card as the winner", () => {
    const events = plainFight(team("a", [card("a/strong", { attack: 400 })]), team("b", [card("b/one"), card("b/two")]), "seed");
    expect(events.at(-1)).toEqual({ kind: "end", winner: 0 });
    expect(events.filter((event) => event.kind === "faint")).toHaveLength(2);
  });

  it("stops a fight nobody can finish and gives it to the side with more HP left", () => {
    const wall = { attack: 1, guard: 999, hp: 500 };
    const events = plainFight(team("a", [card("a/wall", { ...wall, hp: 600 })]), team("b", [card("b/wall", wall)]), "seed");
    expect(events.filter((event) => event.kind === "hit")).toHaveLength(40);
    expect(events.at(-1)).toEqual({ kind: "end", winner: 0 });
  });
});
