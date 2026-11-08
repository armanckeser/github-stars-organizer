import { describe, expect, it } from "vitest";
import { buildWaves, isQuiet, kindsByRepo, OTHER, quarterOf, topicsOf } from "./star-waves";

const NOW = Date.parse("2026-11-07T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

let n = 0;
function repo(topics: string | null, starred: string, extra: Partial<{ created_at: string; pushed_at: string | null; is_archived: boolean }> = {}) {
  n += 1;
  return {
    id: `r${n}`,
    topics,
    starred_at: starred,
    created_at: extra.created_at ?? starred,
    pushed_at: extra.pushed_at === undefined ? daysAgo(5) : extra.pushed_at,
    is_archived: extra.is_archived ?? false,
  };
}

describe("isQuiet", () => {
  it("counts archived repos and repos with no push in six months as quiet", () => {
    expect(isQuiet({ is_archived: true, pushed_at: daysAgo(1) }, NOW)).toBe(true);
    expect(isQuiet({ is_archived: false, pushed_at: daysAgo(200) }, NOW)).toBe(true);
    expect(isQuiet({ is_archived: false, pushed_at: daysAgo(30) }, NOW)).toBe(false);
  });
});

describe("quarterOf", () => {
  it("names the calendar quarter", () => {
    expect(quarterOf("2025-02-10T00:00:00Z")).toBe("2025 Q1");
    expect(quarterOf("2025-12-31T00:00:00Z")).toBe("2025 Q4");
  });
});

describe("kindsByRepo", () => {
  it("gives each repo the label most repos share", () => {
    const repos = [
      repo("mcp,ai", "2025-01-01T00:00:00Z"),
      repo("mcp", "2025-01-02T00:00:00Z"),
      repo("mcp,cli", "2025-01-03T00:00:00Z"),
      repo("cli", "2025-01-04T00:00:00Z"),
    ];
    const kinds = kindsByRepo(repos, topicsOf);
    expect(kinds.get(repos[0].id)).toBe("mcp");
    expect(kinds.get(repos[2].id)).toBe("mcp");
    // One repo is too few for its own panel.
    expect(kinds.get(repos[3].id)).toBe(OTHER);
  });

  it("puts repos with no label under Other", () => {
    const repos = [repo(null, "2025-01-01T00:00:00Z")];
    expect(kindsByRepo(repos, topicsOf).get(repos[0].id)).toBe(OTHER);
  });

  it("groups by any labels, such as Lists", () => {
    const repos = [repo(null, "2025-01-01T00:00:00Z"), repo(null, "2025-01-02T00:00:00Z"), repo(null, "2025-01-03T00:00:00Z")];
    const kinds = kindsByRepo(repos, () => ["Terminal"]);
    expect([...kinds.values()]).toEqual(["Terminal", "Terminal", "Terminal"]);
  });
});

describe("buildWaves", () => {
  it("fills every quarter between the first and last star, counting active and quiet", () => {
    const repos = [
      repo("mcp", "2025-01-10T00:00:00Z"),
      repo("mcp", "2025-01-11T00:00:00Z", { is_archived: true }),
      repo("mcp", "2025-07-01T00:00:00Z"),
    ];
    const waves = buildWaves(repos, topicsOf, "starred", NOW);
    expect(waves.quarters).toEqual(["2025 Q1", "2025 Q2", "2025 Q3"]);
    expect(waves.kinds[0]).toMatchObject({ name: "mcp", total: 3, active: 2, quiet: 1 });
    expect(waves.kinds[0].counts).toEqual([[1, 1], [0, 0], [1, 0]]);
  });

  it("buckets by creation date on the created axis", () => {
    const repos = [
      repo("mcp", "2026-01-01T00:00:00Z", { created_at: "2023-05-01T00:00:00Z" }),
      repo("mcp", "2026-01-01T00:00:00Z", { created_at: "2023-05-02T00:00:00Z" }),
      repo("mcp", "2026-01-01T00:00:00Z", { created_at: "2023-05-03T00:00:00Z" }),
    ];
    expect(buildWaves(repos, topicsOf, "created", NOW).quarters).toEqual(["2023 Q2"]);
  });

  it("returns nothing for no dated repos", () => {
    expect(buildWaves([], topicsOf, "starred", NOW)).toEqual({ quarters: [], kinds: [] });
  });
});
