import { describe, expect, test } from "vitest";
import { fighterFor, type RepoFacts } from "./battle.ts";
import { PLANS, creatureRecipe } from "./creature-recipe.ts";
import { creatureSticker } from "./creature-sticker.ts";

const NOW = Date.parse("2026-11-10T00:00:00Z");

function recipeOf(fullName: string, description: string | null) {
  const facts: RepoFacts = {
    fullName, description, stars: 5000, forks: 300, language: "Python", color: "#3572A5", avatarUrl: null,
    isArchived: false, createdAt: "2022-01-01T00:00:00Z", pushedAt: "2026-11-07T00:00:00Z", openIssues: 50, closedIssues: 450, releases: 12, contributors: 40, commits: 2000,
  };
  return creatureRecipe(fighterFor(facts, "greendale", NOW));
}

// Every body under every emblem, through names that pick them.
const BODY_WORDS = ["bot", "cli", "web", "data", "docs", "app"];
const EMBLEM_WORDS = ["stars", "budget", "photo", "auth", "fast", "love", "map", "cloud", "tool"];
const RECIPES = BODY_WORDS.flatMap((body) => EMBLEM_WORDS.map((emblem) => recipeOf(`greendale/${body}-x`, `A ${emblem} thing`)));

describe("a creature's sticker", () => {
  test("covers every body and every emblem, when drawn from the test's repos", () => {
    expect(new Set(RECIPES.map((recipe) => recipe.body.plan))).toEqual(new Set(PLANS));
    expect(new Set(RECIPES.map((recipe) => recipe.emblem)).size).toBe(EMBLEM_WORDS.length);
  });

  test("has only real numbers in it, when any body is drawn with any emblem", () => {
    // Not a seen regression: no body here is drawn edge-on today. resvg drops a whole picture with one NaN in it,
    // so this holds the drawing to real numbers for every body and emblem.
    for (const recipe of RECIPES) expect(creatureSticker(recipe, { x: 0, y: 0, size: 200 })).not.toMatch(/NaN|Infinity/);
  });

  test("is a square svg at the place it is given, when placed", () => {
    expect(creatureSticker(RECIPES[0], { x: 12, y: 30, size: 186 })).toMatch(/^<svg x="12" y="30" width="186" height="186" viewBox="-1 -1 2 2">/);
  });
});
