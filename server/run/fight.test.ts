import { describe, expect, it } from "vitest";
import { fight, fightWith, MAX_TICKS } from "./fight.ts";
import type { Hook, Rules } from "./hooks.ts";
import type { Card, FightEvent, Placed, Snapshot } from "./types.ts";

const card = (fullName: string, over: Partial<Card> = {}): Card => ({ fullName, type: "web", sets: [], rarity: 0, hp: 150, attack: 100, guard: 100, speed: 100, range: 1, ability: "none", shiny: false, ...over });
const team = (login: string, units: Placed[]): Snapshot => ({ login, round: 1, units, boosts: [] });
const at = (c: Card, col: number, row = 0): Placed => ({ card: c, col, row });
const of = <K extends FightEvent["kind"]>(events: FightEvent[], kind: K) => events.filter((event): event is Extract<FightEvent, { kind: K }> => event.kind === kind);

// Two cards face to face in the middle columns: side 0's col 1 is board x 1, side 1's col 2 is board x 1 too.
const duel = (mine: Card, theirs: Card) => [team("greendale", [at(mine, 1)]), team("city-college", [at(theirs, 2)])] as const;
/** Gives side 0's first card `hooks`, and nobody else anything. */
const carrying = (hooks: Hook[]): Rules => ({ hooks: (snapshot, side) => snapshot.units.map((_, index) => (side === 0 && index === 0 ? hooks : [])) });

describe("fight", () => {
  it("gives the same events for the same teams and seed, and other events for another seed", () => {
    const a = team("greendale", [at(card("greendale/troy"), 0), at(card("greendale/abed", { range: 3 }), 3, 1)]);
    const b = team("city-college", [at(card("city-college/one"), 1), at(card("city-college/two"), 2, 1)]);
    expect(fight(a, b, "seed")).toEqual(fight(a, b, "seed"));
    expect(fight(a, b, "seed")).not.toEqual(fight(a, b, "other seed"));
  });

  it("walks cards into reach, keeps events in time order, and the side with a card left wins", () => {
    const events = fight(team("greendale", [at(card("greendale/strong", { attack: 2000, hp: 2000 }), 0, 1)]), team("city-college", [at(card("city-college/one"), 0, 1), at(card("city-college/two"), 3, 1)]), "seed");
    expect(events.at(-1)).toMatchObject({ kind: "end", winner: 0 });
    expect(of(events, "faint").map((event) => event.side)).toEqual([1, 1]);
    expect(of(events, "move").some((event) => event.side === 0)).toBe(true);
    expect(events.map((event) => event.t)).toEqual([...events.map((event) => event.t)].sort((x, y) => x - y));
  });

  it("lets a card with reach hit from the back row without walking", () => {
    const events = fight(team("greendale", [at(card("greendale/far", { range: 3 }), 0, 1)]), team("city-college", [at(card("city-college/still", { attack: 1, range: 1 }), 3, 1)]), "seed");
    expect(events.find((event) => event.kind === "hit")).toMatchObject({ side: 0 });
    expect(of(events, "move").filter((event) => event.side === 0)).toEqual([]);
  });

  it("stops at 45 seconds and gives the fight to the side with more HP left", () => {
    const wall = { attack: 0, guard: 100_000, hp: 5000 };
    const events = fight(...duel(card("greendale/wall", { ...wall, hp: 6000 }), card("city-college/wall", wall)), "seed");
    expect(MAX_TICKS).toBe(450);
    expect(events.at(-1)).toEqual({ t: 450, kind: "end", winner: 0 });
  });

  it("calls a draw when the clock runs out with the same HP left on both sides", () => {
    const shielded: Rules = { hooks: (snapshot) => snapshot.units.map(() => [{ source: "test:wall", on: "start", effects: [{ kind: "shield", aim: "self", share: 1000 }] }]) };
    const events = fightWith(shielded)(...duel(card("greendale/wall"), card("city-college/wall")), "seed");
    expect(events.at(-1)).toEqual({ t: 450, kind: "end", winner: null });
  });

  it("ends at once in a draw when neither side has a card", () => {
    expect(fight(team("greendale", []), team("city-college", []), "seed")).toEqual([{ t: 0, kind: "end", winner: null }]);
  });

  it("lets a faster card hit more often", () => {
    const wall = { attack: 0, guard: 100_000, hp: 5000 };
    const events = fight(...duel(card("greendale/fast", { ...wall, speed: 400 }), card("city-college/slow", { ...wall, speed: 20 })), "seed");
    const hits = (side: 0 | 1) => of(events, "hit").filter((event) => event.side === side).length;
    expect(hits(0)).toBeGreaterThan(hits(1) * 1.2);
  });

  it("lands about one hit in sixteen as a critical, for 1.5 times the damage", () => {
    const wall = { guard: 100, hp: 1_000_000 };
    const events = fight(...duel(card("greendale/wall", { ...wall, speed: 10_000 }), card("city-college/wall", { ...wall, speed: 10_000 })), "seed");
    const hits = of(events, "hit");
    const critical = hits.filter((hit) => hit.critical);
    const mean = (list: typeof hits) => list.reduce((sum, hit) => sum + hit.damage, 0) / list.length;
    expect(hits.length).toBeGreaterThan(150);
    expect(critical.length / hits.length).toBeGreaterThan(0.03);
    expect(critical.length / hits.length).toBeLessThan(0.1);
    expect(mean(critical) / mean(hits.filter((hit) => !hit.critical))).toBeGreaterThan(1.3);
    expect(mean(critical) / mean(hits.filter((hit) => !hit.critical))).toBeLessThan(1.7);
  });
});

