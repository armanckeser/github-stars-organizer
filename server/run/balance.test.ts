import { describe, expect, test } from "vitest";
import { seededRandom } from "../battle.ts";
import { FIXTURE_NOW, fixtureRepos, placed } from "./balance-fixture.ts";
import { fight } from "./fight.ts";
import { cardFor } from "./stats.ts";
import { TICK_MS, type Snapshot } from "./types.ts";

// The balance test from docs/AGENT-TASKS.md, Task 1. Stars set a card's rarity and
// little else, so the team with more stars should win only a little more often, and
// standing on side 0 should be worth nothing. A fight between two full teams should
// last 15 to 30 seconds.

const FIGHTS = 2000;
const FULL_TEAM = 5;

describe("balance", () => {
  test("the side a team stands on is worth nothing, more stars win a little more often, and full teams fight 15 to 30 seconds", () => {
    const repos = fixtureRepos();
    const stars = new Map(repos.map((repo) => [repo.fullName, repo.stars]));
    const cards = repos.map((repo) => cardFor(repo, FIXTURE_NOW));
    const random = seededRandom("balance fights");
    // Both teams in a fight have the same number of cards: a bigger team wins by
    // having more cards, which says nothing about how the cards are made.
    const teams = (size: number): [Snapshot, Snapshot] => {
      const pool = [...cards];
      const draw = (login: string): Snapshot => ({ login, round: size, units: placed(Array.from({ length: size }, () => pool.splice(Math.floor(random() * pool.length), 1)[0]), random), boosts: [] });
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
