import { describe, expect, it } from "vitest";
import { COMMON_TOPICS, FAMILY_SETS, SETS, setHooks, setsFor } from "./sets.ts";
import { card, firedBy, greendale, missingEffect, trial } from "./testbed.ts";
import type { Snapshot } from "./types.ts";

const shared = (set: string, members: 2 | 3): [string[], string[], string[]] => [[set], [set], members === 3 ? [set] : []];

describe("each set in a fight", () => {
  it.each(SETS.map((bonus) => [bonus.set, bonus] as const))("%s shows its two-card and three-card bonus in the events", (set, bonus) => {
    const control = trial(greendale());
    for (const [members, tier] of [[2, bonus.two], [3, bonus.three]] as const) {
      const events = trial(greendale({}, shared(set, members)));
      expect(missingEffect(events, control, `set:${set}`, tier.effects)).toBeNull();
      // Only the cards that share the set carry it.
      expect(firedBy(events, `set:${set}`).filter((event) => event.side !== 0 || event.unit >= members)).toEqual([]);
    }
  });

  it.each(Object.entries(FAMILY_SETS))("a language with no bonus of its own gives the %s type's bonus", (type, bonus) => {
    const language = `${type}-language`;
    // Both cards that share the language are of the type.
    const ofType = (team: Snapshot): Snapshot => ({ ...team, units: team.units.map((unit, index) => (index < 2 ? { ...unit, card: { ...unit.card, type } } : unit)) });
    const events = trial(ofType(greendale({}, [[language], [language], []])));
    expect(missingEffect(events, trial(ofType(greendale())), `set:${language}`, bonus.two.effects)).toBeNull();
  });
});

describe("setHooks", () => {
  const team = (sets: string[][]): Snapshot => ({ login: "greendale", round: 1, boosts: [], units: sets.map((cardSets, col) => ({ card: card(`greendale/${col}`, { sets: cardSets }), col, row: 0 })) });

  it("gives nothing to a set only one card has", () => {
    expect(setHooks(team([["rust"], ["go"], ["cli"]]))).toEqual([[], [], []]);
  });

  it("gives the two-card bonus to exactly the two cards that share a set", () => {
    const cli = SETS.find((bonus) => bonus.set === "cli")!;
    expect(setHooks(team([["cli"], ["rust"], ["cli"]]))).toEqual([[{ source: "set:cli", on: "start", effects: cli.two.effects }], [], [{ source: "set:cli", on: "start", effects: cli.two.effects }]]);
    expect(cli.two.effects).toEqual([{ kind: "stat", aim: "self", stat: "speed", by: 0.1 }]);
  });

  it("gives the three-card bonus from three cards on, and to each of them", () => {
    const hooks = setHooks(team([["cli"], ["cli"], ["cli"], ["cli"]]));
    const cli = SETS.find((bonus) => bonus.set === "cli")!;
    expect(hooks.map((list) => list.map((hook) => hook.effects))).toEqual([[cli.three.effects], [cli.three.effects], [cli.three.effects], [cli.three.effects]]);
  });

  it("gives no bonus for an uncommon topic shared across different types", () => {
    const mixed: Snapshot = { login: "greendale", round: 1, boosts: [], units: [{ card: card("greendale/a", { sets: ["paintball"], type: "web" }), col: 0, row: 0 }, { card: card("greendale/b", { sets: ["paintball"], type: "data" }), col: 1, row: 0 }] };
    expect(setHooks(mixed)).toEqual([[], []]);
  });

  it("has one bonus per common topic", () => {
    expect(COMMON_TOPICS.filter((topic) => !SETS.some((bonus) => bonus.set === topic))).toEqual([]);
  });
});

describe("setsFor", () => {
  it("keeps the language, then the common topics first, up to two topics", () => {
    expect(setsFor("TypeScript", ["React", "cli", "hooks", "AI"])).toEqual(["typescript", "cli", "ai"]);
  });

  it("has no language set when the repo has no language", () => {
    expect(setsFor(null, [])).toEqual([]);
  });
});
