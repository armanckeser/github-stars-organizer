import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createGitHubClient } from "../../server/github.ts";
import { startFakeGitHub, type FakeGitHub } from "../../scripts/fake-github.ts";
import { buildIndex, formatResults, isStale, readIndex, saveIndex, searchStars, STALE_AFTER_MS, type IndexedStar } from "./search.ts";

const NOW = Date.parse("2026-11-10T00:00:00Z");

function star(fullName: string, extra: Partial<IndexedStar> = {}): IndexedStar {
  return {
    fullName, description: null, language: null, topics: [], stars: 100, isArchived: false,
    pushedAt: "2026-11-01T00:00:00Z", starredAt: "2025-01-01T00:00:00Z", lists: [], ...extra,
  };
}

describe("searchStars", () => {
  const stars = [
    star("pdfjs/pdf.js", { description: "PDF reader in JavaScript", stars: 50_000 }),
    star("someone/doc-tools", { description: "Converts pdf files to markdown", stars: 900 }),
    star("someone/parser-kit", { topics: ["parser"], lists: ["Wrangle Data"], stars: 300 }),
    star("someone/unrelated", { description: "A game engine", stars: 99_000 }),
  ];

  test("ranks a match in the name above one in the description", () => {
    expect(searchStars(stars, "pdf").map((s) => s.fullName)).toEqual(["pdfjs/pdf.js", "someone/doc-tools"]);
  });

  test("matches any of the words, and List names count", () => {
    expect(searchStars(stars, "wrangle pdf").map((s) => s.fullName)).toContain("someone/parser-kit");
  });

  test("finds nothing for a query with no real words", () => {
    expect(searchStars(stars, " , ")).toEqual([]);
  });

  test("stops at the limit", () => {
    expect(searchStars(stars, "pdf parser", 1)).toHaveLength(1);
  });
});

describe("formatResults", () => {
  test("says whether each repo is archived, quiet or active, with its Lists", () => {
    const text = formatResults([
      star("a/archived", { isArchived: true, stars: 12_345 }),
      star("b/quiet", { pushedAt: "2024-01-01T00:00:00Z", lists: ["Dev Workflow", "Learn"] }),
      star("c/active", { description: "x".repeat(150) }),
    ], NOW);
    expect(text).toContain("a/archived · 12k stars · ARCHIVED");
    expect(text).toContain("b/quiet · 100 stars · QUIET, last push 2y ago · Lists: Dev Workflow, Learn");
    expect(text).toContain("c/active · 100 stars · active, last push 9d ago");
    expect(text).toContain(`${"x".repeat(99)}…`);
  });
});

describe("the index on disk", () => {
  let fake: FakeGitHub;
  let home: string;

  beforeEach(async () => {
    fake = await startFakeGitHub({ repoCount: 120, lists: [{ name: "Paintball", repoIndexes: [0, 1] }] });
    home = await mkdtemp(path.join(tmpdir(), "stars-search-"));
  });

  afterEach(async () => {
    await fake.close();
    await rm(home, { recursive: true, force: true });
  });

  test("holds every star, across pages, with its Lists", async () => {
    const index = await buildIndex(createGitHubClient("fake-token", fake.url), "abed-nadir", new Date(NOW));
    expect(index.stars).toHaveLength(120);
    expect(index.stars.filter((s) => s.lists.includes("Paintball"))).toHaveLength(2);
    await saveIndex(home, index);
    expect(await readIndex(home)).toEqual(index);
  });

  test("goes stale after a day, or when there is none", () => {
    const index = { login: "abed-nadir", refreshedAt: new Date(NOW).toISOString(), stars: [] };
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale(index, NOW + STALE_AFTER_MS - 1)).toBe(false);
    expect(isStale(index, NOW + STALE_AFTER_MS)).toBe(true);
  });
});
