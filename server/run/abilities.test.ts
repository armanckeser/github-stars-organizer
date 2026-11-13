import { describe, expect, it } from "vitest";
import { ABILITIES, abilityFor, abilityHooks } from "./abilities.ts";
import { signalsOf, type CardFacts } from "./stats.ts";
import { greendale, missingEffect, trial } from "./testbed.ts";

const NOW = Date.parse("2026-11-10T00:00:00Z");
const repo = (over: Partial<CardFacts> = {}): CardFacts => ({
  fullName: "greendale/study-group", description: null, stars: 50, forks: 2, language: "TypeScript", color: null, avatarUrl: null, isArchived: false,
  createdAt: "2022-01-01T00:00:00Z", pushedAt: "2026-09-01T00:00:00Z", openIssues: 10, closedIssues: 5, releases: 0, contributors: 12, commits: 900, commitsYear: 100, ...over,
});

describe("each ability in a fight", () => {
  it.each(ABILITIES.map((ability) => [ability.id, ability] as const))("%s shows its effect in the events", (id, ability) => {
    expect(missingEffect(trial(greendale({ ability: id })), trial(greendale()), id, ability.effects)).toBeNull();
  });
});

describe("abilities", () => {
  it("has about two dozen, with unique ids, covering all five triggers", () => {
    expect(ABILITIES.length).toBeGreaterThanOrEqual(22);
    expect(new Set(ABILITIES.map((ability) => ability.id)).size).toBe(ABILITIES.length);
    expect(new Set(ABILITIES.map((ability) => ability.on))).toEqual(new Set(["start", "hit", "hurt", "ally-faint", "third"]));
  });

  it("gives the same repo the same ability every time, one it qualifies for", () => {
    const solo = repo({ contributors: 1 });
    const id = abilityFor(signalsOf(solo, NOW), solo.fullName);
    expect(abilityFor(signalsOf(solo, NOW), solo.fullName)).toBe(id);
    expect(ABILITIES.find((ability) => ability.id === id)?.fits(signalsOf(solo, NOW))).toBe(true);
  });

  it("gives a repo that qualifies for nothing its type's ability", () => {
    const plain = repo({ language: "Rust", contributors: 12, forks: 2, stars: 150, pushedAt: "2026-09-01T00:00:00Z", createdAt: "2022-01-01T00:00:00Z" });
    expect(abilityFor(signalsOf(plain, NOW), plain.fullName)).toBe("legacy-code");
  });

  it("gives Hotfix only to a repo pushed in the last week", () => {
    const hotfix = ABILITIES.find((ability) => ability.id === "hotfix")!;
    expect(hotfix.fits(signalsOf(repo({ pushedAt: "2026-11-05T00:00:00Z" }), NOW))).toBe(true);
    expect(hotfix.fits(signalsOf(repo({ pushedAt: "2026-10-20T00:00:00Z" }), NOW))).toBe(false);
  });

  it("carries no hooks for an id it does not know", () => {
    expect(abilityHooks("none")).toEqual([]);
  });
});
