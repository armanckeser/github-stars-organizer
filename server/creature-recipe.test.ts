import { describe, expect, test } from "vitest";
import { fighterFor, type RepoFacts } from "./battle.ts";
import { creatureRecipe } from "./creature-recipe.ts";
import type { RunFighter } from "./run/rules.ts";
import { card } from "./run/testbed.ts";
import type { Card } from "./run/types.ts";

const NOW = Date.parse("2026-11-10T00:00:00Z");

function repo(fullName: string, extra: Partial<RepoFacts> = {}) {
  const facts: RepoFacts = {
    fullName, description: null, stars: 5000, forks: 300, language: "Python", color: "#3572A5", avatarUrl: null,
    isArchived: false, createdAt: "2022-01-01T00:00:00Z", pushedAt: "2026-11-07T00:00:00Z", openIssues: 50, closedIssues: 450, releases: 12, contributors: 40, commits: 2000, ...extra,
  };
  return fighterFor(facts, "greendale", NOW);
}

// Stats that put a card in each role (stats.ts roleOf): toughness well over its attack and
// speed, under them, between, or a reach over 1.
const ROLE_STATS = {
  tank: { hp: 300 },
  bruiser: {},
  assassin: { hp: 130, guard: 40, attack: 140 },
  ranged: { range: 3 },
} satisfies Record<string, Partial<Card>>;
type Role = keyof typeof ROLE_STATS;

function inRun(fullName: string, role: Role, over: Partial<Card> = {}, description: string | null = null): RunFighter {
  return { ...repo(fullName, { description }), card: card(fullName, { ...ROLE_STATS[role], ...over }) };
}

// Enough names with no telling word that every body a role may take turns up.
const STUDY_GROUP = Array.from({ length: 60 }, (_, i) => `greendale/study-group-${i}`);
const bodiesFor = (role: Role) => new Set(STUDY_GROUP.map((fullName) => creatureRecipe(inRun(fullName, role)).body.plan));

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

  test.each([
    ["tank", ["golem", "turtle", "warden"]],
    ["bruiser", ["critter", "brawler", "rhino"]],
    ["assassin", ["bird", "fox", "imp"]],
    ["ranged", ["wisp", "orb", "tome"]],
  ] as const)("gives %s cards only that role's bodies, when the repo has no telling word", (role, bodies) => {
    // Regression guarded: a card's body came from its words alone, so a tank and an assassin
    // could share a silhouette and the board said nothing about who holds the front.
    expect(bodiesFor(role)).toEqual(new Set(bodies));
  });

  test("shares no body between two roles, when every role's cards are drawn", () => {
    const drawn = (["tank", "bruiser", "assassin", "ranged"] as const).map(bodiesFor);
    const everyBody = drawn.flatMap((bodies) => [...bodies]);
    expect(new Set(everyBody).size).toBe(everyBody.length);
    expect(everyBody.length).toBe(12);
  });

  test.each([
    ["greendale/shirley-archive", "tank", "turtle"],
    ["greendale/britta-quick", "assassin", "fox"],
    ["greendale/vicki-site", "ranged", "orb"],
  ] as const)("gives %s (%s) the %s body, when a word picks one of its role's bodies", (fullName, role, plan) => {
    expect(creatureRecipe(inRun(fullName, role)).body.plan).toBe(plan);
  });

  test.each([
    ["greendale/troy-shell", "tank", ["golem", "turtle", "warden"]],
    ["greendale/abed-vault", "assassin", ["bird", "fox", "imp"]],
  ] as const)("keeps %s within the %s bodies, when its word names another role's body", (fullName, role, bodies) => {
    // A word only chooses within the role: "shell" is a wisp's word and "vault" a warden's.
    expect(bodies).toContain(creatureRecipe(inRun(fullName, role, {}, "A command runner")).body.plan);
  });

  test.each([
    [0, { lit: 1, tier: "#8b949e" }],
    [2, { lit: 3, tier: "#4a90d9" }],
    [4, { lit: 5, tier: "#e3b341" }],
  ] as const)("lights the sash for a card of rarity %i as %o, when the card is in a run", (rarity, sash) => {
    // Regression guarded: a card's cost showed only on its card face, so the board gave no way to tell a 1-gold card from a 5.
    expect(creatureRecipe(inRun("greendale/koosh", "bruiser", { rarity })).sash).toEqual(sash);
  });

  test("wears no sash, when the repo has no card (the one-on-one battle)", () => {
    expect(creatureRecipe(repo("greendale/koosh")).sash).toBeNull();
  });
});
