import { describe, expect, it } from "vitest";
import { BOOSTS, boostHooks, boostOffer, type Who } from "./boosts.ts";
import { firedBy, greendale, missingEffect, trial } from "./testbed.ts";

// `greendale` stands its first card (index 0) and a second card (1) in front, a third (2) behind.
const CARRIERS: Record<Who, number[]> = { first: [0], front: [0, 1], back: [2], all: [0, 1, 2] };

describe("each boost in a fight", () => {
  it.each(BOOSTS.map((boost) => [boost.id, boost] as const))("%s shows its effect in the events, on the cards it names", (id, boost) => {
    const events = trial(greendale({}, [[], [], []], [id]));
    expect(missingEffect(events, trial(greendale()), `boost:${id}`, boost.effects)).toBeNull();
    expect(firedBy(events, `boost:${id}`).filter((event) => event.side === 0 && !CARRIERS[boost.who].includes(event.unit))).toEqual([]);
  });
});

describe("boosts", () => {
  it("has about 18, with unique ids", () => {
    expect(BOOSTS.length).toBeGreaterThanOrEqual(16);
    expect(new Set(BOOSTS.map((boost) => boost.id)).size).toBe(BOOSTS.length);
  });

  it("offers three boosts the team does not have, the same three for the same seed", () => {
    const offer = boostOffer("greendale|round 2", ["thorns"]);
    expect(offer).toHaveLength(3);
    expect(new Set(offer).size).toBe(3);
    expect(offer).not.toContain("thorns");
    expect(boostOffer("greendale|round 2", ["thorns"])).toEqual(offer);
  });

  it("offers fewer than three when fewer are left", () => {
    expect(boostOffer("seed", BOOSTS.slice(1).map((boost) => boost.id))).toEqual([BOOSTS[0].id]);
  });

  it("skips a boost id it does not know", () => {
    expect(boostHooks(greendale({}, [[], [], []], ["no-such-boost"]))).toEqual([[], [], []]);
  });
});