describe("fightWith hooks", () => {
  const fragile = card("city-college/fragile", { hp: 400 });

  it("fires a start hook at the first tick, before any hit", () => {
    const events = fightWith(carrying([{ source: "test:start", on: "start", effects: [{ kind: "shield", aim: "self", share: 10 }] }]))(...duel(card("greendale/troy"), fragile), "seed");
    expect(events[0]).toEqual({ t: 0, kind: "ability", side: 0, unit: 0, ability: "test:start", targets: [0] });
  });

  it("lets a shield take the hits before HP does", () => {
    const events = fightWith(carrying([{ source: "test:shield", on: "start", effects: [{ kind: "shield", aim: "self", share: 1 }] }]))(...duel(card("greendale/troy"), fragile), "seed");
    const first = of(events, "hit").find((hit) => hit.side === 1);
    expect(first?.damage).toBe(0);
  });

  it("fires a hit hook after each of the card's own hits, with its damage at the same tick", () => {
    const events = fightWith(carrying([{ source: "test:hit", on: "hit", effects: [{ kind: "damage", aim: "foe", power: 1 }] }]))(...duel(card("greendale/troy"), card("city-college/wall", { hp: 100_000 })), "seed");
    const own = of(events, "hit").filter((hit) => hit.side === 0);
    const fired = of(events, "ability");
    expect(fired.length).toBeGreaterThan(1);
    // Each normal hit is followed by the hook's hit: twice as many hits as hooks fired.
    expect(own.length).toBe(fired.length * 2);
    for (const ability of fired) expect(own.filter((hit) => hit.t === ability.t)).toHaveLength(2);
  });

  it("fires a hurt hook only while the card is still standing after the hit", () => {
    const events = fightWith(carrying([{ source: "test:hurt", on: "hurt", effects: [{ kind: "stat", aim: "self", stat: "guard", by: 0.1 }] }]))(...duel(card("greendale/troy", { hp: 100 }), card("city-college/strong", { attack: 400 })), "seed");
    const taken = of(events, "hit").filter((hit) => hit.side === 1);
    expect(events.at(-1)).toMatchObject({ winner: 1 });
    expect(of(events, "ability")).toHaveLength(taken.length - 1);
  });

  it("fires every third hit, not the others", () => {
    const events = fightWith(carrying([{ source: "test:third", on: "third", effects: [{ kind: "stat", aim: "self", stat: "attack", by: 0 }] }]))(...duel(card("greendale/troy"), card("city-college/wall", { hp: 2000 })), "seed");
    const own = of(events, "hit").filter((hit) => hit.side === 0);
    expect(own.length).toBeGreaterThan(5);
    expect(of(events, "ability").map((ability) => ability.t)).toEqual(own.filter((_, i) => (i + 1) % 3 === 0).map((hit) => hit.t));
  });

  it("fires an ally-faint hook on the teammates of a card that faints, at the tick it faints", () => {
    const rules: Rules = { hooks: (snapshot, side) => snapshot.units.map((_, index) => (side === 0 && index === 1 ? [{ source: "test:grief", on: "ally-faint", effects: [{ kind: "stat", aim: "self", stat: "attack", by: 0.5 }] }] : [])) };
    const a = team("greendale", [at(card("greendale/pierce", { hp: 10 }), 1), at(card("greendale/abed", { range: 3, hp: 5000 }), 1, 1)]);
    const events = fightWith(rules)(a, team("city-college", [at(card("city-college/wall", { hp: 5000 }), 2)]), "seed");
    const fainted = of(events, "faint").find((event) => event.side === 0 && event.unit === 0);
    expect(fainted).toBeDefined();
    expect(of(events, "ability")).toEqual([{ t: fainted!.t, kind: "ability", side: 0, unit: 1, ability: "test:grief", targets: [1] }]);
  });

  it("raises a card's damage with an attack stat", () => {
    const strong = fightWith(carrying([{ source: "test:attack", on: "start", effects: [{ kind: "stat", aim: "self", stat: "attack", by: 3 }] }]));
    const plain = fight(...duel(card("greendale/troy"), card("city-college/wall", { hp: 3000 })), "seed");
    const raised = strong(...duel(card("greendale/troy"), card("city-college/wall", { hp: 3000 })), "seed");
    const firstHit = (events: FightEvent[]) => of(events, "hit").find((hit) => hit.side === 0 && !hit.critical)!.damage;
    expect(firstHit(raised)).toBeGreaterThan(firstHit(plain) * 1.3);
  });

  it("holds a gated hook back until its gate opens", () => {
    const events = fightWith(carrying([{ source: "test:low", on: "hurt", when: "low", once: true, effects: [{ kind: "shield", aim: "self", share: 0.1 }] }]))(...duel(card("greendale/troy", { hp: 1000 }), card("city-college/strong", { attack: 200, hp: 5000 })), "seed");
    const [fired] = of(events, "ability");
    const lostBefore = of(events, "hit").filter((hit) => hit.side === 1 && hit.t <= fired.t).reduce((sum, hit) => sum + hit.damage, 0);
    expect(of(events, "ability")).toHaveLength(1);
    expect(lostBefore).toBeGreaterThan(500);
  });

  it("does not let two hurt hooks answer each other forever", () => {
    const thorns: Hook = { source: "test:thorns", on: "hurt", effects: [{ kind: "damage", aim: "foe", power: 0.2 }] };
    const both: Rules = { hooks: (snapshot) => snapshot.units.map(() => [thorns]) };
    const events = fightWith(both)(...duel(card("greendale/troy"), card("city-college/one")), "seed");
    const normal = of(events, "hit").length - of(events, "ability").length;
    expect(events.at(-1)?.kind).toBe("end");
    // One answer per normal hit the card survived, never an answer to an answer.
    expect(of(events, "ability").length).toBeLessThanOrEqual(normal);
  });
});

