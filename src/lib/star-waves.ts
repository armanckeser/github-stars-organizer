// The kinds of repos someone starred, quarter by quarter (issue #29), grouped
// by whatever labels the caller picks: Lists, topics, language or tags.

export type WaveAxis = "starred" | "created";

export type WaveRepo = {
  id: string;
  topics: string | null;
  starred_at: string | null;
  created_at: string | null;
  pushed_at: string | null;
  is_archived: boolean;
};

export type WaveKind = {
  name: string;
  total: number;
  active: number;
  quiet: number;
  // One entry per quarter in `quarters`: [active, quiet].
  counts: [number, number][];
};

export type Waves = { quarters: string[]; kinds: WaveKind[] };

const QUIET_AFTER_MS = 182 * 86_400_000;
const MAX_KINDS = 8;
const MIN_KIND_SIZE = 3;
export const OTHER = "Other";

export function isQuiet(repo: Pick<WaveRepo, "is_archived" | "pushed_at">, now: number): boolean {
  if (repo.is_archived) return true;
  if (!repo.pushed_at) return true;
  return now - Date.parse(repo.pushed_at) >= QUIET_AFTER_MS;
}

export function quarterOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()} Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export function topicsOf(repo: { topics: string | null }): string[] {
  return repo.topics ? repo.topics.split(",").map((t) => t.trim()).filter(Boolean) : [];
}

// Each repo gets one kind: of its labels (Lists, topics, tags...), the one most
// repos share. The biggest kinds get a panel; the rest go under Other.
export function kindsByRepo(repos: WaveRepo[], labelsOf: (repo: WaveRepo) => string[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const r of repos) for (const label of labelsOf(r)) count.set(label, (count.get(label) ?? 0) + 1);
  const kinds = new Map<string, string>();
  for (const r of repos) {
    let top: string | null = null;
    for (const label of labelsOf(r)) {
      if (top === null || (count.get(label) ?? 0) > (count.get(top) ?? 0)) top = label;
    }
    kinds.set(r.id, top ?? OTHER);
  }
  const size = new Map<string, number>();
  for (const k of kinds.values()) size.set(k, (size.get(k) ?? 0) + 1);
  const keep = new Set(
    [...size.entries()]
      .filter(([k, n]) => k !== OTHER && n >= MIN_KIND_SIZE)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_KINDS)
      .map(([k]) => k),
  );
  for (const [id, k] of kinds) if (!keep.has(k)) kinds.set(id, OTHER);
  return kinds;
}

export function buildWaves(
  repos: WaveRepo[],
  labelsOf: (repo: WaveRepo) => string[],
  axis: WaveAxis,
  now: number,
): Waves {
  const dated = repos.filter((r) => (axis === "starred" ? r.starred_at : r.created_at));
  if (dated.length === 0) return { quarters: [], kinds: [] };
  const kinds = kindsByRepo(dated, labelsOf);
  const dateOf = (r: WaveRepo) => (axis === "starred" ? r.starred_at : r.created_at)!;

  const keys = dated.map((r) => quarterOf(dateOf(r))).sort();
  const quarters: string[] = [];
  let [year, q] = keys[0].split(" Q").map(Number);
  const last = keys[keys.length - 1];
  for (;;) {
    const key = `${year} Q${q}`;
    quarters.push(key);
    if (key === last) break;
    q += 1;
    if (q > 4) { q = 1; year += 1; }
  }
  const index = new Map(quarters.map((k, i) => [k, i]));

  const byKind = new Map<string, WaveKind>();
  for (const r of dated) {
    const name = kinds.get(r.id) ?? OTHER;
    let kind = byKind.get(name);
    if (!kind) {
      kind = { name, total: 0, active: 0, quiet: 0, counts: quarters.map(() => [0, 0]) };
      byKind.set(name, kind);
    }
    const quiet = isQuiet(r, now) ? 1 : 0;
    kind.total += 1;
    kind.quiet += quiet;
    kind.active += 1 - quiet;
    kind.counts[index.get(quarterOf(dateOf(r)))!][quiet] += 1;
  }
  // Biggest first, Other last.
  const sorted = [...byKind.values()].sort((a, b) =>
    a.name === OTHER ? 1 : b.name === OTHER ? -1 : b.total - a.total,
  );
  return { quarters, kinds: sorted };
}

// The quarter with the most stars for the biggest kind, for the chart title.
export function peakOf(kind: WaveKind, quarters: string[]): string {
  let best = 0;
  kind.counts.forEach(([a, q], i) => {
    const [ba, bq] = kind.counts[best];
    if (a + q > ba + bq) best = i;
  });
  return quarters[best];
}
