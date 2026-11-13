import { FIXTURE_NOW, fixtureRepos, strengthOf, type Trial } from "../../server/run/balance-fixture.ts";
import { FAMILIES, TOPIC, type SetBonus } from "../../server/run/sets.ts";
import { cardFor } from "../../server/run/stats.ts";
import type { Card } from "../../server/run/types.ts";
import { poolsFromArguments } from "./pools.ts";

// How many win-rate points each set bonus adds at each tier (teams sized by
// strengthTeamOf: 4 against 4 at 2 cards, 5 against 5 at 4), on the
// made-up repos the tests use and, when pool files are given, on real pools:
//   node scripts/balance/strength.ts [pool.json p-<opponent>.json ...]

const FIGHTS = Number(process.env.FIGHTS ?? 2000);

/** Each set, and which cards carry it: a family's own cards, or any card for the topic bonus. */
export const MEASURED: { name: string; bonus: SetBonus; carries: (card: Card) => boolean }[] = [
  ...Object.entries(FAMILIES).map(([type, bonus]) => ({ name: type, bonus, carries: (card: Card) => card.type === type })),
  { name: "any topic", bonus: TOPIC, carries: () => true },
];

/** The bonus's gain at each of its tiers, on `cards`. */
export function gainsOf(entry: (typeof MEASURED)[number], cards: Card[], fights: number): number[] {
  const carriers = cards.filter(entry.carries);
  const others = entry.bonus.kind === "topic" ? cards : cards.filter((card) => !entry.carries(card));
  return entry.bonus.tiers.map((tier) => {
    const trial: Trial = { on: tier.on, effects: tier.effects, members: tier.at, carriers, others };
    return strengthOf(trial, fights, entry.name);
  });
}

function table(label: string, cards: Card[]) {
  console.log(`\n${label}: ${cards.length} cards, ${FIGHTS} fights per cell (win-rate points gained at 2 / 4 cards)`);
  for (const entry of MEASURED) {
    const gains = gainsOf(entry, cards, FIGHTS).map((gain) => gain.toFixed(1).padStart(5));
    console.log(`${entry.name.padEnd(10)} ${gains.join("   ")}   ${entry.bonus.does}: ${entry.bonus.tiers[0].text}`);
  }
}

if (import.meta.main) {
  table("fixture", fixtureRepos().map((repo) => cardFor(repo, FIXTURE_NOW)));
  const pools = poolsFromArguments();
  if (pools) table("real pools", [pools.player, ...pools.opponents.values()].flatMap((pool) => pool.team.map((fighter) => fighter.card)));
}
