import { FIXTURE_NOW, fixtureRepos, strengthOf, type Trial } from "../../server/run/balance-fixture.ts";
import { FAMILY_SETS, SETS, type SetBonus } from "../../server/run/sets.ts";
import { cardFor } from "../../server/run/stats.ts";
import type { Card } from "../../server/run/types.ts";
import { poolsFromArguments } from "./pools.ts";

// How many win-rate points each set bonus adds at each tier, 4 cards against 4, on the
// made-up repos the tests use and, when pool files are given, on real pools:
//   node scripts/balance/strength.ts [pool.json p-<opponent>.json ...]

const FIGHTS = Number(process.env.FIGHTS ?? 2000);
const TIERS = [
  { members: 2, of: (bonus: SetBonus) => bonus.two },
  { members: 3, of: (bonus: SetBonus) => bonus.three },
];

const families = new Set(Object.values(FAMILY_SETS).map((bonus) => bonus.set));
const typeOfFamily = new Map(Object.entries(FAMILY_SETS).map(([type, bonus]) => [bonus.set, type]));

function row(bonus: SetBonus, cards: Card[]): string {
  const type = typeOfFamily.get(bonus.set);
  const carriers = type ? cards.filter((card) => card.type === type) : cards;
  const others = type ? cards.filter((card) => card.type !== type) : cards;
  const gains = TIERS.map(({ members, of }) => {
    const trial: Trial = { ...of(bonus), members, carriers, others };
    return carriers.length < members ? "  n/a" : strengthOf(trial, FIGHTS, bonus.set).toFixed(1).padStart(5);
  });
  return `${(families.has(bonus.set) ? `type ${bonus.set}` : bonus.set).padEnd(16)} ${gains.join("   ")}   ${bonus.two.text}`;
}

function table(label: string, cards: Card[]) {
  console.log(`\n${label}: ${cards.length} cards, ${FIGHTS} fights per cell (win-rate points gained at ${TIERS.map((tier) => tier.members).join(" / ")} cards)`);
  for (const bonus of [...SETS, ...Object.values(FAMILY_SETS)]) console.log(row(bonus, cards));
}

table("fixture", fixtureRepos().map((repo) => cardFor(repo, FIXTURE_NOW)));
const pools = poolsFromArguments();
if (pools) table("real pools", [pools.player, ...pools.opponents.values()].flatMap((pool) => pool.team.map((fighter) => fighter.card)));
