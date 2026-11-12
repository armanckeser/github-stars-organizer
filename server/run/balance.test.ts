import { describe, expect, test } from "vitest";
import { seededRandom } from "../battle.ts";
import { fight } from "./fight.ts";
import { cardFor, type CardFacts } from "./stats.ts";
import { COLS, ROWS, TICK_MS, type Card, type Placed, type Snapshot } from "./types.ts";

// The balance test from docs/AGENT-TASKS.md, Task 1. Stars set a card's rarity and
// little else, so the team with more stars should win only a little more often, and
// standing on side 0 should be worth nothing. A fight between two full teams should
// last 15 to 30 seconds.

const NOW = Date.parse("2026-11-10T00:00:00Z");
const DAY = 86_400_000;
const LANGUAGES = ["TypeScript", "JavaScript", "Python", "Rust", "Go", "C++", "Shell", "Ruby", "Java", "Kotlin", "Swift", "C#", "PHP", "Jupyter Notebook", "HTML", null];
const REPOS = 200;
const FIGHTS = 2000;
const FULL_TEAM = 5;

// 200 repos spread over the whole range, from a weekend project to a 200k-star giant.
// Bigger repos tend to have more people and more commits, with plenty of exceptions.
function fixture(): (CardFacts & { stars: number })[] {
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
      createdAt: new Date(NOW - age * 365.25 * DAY).toISOString(),
      pushedAt: new Date(NOW - Math.min(age * 365, 10 ** between(0, 3.3)) * DAY).toISOString(),
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
function place(cards: Card[], random: () => number): Placed[] {
  const cells = (row: number) => Array.from({ length: COLS }, (_, col) => ({ col, row, order: random() })).sort((x, y) => x.order - y.order);
  const front = cells(0);
  const back = cells(ROWS - 1);
  return cards.map((card) => {
    const [first, second] = card.range > 1 ? [back, front] : [front, back];
    const { col, row } = (first.length > 0 ? first : second).shift()!;
    return { card, col, row };
  });
}

describe("balance", () => {
  test("the side a team stands on is worth nothing, more stars win a little more often, and full teams fight 15 to 30 seconds", () => {
    const repos = fixture();
    const stars = new Map(repos.map((repo) => [repo.fullName, repo.stars]));
    const cards = repos.map((repo) => cardFor(repo, NOW));
    const random = seededRandom("balance fights");
    // Both teams in a fight have the same number of cards: a bigger team wins by
    // having more cards, which says nothing about how the cards are made.
    const teams = (size: number): [Snapshot, Snapshot] => {
      const pool = [...cards];
      const draw = (login: string): Snapshot => ({ login, round: size, units: place(Array.from({ length: size }, () => pool.splice(Math.floor(random() * pool.length), 1)[0]), random), boosts: [] });
      return [draw("a"), draw("b")];
    };
    const starsOf = (team: Snapshot) => team.units.reduce((sum, unit) => sum + (stars.get(unit.card.fullName) ?? 0), 0);

    let sideZero = 0;
    let richer = 0;
    let decided = 0;
    const fullLengths: number[] = [];
    for (let i = 0; i < FIGHTS; i++) {
      const size = 2 + Math.floor(random() * (FULL_TEAM - 1));
      const [a, b] = teams(size);
      const events = fight(a, b, `fight ${i}`);
      const end = events.at(-1)!;
      if (end.kind !== "end") throw new Error("A fight must finish with its end.");
      if (end.winner === 0) sideZero++;
      if (size === FULL_TEAM) fullLengths.push((end.t * TICK_MS) / 1000);
      if (starsOf(a) === starsOf(b)) continue;
      decided++;
      if (end.winner === (starsOf(a) > starsOf(b) ? 0 : 1)) richer++;
    }
    fullLengths.sort((x, y) => x - y);
    const at = (share: number) => fullLengths[Math.floor(share * (fullLengths.length - 1))];
    const measured = { sideZero: sideZero / FIGHTS, richer: richer / decided, median: at(0.5), p10: at(0.1), p90: at(0.9) };
    console.log(
      `balance: side 0 wins ${(measured.sideZero * 100).toFixed(1)}%, more stars win ${(measured.richer * 100).toFixed(1)}%, ` +
        `full teams fight ${measured.p10}s / ${measured.median}s / ${measured.p90}s (10th / 50th / 90th percentile, ${fullLengths.length} fights)`,
    );
    expect(measured.sideZero).toBeGreaterThanOrEqual(0.47);
    expect(measured.sideZero).toBeLessThanOrEqual(0.53);
    expect(measured.richer).toBeGreaterThanOrEqual(0.45);
    expect(measured.richer).toBeLessThanOrEqual(0.6);
    expect(measured.p10).toBeGreaterThanOrEqual(15);
    expect(measured.p90).toBeLessThanOrEqual(30);
  });
});
