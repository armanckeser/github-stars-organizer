import { describe, expect, it } from "vitest";
import { cardFor, rarityOf, statPoints, type CardFacts } from "./stats.ts";

const NOW = Date.parse("2026-11-10T00:00:00Z");
const repo = (over: Partial<CardFacts> = {}): CardFacts => ({
  fullName: "greendale/study-group",
  description: null,
  stars: 50,
  forks: 2,
  language: "TypeScript",
  color: null,
  avatarUrl: null,
  isArchived: false,
  createdAt: "2022-01-01T00:00:00Z",
  pushedAt: "2026-10-01T00:00:00Z",
  openIssues: 10,
  closedIssues: 30,
  releases: 5,
  contributors: 12,
  commits: 900,
  commitsYear: 200,
  ...over,
});
const total = (points: ReturnType<typeof statPoints>) => points.hp + points.attack + points.guard + points.speed;

describe("rarityOf", () => {
  it.each([
    [0, 0],
    [99, 0],
    [100, 1],
    [999, 1],
    [1000, 2],
    [9999, 2],
    [10_000, 3],
    [99_999, 3],
    [100_000, 4],
    [5_000_000, 4],
  ])("gives %i stars rarity %i", (stars, rarity) => {
    expect(rarityOf(stars)).toBe(rarity);
  });
});

describe("statPoints", () => {
  it.each([
    [10, 400],
    [500, 415],
    [5000, 430],
    [50_000, 445],
    [500_000, 460],
  ])("shares out the whole budget of a %i-star repo: %i points", (stars, budget) => {
    expect(total(statPoints(repo({ stars }), NOW))).toBeCloseTo(budget, 6);
  });

  const extremes: [string, Partial<CardFacts>][] = [
    ["a dead repo with no facts", { contributors: 0, commits: 0, commitsYear: 0, openIssues: 40, closedIssues: 0, releases: 0, createdAt: null, pushedAt: null }],
    ["a giant at every signal", { contributors: 5000, commitsYear: 50_000, openIssues: 0, closedIssues: 9000, releases: 400, createdAt: "2005-01-01T00:00:00Z", pushedAt: "2026-11-09T00:00:00Z" }],
    ["only people", { contributors: 5000, commits: 0, commitsYear: 0, openIssues: 40, closedIssues: 0, releases: 0, createdAt: "2026-11-01T00:00:00Z", pushedAt: "2016-01-01T00:00:00Z" }],
  ];
  it.each(extremes)("keeps every stat between 15%% and 40%% of the budget for %s", (_, over) => {
    const points = statPoints(repo({ stars: 10, ...over }), NOW);
    for (const value of Object.values(points)) {
      expect(value).toBeGreaterThanOrEqual(400 * 0.15);
      expect(value).toBeLessThanOrEqual(400 * 0.4);
    }
  });

  it("gives more of the budget to HP when a repo has more contributors", () => {
    expect(statPoints(repo({ contributors: 400 }), NOW).hp).toBeGreaterThan(statPoints(repo({ contributors: 2 }), NOW).hp);
  });

  it("gives more of the budget to speed when a repo was pushed lately", () => {
    expect(statPoints(repo({ pushedAt: "2026-11-09T00:00:00Z" }), NOW).speed).toBeGreaterThan(statPoints(repo({ pushedAt: "2020-01-01T00:00:00Z" }), NOW).speed);
  });

  it("estimates commits in the last year from commits and age when the count is missing", () => {
    // 900 commits over almost five years is about 184 a year, close to the 200 given above.
    const estimated = statPoints(repo({ commitsYear: undefined }), NOW).attack;
    expect(estimated).toBeCloseTo(statPoints(repo({ commitsYear: 184 }), NOW).attack, 0);
  });
});

describe("cardFor", () => {
  it("makes a repo owned by armanckeser 5% stronger in every stat, and nobody else's", () => {
    const plain = cardFor(repo({ fullName: "greendale/stard" }), NOW);
    const shiny = cardFor(repo({ fullName: "ArmancKeser/stard" }), NOW);
    expect([plain.shiny, shiny.shiny]).toEqual([false, true]);
    for (const stat of ["hp", "attack", "guard", "speed"] as const) expect(shiny[stat] / plain[stat]).toBeCloseTo(1.05, 1);
  });

  it.each([
    ["Python", 3],
    ["Shell", 3],
    ["Rust", 1],
    ["TypeScript", 1],
    [null, 3],
  ])("gives a %s repo range %i", (language, range) => {
    expect(cardFor(repo({ language }), NOW).range).toBe(range);
  });

  it("puts the language and up to two topics in the card's sets, lower-case", () => {
    expect(cardFor(repo({ topics: ["cli", "ai", "web"] }), NOW).sets).toEqual(["typescript", "cli", "ai"]);
    expect(cardFor(repo({ language: null }), NOW).sets).toEqual([]);
  });
});
