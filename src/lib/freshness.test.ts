import { describe, expect, it } from "vitest";
import { freshnessOf } from "./freshness";

const NOW = Date.parse("2026-10-26T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("freshnessOf", () => {
  it("buckets by days since the last push", () => {
    expect(freshnessOf(daysAgo(10), NOW)).toBe("active");
    expect(freshnessOf(daysAgo(200), NOW)).toBe("aging");
    expect(freshnessOf(daysAgo(400), NOW)).toBe("stale");
    expect(freshnessOf(daysAgo(800), NOW)).toBe("dormant");
  });

  it("puts the boundary day in the older bucket, as the chart does", () => {
    expect(freshnessOf(daysAgo(180), NOW)).toBe("aging");
  });

  it("treats a repo with no push date as dormant", () => {
    expect(freshnessOf(null, NOW)).toBe("dormant");
  });
});
