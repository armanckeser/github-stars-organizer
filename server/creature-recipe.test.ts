import { describe, expect, test } from "vitest";
import { fighterFor, type RepoFacts } from "./battle.ts";
import { creatureRecipe } from "./creature-recipe.ts";

const NOW = Date.parse("2026-11-10T00:00:00Z");

function repo(fullName: string, extra: Partial<RepoFacts> = {}) {
  const facts: RepoFacts = {
    fullName, description: null, stars: 5000, forks: 300, language: "Python", color: "#3572A5", avatarUrl: null,
    isArchived: false, createdAt: "2022-01-01T00:00:00Z", pushedAt: "2026-11-07T00:00:00Z", openIssues: 50, closedIssues: 450, releases: 12, contributors: 40, commits: 2000, ...extra,
  };
  return fighterFor(facts, "greendale", NOW);
}

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

describe("a creature's recipe", () => {
  test.each([
    ["greendale/annie-bot", "A mobile game", "golem"],
    ["greendale/paintball", "A command runner", "wisp"],
    ["greendale/abed-web", null, "orb"],
    ["greendale/budget-tracker", null, "bird"],
    ["greendale/britta-docs", null, "tome"],
    ["greendale/pierce", "A mobile game", "critter"],
  ] as const)("gives %s, described as %s, a %s body, when a word says what it is", (fullName, description, plan) => {
    // Regression guarded: a repo's words stopped picking its body, so a bot came out a bird on one picture and a golem in the arena.
    expect(creatureRecipe(repo(fullName, { description })).body.plan).toBe(plan);
  });

  test("floats a coin over a budgeting repo and nothing over one with no such word, when one says budget", () => {
    expect(creatureRecipe(repo("greendale/budget-bot")).emblem).toBe("coin");
    expect(creatureRecipe(repo("greendale/koosh")).emblem).toBeNull();
  });

  test("is the same creature, when the repo's name comes in a different case", () => {
    expect(creatureRecipe(repo("Greendale/Koosh"))).toEqual(creatureRecipe(repo("greendale/koosh")));
  });

  test("paints a retired repo nearly grey, when the repo is archived", () => {
    // A retired creature keeps a fifth of its colour (the 3D model's 80% blend toward grey).
    const spread = (archived: boolean) => {
      const [r, g, b] = channels(creatureRecipe(repo("greendale/shirley", { color: "#e5484d", isArchived: archived })).paints.base);
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    expect(spread(true)).toBeLessThan(50);
    expect(spread(false)).toBeGreaterThan(120);
  });

  test("lifts a near-black language colour, when the language is black", () => {
    // Regression guarded: a black creature lost every detail against the arena's dark floor.
    for (const channel of channels(creatureRecipe(repo("greendale/chang", { color: "#000000" })).paints.base)) expect(channel).toBeGreaterThanOrEqual(160);
  });
});
