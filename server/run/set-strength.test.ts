import { describe, expect, test } from "vitest";
import { FIXTURE_NOW, fixtureRepos, strengthOf } from "./balance-fixture.ts";
import { FAMILIES, TOPIC, TIERS, type SetBonus } from "./sets.ts";
import { cardFor } from "./stats.ts";
import type { Card } from "./types.ts";

// Regression guarded: set bonuses that did nothing (a speed bonus when speed changed no
// wait, 0 win points) beside ones that decided fights (+38 at 2 cards), so a player could
// not tell which checks mattered. Each bonus must win about the same: +8 to +14 win-rate
// points at 2 cards and +18 to +26 at 4, in the same fights with and without it
// (balance-fixture.ts strengthOf). The design and its numbers: docs/GAME-DESIGN.md,
// "The sets"; to re-measure one by hand: scripts/balance/strength.ts.

const FIGHTS = 2000;
const BAND: Record<(typeof TIERS)[number], [number, number]> = { 2: [8, 14], 4: [18, 26] };

const cards = fixtureRepos().map((repo) => cardFor(repo, FIXTURE_NOW));

/** Each set, the cards that carry it and the cards the rest of its team is drawn from. */
const MEASURED: [string, SetBonus, Card[], Card[]][] = [
  ...Object.entries(FAMILIES).map(([type, bonus]): [string, SetBonus, Card[], Card[]] => [type, bonus, cards.filter((card) => card.type === type), cards.filter((card) => card.type !== type)]),
  ["any topic", TOPIC, cards, cards],
];

describe("set strength", () => {
  test.each(MEASURED.flatMap(([name, bonus, carriers, others]) => bonus.tiers.map((tier) => [name, tier.at, tier, carriers, others] as const)))(
    "%s at %i cards wins its band of points",
    (name, at, tier, carriers, others) => {
      const gained = strengthOf({ on: tier.on, effects: tier.effects, members: at, carriers, others }, FIGHTS, name);
      const [least, most] = BAND[at];
      expect(gained).toBeGreaterThanOrEqual(least);
      expect(gained).toBeLessThanOrEqual(most);
    },
  );
});
