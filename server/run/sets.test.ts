import { describe, expect, it } from "vitest";
import { CARD_TYPES, type CardType } from "../battle.ts";
import { checksOf, FAMILIES, setHooks, setsFor, setsOf, teamSets, TOPIC, type SetBonus } from "./sets.ts";
import { card, firedBy, greendale, missingEffect, trial } from "./testbed.ts";
import type { Snapshot } from "./types.ts";

/** The testbed's side 0 with a fourth card, so a set can reach 4. No two cards share a type. */
function fourOfGreendale(): Snapshot {
  const team = greendale();
  return { ...team, units: [...team.units, { card: card("greendale/annie", { hp: 600, range: 3, type: "systems" }), col: 2, row: 1 }] };
}

/** That team with its first `members` cards in `set`: a family's by their type, a topic's by their topics. */
function withSet(set: string, members: number): Snapshot {
  const team = fourOfGreendale();
  const family = CARD_TYPES.find((type) => type === set);
  // The other cards take types other than the family's, so only the members share it.
  const others = CARD_TYPES.filter((type) => type !== family);
  const units = team.units.map((unit, index) => {
    if (index >= members) return { ...unit, card: { ...unit.card, type: others[index] } };
    return { ...unit, card: family ? { ...unit.card, type: family } : { ...unit.card, sets: [set] } };
  });
  return { ...team, units };
}

const SETS: [string, SetBonus][] = [...(Object.entries(FAMILIES) as [CardType, SetBonus][]), ["paintball", TOPIC]];

describe("each set in a fight", () => {
  it.each(SETS)("%s shows its 2-card and 4-card bonus in the events, on its cards only", (set, bonus) => {
    const control = trial(withSet(set, 0));
    for (const tier of bonus.tiers) {
      const events = trial(withSet(set, tier.at));
      expect(missingEffect(events, control, `set:${set}`, tier.effects)).toBeNull();
      expect(firedBy(events, `set:${set}`).filter((event) => event.side !== 0 || event.unit >= tier.at)).toEqual([]);
    }
  });
});

describe("setHooks", () => {
  const team = (cards: { type: CardType; sets?: string[] }[]): Snapshot => ({
    login: "greendale",
    round: 1,
    boosts: [],
    units: cards.map(({ type, sets = [] }, col) => ({ card: card(`greendale/${col}`, { type, sets }), col: col % 4, row: Math.floor(col / 4) })),
  });

  it("gives nothing to a family or a topic only one card has", () => {
    expect(setHooks(team([{ type: "web", sets: ["cli"] }, { type: "data" }, { type: "apps", sets: ["paintball"] }]))).toEqual([[], [], []]);
  });

  it("gives the 2-card bonus to exactly the two cards of a family", () => {
    const shield = { source: "set:web", on: "start", effects: [{ kind: "shield", aim: "self", share: 0.05 }] };
    expect(setHooks(team([{ type: "web" }, { type: "data" }, { type: "web" }]))).toEqual([[shield], [], [shield]]);
  });

  // Regression guarded: the 4-card tier is the reason to build toward a family; at 3 it
  // must still be the 2-card bonus, and at 4 the bigger one on every card.
  it.each([
    [3, 0.05],
    [4, 0.08],
    [5, 0.08],
  ])("gives each of %i cards of a family the shield of %s", (count, share) => {
    const hooks = setHooks(team(Array.from({ length: count }, () => ({ type: "web" }))));
    expect(hooks).toEqual(Array.from({ length: count }, () => [{ source: "set:web", on: "start", effects: [{ kind: "shield", aim: "self", share }] }]));
  });

  // Regression guarded: an uncommon topic shared across two types gave no bonus at all
  // ("No bonus: mixed types"); now every topic two cards share makes them faster.
  it("gives the topic bonus to two cards of different types that share an uncommon topic", () => {
    const faster = { source: "set:paintball", on: "start", effects: [{ kind: "stat", aim: "self", stat: "haste", by: 0.07 }] };
    expect(setHooks(team([{ type: "web", sets: ["paintball"] }, { type: "data", sets: ["paintball"] }]))).toEqual([[faster], [faster]]);
  });
});

describe("setsFor", () => {
  it("keeps the family, then the common topics first, up to two topics", () => {
    expect(setsFor("TypeScript", ["React", "cli", "hooks", "AI"])).toEqual(["web", "cli", "ai"]);
  });

  it("puts a repo with no language in Docs", () => {
    expect(setsFor(null, [])).toEqual(["docs"]);
  });

  // Regression guarded: a Go repo tagged "go", or one tagged both "cli" and "CLI", showed
  // the same set twice on its card and spent a topic slot on the repeat. A topic named
  // for a language or a family ("rust", "web") made a second language set by the back door.
  it.each([
    ["Go", ["go", "cli"], ["systems", "cli"]],
    ["Rust", ["CLI", "cli", "database"], ["systems", "cli", "database"]],
    [null, ["AI", "ai"], ["docs", "ai"]],
    ["Python", ["python", "rust", "data", "web", "llm"], ["data", "llm"]],
    ["Lean", ["lean", "math"], ["docs", "math"]],
  ])("lists each set once when %s has topics %j", (language, topics, sets) => {
    expect(setsFor(language, topics)).toEqual(sets);
  });
});

describe("setsOf", () => {
  // Regression guarded: a saved team link or a run made before families keeps each card's
  // language as its first set; read as a topic, two TypeScript cards would be faster on
  // top of their Web shield.
  it.each([
    [{ type: "web", sets: ["typescript", "cli", "react"] }, ["web", "cli", "react"]],
    [{ type: "systems", sets: ["c++"] }, ["systems"]],
    [{ type: "web", sets: ["web", "cli"] }, ["web", "cli"]],
    [{ type: "docs", sets: ["lean", "math"] }, ["docs", "lean", "math"]],
  ] as const)("reads the card %j as the sets %j", (old, sets) => {
    expect(setsOf({ type: old.type, sets: [...old.sets] })).toEqual(sets);
  });
});

describe("teamSets and checksOf", () => {
  const team = (cards: { type: CardType; sets?: string[] }[]) => ({ units: cards.map(({ type, sets = [] }, col) => ({ card: card(`greendale/${col}`, { type, sets }), col, row: 0 })) });

  it("reaches no tier at 1 card, the 2-card tier at 2 and 3, and the 4-card tier from 4", () => {
    const tiers = [1, 2, 3, 4].map((count) => {
      const [web] = teamSets(team(Array.from({ length: count }, () => ({ type: "web" }))));
      return [web.tier?.at, web.next?.at];
    });
    expect(tiers).toEqual([
      [undefined, 2],
      [2, 4],
      [2, 4],
      [4, undefined],
    ]);
  });

  // Regression guarded: the checks list showed 10.6 rows on a 5-card board, a topic on one
  // card among them, so the sets that did something were lost in the list.
  it("lists every family on the board and only the topics two cards share, live ones first", () => {
    const board = team([{ type: "data", sets: ["paintball"] }, { type: "web", sets: ["cli"] }, { type: "web", sets: ["cli"] }, { type: "apps" }]);
    expect(checksOf(board).map((entry) => [entry.set, entry.members.length, entry.tier?.at])).toEqual([
      ["web", 2, 2],
      ["cli", 2, 2],
      ["data", 1, undefined],
      ["apps", 1, undefined],
    ]);
  });
});