describe("fightWith conditions and heals", () => {
  const wall = card("city-college/wall", { hp: 4000 });
  const start = (effects: Hook["effects"]): Rules => carrying([{ source: "test:start", on: "start", effects }]);

  it("shows a heal as an hp event with its cause, and never heals above full HP", () => {
    const rules = carrying([{ source: "test:heal", on: "hurt", effects: [{ kind: "heal", aim: "self", share: 0.5 }] }]);
    const events = fightWith(rules)(...duel(card("greendale/troy", { hp: 400 }), card("city-college/strong", { attack: 200, hp: 4000 })), "seed");
    const heals = of(events, "hp");
    expect(heals.length).toBeGreaterThan(0);
    expect(heals.every((heal) => heal.cause === "test:heal" && heal.change > 0)).toBe(true);
    // Each heal gives back exactly the HP the hit before it took, since half of 400 is more than one hit.
    for (const heal of heals) expect(heal.change).toBe(of(events, "hit").filter((hit) => hit.side === 1 && hit.t === heal.t).at(-1)?.damage);
    expect(of(fightWith(start([{ kind: "heal", aim: "self", share: 0.5 }]))(...duel(card("greendale/troy"), wall), "seed"), "hp")).toEqual([]);
  });

  it("wears a condition off after 3 seconds", () => {
    const events = fightWith(start([{ kind: "condition", aim: "self", condition: "flaky" }]))(...duel(card("greendale/troy"), wall), "seed");
    expect(of(events, "condition")).toEqual([
      { t: 0, kind: "condition", side: 0, unit: 0, condition: "flaky", on: true },
      { t: 30, kind: "condition", side: 0, unit: 0, condition: "flaky", on: false },
    ]);
  });

  it("keeps one condition per card at a time", () => {
    const events = fightWith(start([{ kind: "condition", aim: "self", condition: "flaky" }, { kind: "condition", aim: "self", condition: "rate-limited" }]))(...duel(card("greendale/troy"), wall), "seed");
    expect(of(events, "condition").filter((event) => event.on).map((event) => event.condition)).toEqual(["flaky"]);
  });

  it("lets a deprecated card lose a thirtieth of its full HP each second, as hits by the card that left it", () => {
    const events = fightWith(start([{ kind: "condition", aim: "foe", condition: "deprecated" }]))(...duel(card("greendale/troy", { attack: 0 }), wall), "seed");
    expect(of(events, "hit").filter((hit) => hit.side === 0 && [10, 20, 30].includes(hit.t) && hit.damage === 133)).toHaveLength(3);
  });

  it("lets a card in a merge conflict hit itself", () => {
    const rules = carrying([{ source: "test:conflict", on: "hit", effects: [{ kind: "condition", aim: "self", condition: "merge-conflict" }] }]);
    const events = fightWith(rules)(...duel(card("greendale/troy"), wall), "seed");
    const self = of(events, "hp").filter((event) => event.cause === "merge-conflict");
    expect(self.length).toBeGreaterThan(2);
    expect(self.every((event) => event.side === 0 && event.unit === 0 && event.change < 0)).toBe(true);
  });

  it("makes a rate-limited card wait half as long again between hits", () => {
    const limited = fightWith(start([{ kind: "condition", aim: "self", condition: "rate-limited" }]))(...duel(card("greendale/troy"), wall), "seed");
    const gaps = (events: FightEvent[]) => {
      const times = of(events, "hit").filter((hit) => hit.side === 0).map((hit) => hit.t);
      return times[1] - times[0];
    };
    expect(gaps(limited)).toBe(15);
    expect(gaps(fight(...duel(card("greendale/troy"), wall), "seed"))).toBe(10);
  });

  it("makes a flaky card miss some of its hits", () => {
    const rules = carrying([{ source: "test:flaky", on: "hit", effects: [{ kind: "condition", aim: "self", condition: "flaky" }] }]);
    const hits = (events: FightEvent[]) => of(events, "hit").filter((hit) => hit.side === 0).length;
    const steady = hits(fight(...duel(card("greendale/troy"), wall), "seed"));
    expect(hits(fightWith(rules)(...duel(card("greendale/troy"), wall), "seed"))).toBeLessThan(steady * 0.9);
  });
});
