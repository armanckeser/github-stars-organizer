import { seededRandom } from "../battle.ts";
import { abilityHooks } from "./abilities.ts";
import { fightWith } from "./fight.ts";
import type { Effect, Hook, Rules, Trigger } from "./hooks.ts";
import { winnerOf } from "./rules.ts";
import type { CardFacts } from "./stats.ts";
import { COLS, ROWS, type Card, type Placed, type Snapshot } from "./types.ts";

// What the balance tests (balance.test.ts, set-strength.test.ts) and the balance
// scripts (scripts/balance/) measure with: 200 made-up repos spread like real ones,
// placed the way a player places them, and a measure of how much one bonus wins.

export const FIXTURE_NOW = Date.parse("2026-11-10T00:00:00Z");
const DAY = 86_400_000;
const LANGUAGES = ["TypeScript", "JavaScript", "Python", "Rust", "Go", "C++", "Shell", "Ruby", "Java", "Kotlin", "Swift", "C#", "PHP", "Jupyter Notebook", "HTML", null];
const REPOS = 200;
/** The fewest cards each team holds in a strength fight: a mid-run board. */
const STRENGTH_TEAM = 4;
/**
 * Cards on each team in a strength fight: four, or one more than the bonus's members,
 * so the set's cards always stand beside one outside it, as on a real board (four of a
 * family first show up on 5-card boards). A ranged family alone has no front line.
 */
export const strengthTeamOf = (members: number) => Math.max(STRENGTH_TEAM, members + 1);

/**
 * 200 repos spread over the whole range, from a weekend project to a 200k-star giant.
 * Bigger repos tend to have more people and more commits, with plenty of exceptions.
 */
export function fixtureRepos(): (CardFacts & { stars: number })[] {
  const random = seededRandom("balance fixture");
  const between = (low: number, high: number) => low + random() * (high - low);
  return Array.from({ length: REPOS }, (_, i) => {
    const stars = Math.floor(10 ** between(0, Math.log10(200_000)));
    const scale = Math.log10(stars + 1) / 5.3;
    const commitsYear = Math.round(10 ** between(0, 1 + scale * 2.6)) - 1;
    const age = between(0.1, 15);
    const issues = Math.round(10 ** (scale * between(1, 4.5)));
    return {
      fullName: `owner${i}/repo${i}`,
      description: null,
      stars,
      forks: Math.round(stars * between(0.02, 0.3)),
      language: LANGUAGES[Math.floor(random() * LANGUAGES.length)],
      color: null,
      avatarUrl: null,
      isArchived: random() < 0.05,
      createdAt: new Date(FIXTURE_NOW - age * 365.25 * DAY).toISOString(),
      pushedAt: new Date(FIXTURE_NOW - Math.min(age * 365, 10 ** between(0, 3.3)) * DAY).toISOString(),
      openIssues: Math.round(issues * between(0.02, 0.8)),
      closedIssues: issues,
      releases: random() < 0.3 ? 0 : Math.round(10 ** between(0, 2.4)),
      contributors: Math.max(1, Math.round(10 ** (scale * between(1.5, 3.2)))),
      commits: Math.round(commitsYear * age * between(0.5, 2)) + 1,
      commitsYear,
    };
  });
}

/** Cards placed the way a player would: up-close cards in front, cards with reach behind, columns at random. */
export function placed(cards: Card[], random: () => number): Placed[] {
  const cells = (row: number) => Array.from({ length: COLS }, (_, col) => ({ col, row, order: random() })).sort((x, y) => x.order - y.order);
  const front = cells(0);
  const back = cells(ROWS - 1);
  return cards.map((card) => {
    const [first, second] = card.range > 1 ? [back, front] : [front, back];
    const { col, row } = (first.length > 0 ? first : second).shift()!;
    return { card, col, row };
  });
}

/**
 * One bonus to measure: what it does and when, how many of side 0's cards carry it,
 * the cards they are drawn from, and the cards the rest of both teams are drawn from.
 */
export type Trial = { on: Trigger; effects: Effect[]; members: number; carriers: Card[]; others: Card[] };

/** Every card's ability, plus the trial's bonus on side 0's first `members` cards when `withBonus`. */
const rulesOf = (trial: Trial, withBonus: boolean): Rules => ({
  hooks: (snapshot, side) =>
    snapshot.units.map((unit, index) => {
      const bonus: Hook[] = withBonus && side === 0 && index < trial.members ? [{ source: "trial", on: trial.on, effects: trial.effects }] : [];
      return [...abilityHooks(unit.card.ability), ...bonus];
    }),
});

function draw(from: Card[], count: number, taken: Set<string>, random: () => number): Card[] {
  const free = from.filter((card) => !taken.has(card.fullName));
  return Array.from({ length: count }, () => {
    const [card] = free.splice(Math.floor(random() * free.length), 1);
    taken.add(card.fullName);
    return card;
  });
}

/**
 * Win-rate points the bonus adds: side 0 wins `fights` fights (strengthTeamOf cards a side) with it, less
 * the same fights (same cards, cells and seeds) without it. Abilities stay on, so it is
 * measured as it plays. Side 0's other cards are drawn from `others`, so a family's
 * trial holds exactly `members` cards of the family; side 1's from every card.
 */
export function strengthOf(trial: Trial, fights: number, seed: string): number {
  const random = seededRandom(`strength|${seed}`);
  const on = fightWith(rulesOf(trial, true));
  const off = fightWith(rulesOf(trial, false));
  const size = strengthTeamOf(trial.members);
  const everyone = [...new Map([...trial.carriers, ...trial.others].map((card) => [card.fullName, card])).values()];
  let gained = 0;
  for (let i = 0; i < fights; i++) {
    const taken = new Set<string>();
    const mine = [...draw(trial.carriers, trial.members, taken, random), ...draw(trial.others, size - trial.members, taken, random)];
    const theirs = draw(everyone, size, taken, random);
    const a: Snapshot = { login: "a", round: size, units: placed(mine, random), boosts: [] };
    const b: Snapshot = { login: "b", round: size, units: placed(theirs, random), boosts: [] };
    const fightSeed = `${seed}|${i}`;
    gained += Number(winnerOf(on(a, b, fightSeed)) === 0) - Number(winnerOf(off(a, b, fightSeed)) === 0);
  }
  return (gained / fights) * 100;
}
