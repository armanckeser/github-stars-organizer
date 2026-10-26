// Freshness buckets by days since the last push. Explore's chart and the table's
// Freshness filter share these, so a bar's count matches the rows it opens.
export const FRESHNESS_BUCKETS = [
  { id: "active", label: "Active (<6mo)", maxDays: 180 },
  { id: "aging", label: "Aging (6–12mo)", maxDays: 365 },
  { id: "stale", label: "Stale (1–2yr)", maxDays: 730 },
  { id: "dormant", label: "Dormant (>2yr)", maxDays: Infinity },
] as const;

export type FreshnessId = (typeof FRESHNESS_BUCKETS)[number]["id"];

const DAY_MS = 86_400_000;

// A repo with no push date counts as dormant, as the chart always has.
export function freshnessOf(pushedAt: string | null, now = Date.now()): FreshnessId {
  const days = pushedAt ? (now - new Date(pushedAt).getTime()) / DAY_MS : Infinity;
  return FRESHNESS_BUCKETS.find((b) => days < b.maxDays)?.id ?? "dormant";
}

// Search params that open the stars table on the repos a chart bar counts. Explore
// counts archived repos too, so the link includes them over the table's active-only default.
export function starsLink(filter: Record<string, string>): Record<string, string> {
  return { ...filter, archived: "+true,+false" };
}
