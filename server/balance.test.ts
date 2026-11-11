import { describe, expect, test } from "vitest";
import { fighterFor, seededRandom, type Fighter, type RepoFacts } from "./battle.ts";
import { botAction } from "./bot.ts";
import { applyAction, startGame, type GamePlayer, type GameState } from "./game.ts";
import { defaultLook } from "./character.ts";

// The balance test from docs/GAME-DESIGN.md: stars set a card's rarity and little
// else, so the richer team should win only a little more often, and moving first
// should be worth almost nothing.

const NOW = Date.parse("2026-11-10T00:00:00Z");
const DAY = 86_400_000;
const LANGUAGES = ["TypeScript", "JavaScript", "Python", "Rust", "Go", "C++", "Shell", "Ruby", "Java", "Kotlin", "Swift", "C#", "PHP", "Jupyter Notebook", "HTML", null];
const REPOS = 200;
const MATCHES = 2000;

// 200 repos spread over the whole range, from a weekend project to a 200k-star giant.
// Bigger repos tend to have more people and more commits, with plenty of exceptions.
function fixture(): RepoFacts[] {
  const random = seededRandom("balance fixture");
  const between = (low: number, high: number) => low + random() * (high - low);
  return Array.from({ length: REPOS }, (_, i) => {
    const stars = Math.floor(10 ** between(0, Math.log10(200_000)));
    const scale = Math.log10(stars + 1) / 5.3;
    const contributors = Math.max(1, Math.round(10 ** (scale * between(1.5, 3.2))));
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
      contributors,
      commits: Math.round(commitsYear * age * between(0.5, 2)) + 1,
      commitsYear,
    };
  });
}

const player = (login: string): GamePlayer => ({ login, name: login, klass: "rookie", look: defaultLook(login), level: 1, avatarUrl: null });

function play(a: Fighter[], b: Fighter[], seed: string): { state: GameState; first: "a" | "b" } {
  let state = startGame({ v: 1, players: { a: player("a"), b: player("b") }, teams: { a, b } }, seed);
  const first = state.next!;
  const random = seededRandom(`${seed}|bots`);
  while (state.status === "active") {
    const side = state.next!;
    state = applyAction(state, seed, side, botAction(state, seed, side, random)!, String(state.turn), "");
  }
  return { state, first };
}

describe("balance", () => {
  test("more stars win a little more often, and moving first is worth almost nothing", () => {
    const cards = fixture().map((repo) => fighterFor(repo, "nobody", NOW));
    const random = seededRandom("balance matches");
    // Both teams in a match have the same number of cards, 4 or 5: a bigger team wins
    // by having more cards, which says nothing about how the cards are made.
    const teams = (size: number) => {
      const pool = [...cards];
      const draw = () => Array.from({ length: size }, () => pool.splice(Math.floor(random() * pool.length), 1)[0]);
      return [draw(), draw()];
    };
    const stars = (side: Fighter[]) => side.reduce((sum, card) => sum + card.stars, 0);
    let richer = 0;
    let decided = 0;
    let first = 0;
    let turns = 0;
    for (let i = 0; i < MATCHES; i++) {
      const [a, b] = teams(random() < 0.5 ? 4 : 5);
      const result = play(a, b, `match ${i}`);
      turns += result.state.turn - 1;
      if (result.state.winner === result.first) first++;
      if (stars(a) === stars(b)) continue;
      decided++;
      if (result.state.winner === (stars(a) > stars(b) ? "a" : "b")) richer++;
    }
    const measured = { richer: richer / decided, first: first / MATCHES, turns: turns / MATCHES };
    console.log(`balance: richer team wins ${(measured.richer * 100).toFixed(1)}%, first mover wins ${(measured.first * 100).toFixed(1)}%, ${measured.turns.toFixed(1)} turns a match`);
    expect(measured.richer).toBeGreaterThanOrEqual(0.45);
    expect(measured.richer).toBeLessThanOrEqual(0.6);
    expect(measured.first).toBeGreaterThanOrEqual(0.47);
    expect(measured.first).toBeLessThanOrEqual(0.53);
  });
});
