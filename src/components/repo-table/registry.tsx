import type { Repo, StarList } from "@/lib/collections";
import { FRESHNESS_BUCKETS, freshnessOf } from "@/lib/freshness";
import type { ItemGroup } from "@/components/views/data-table";
import {
  createAutoRegistry,
  mergeWithAutoRegistry,
  createThreeStateFilter,
  matchThreeState,
  matchThreeStateArray,
} from "@/components/views/data-table";

function parseTopics(repo: Repo): string[] {
  return repo.topics?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
}

function groupByTopics(items: Repo[]): ItemGroup<Repo>[] {
  const groups = new Map<string, Repo[]>();
  const untagged: Repo[] = [];

  for (const repo of items) {
    const topics = parseTopics(repo);
    if (topics.length === 0) {
      untagged.push(repo);
    } else {
      const existing = groups.get(topics[0]) ?? [];
      existing.push(repo);
      groups.set(topics[0], existing);
    }
  }

  const sorted = Array.from(groups.entries()).sort(
    ([, a], [, b]) => b.length - a.length,
  );

  const result: ItemGroup<Repo>[] = sorted.map(([topic, repos]) => ({
    groupId: topic,
    label: topic,
    items: repos,
  }));

  if (untagged.length > 0) {
    result.push({ groupId: "untagged", label: "No topics", items: untagged });
  }

  return result;
}

function groupByLanguage(items: Repo[]): ItemGroup<Repo>[] {
  const groups = new Map<string, Repo[]>();
  const unknown: Repo[] = [];

  for (const repo of items) {
    if (repo.language) {
      const existing = groups.get(repo.language) ?? [];
      existing.push(repo);
      groups.set(repo.language, existing);
    } else {
      unknown.push(repo);
    }
  }

  const sorted = Array.from(groups.entries()).sort(
    ([, a], [, b]) => b.length - a.length,
  );

  const result: ItemGroup<Repo>[] = sorted.map(([language, repos]) => ({
    groupId: language,
    label: language,
    items: repos,
  }));

  if (unknown.length > 0) {
    result.push({ groupId: "unknown", label: "Unknown", items: unknown });
  }

  return result;
}

function groupByFreshness(items: Repo[]): ItemGroup<Repo>[] {
  const now = Date.now();
  return FRESHNESS_BUCKETS
    .map((b) => ({ groupId: b.id, label: b.label, items: items.filter((r) => freshnessOf(r.pushed_at, now) === b.id) }))
    .filter((g) => g.items.length > 0);
}

// Value used for stars that sit in no List. GitHub's own stars page has no way to show
// these (community discussions #8611, #49679), which is the gap this filter fills.
export const NO_LIST = "none";

export type ListContext = {
  lists: StarList[];
  // repo id -> ids of the Lists that repo is in; a repo missing from the map is in none
  listIdsByRepo: Map<string, string[]>;
};

function repoListValues(repo: Repo, ctx: ListContext): string[] {
  const ids = ctx.listIdsByRepo.get(repo.id) ?? [];
  return ids.length > 0 ? ids : [NO_LIST];
}

function groupByList(ctx: ListContext) {
  const nameById = new Map(ctx.lists.map((l) => [l.id, l.name]));
  return (items: Repo[]): ItemGroup<Repo>[] => {
    const groups = new Map<string, Repo[]>();
    for (const repo of items) {
      // A repo in several Lists appears once, under its first List, like topics above
      const key = repoListValues(repo, ctx)[0];
      const existing = groups.get(key) ?? [];
      existing.push(repo);
      groups.set(key, existing);
    }
    const unlisted = groups.get(NO_LIST);
    groups.delete(NO_LIST);
    const result: ItemGroup<Repo>[] = Array.from(groups.entries())
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([id, repos]) => ({ groupId: id, label: nameById.get(id) ?? id, items: repos }));
    // Unlisted goes first: it's the pile people open this view to sort through
    if (unlisted) result.unshift({ groupId: NO_LIST, label: "Not in any list", items: unlisted });
    return result;
  };
}

// Auto-infer filters + sorts from the Repo shape, then override what needs customization
export function buildRepoRegistry(sampleItems: Repo[], listContext?: ListContext) {
  const auto = createAutoRegistry<Repo>(sampleItems, {
    exclude: [
      "id", "github_id", "node_id", "url", "homepage",
      "imported_at", "health_data", "health_refreshed_at",
    ],
  });

  return mergeWithAutoRegistry<Repo>(
    auto,
    {
      // Override language to add group-by
      language: createThreeStateFilter<Repo>({
        id: "language",
        label: "Language",
        urlParam: "language",
        options: {
          source: "items",
          derive: (items) => {
            const counts = new Map<string, number>();
            for (const repo of items) {
              if (repo.language) counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1);
            }
            return Array.from(counts.entries())
              .sort(([, a], [, b]) => b - a)
              .map(([lang, count]) => ({ value: lang, label: `${lang} (${count})` }));
          },
        },
        match: (repo, filter) => matchThreeState(repo.language, filter),
        groupBy: { grouper: groupByLanguage },
      }),

      // Override archived to default to active-only
      is_archived: createThreeStateFilter<Repo>({
        id: "is_archived",
        label: "Archived",
        urlParam: "archived",
        options: {
          source: "static",
          values: [
            { value: "true", label: "Archived" },
            { value: "false", label: "Active" },
          ],
        },
        defaultValue: { mode: "include", values: ["false"] },
        match: (repo, filter) =>
          matchThreeState(String(repo.is_archived), filter),
      }),

      // Days since the last push, in Explore's buckets
      freshness: createThreeStateFilter<Repo>({
        id: "freshness",
        label: "Freshness",
        urlParam: "freshness",
        options: {
          source: "static",
          values: FRESHNESS_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
        },
        match: (repo, filter) => matchThreeState(freshnessOf(repo.pushed_at), filter),
        groupBy: { grouper: groupByFreshness },
      }),

      // Topics is a comma-separated string, needs custom parsing
      topics: createThreeStateFilter<Repo>({
        id: "topics",
        label: "Topics",
        urlParam: "topics",
        options: {
          source: "items",
          derive: (items) => {
            const topicCounts = new Map<string, number>();
            for (const repo of items) {
              for (const topic of parseTopics(repo)) {
                topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
              }
            }
            return Array.from(topicCounts.entries())
              .sort(([, a], [, b]) => b - a)
              .map(([topic, count]) => ({ value: topic, label: `${topic} (${count})` }));
          },
        },
        match: (repo, filter) => matchThreeStateArray(parseTopics(repo), filter),
        groupBy: { grouper: groupByTopics },
      }),

      ...(listContext
        ? {
            lists: createThreeStateFilter<Repo>({
              id: "lists",
              label: "List",
              urlParam: "lists",
              options: {
                source: "items",
                derive: (items) => {
                  const counts = new Map<string, number>();
                  for (const repo of items) {
                    for (const id of repoListValues(repo, listContext)) {
                      counts.set(id, (counts.get(id) ?? 0) + 1);
                    }
                  }
                  const unlisted = counts.get(NO_LIST) ?? 0;
                  return [
                    { value: NO_LIST, label: `Not in any list (${unlisted})` },
                    ...listContext.lists
                      .map((l) => ({ list: l, count: counts.get(l.id) ?? 0 }))
                      .sort((a, b) => b.count - a.count)
                      .map(({ list, count }) => ({ value: list.id, label: `${list.name} (${count})` })),
                  ];
                },
              },
              match: (repo, filter) => matchThreeStateArray(repoListValues(repo, listContext), filter),
              groupBy: { grouper: groupByList(listContext) },
            }),
          }
        : {}),
    },
  );
}

// For backwards compat — static registry built from an empty array gives the manual overrides
// Real apps should call buildRepoRegistry(items) with actual data
const staticResult = buildRepoRegistry([]);
export const REPO_FILTER_REGISTRY = staticResult.registry;
export type RepoFilterId = string;
export const REPO_SORT_DEFINITIONS = staticResult.sortDefinitions;

export const DEFAULT_SORT = "stars-high";
export const DEFAULT_GROUP_BY: RepoFilterId | "none" = "none";

export function repoSearchFields(repo: Repo): string[] {
  return [
    repo.full_name,
    repo.description ?? "",
    repo.language ?? "",
    repo.topics ?? "",
    repo.owner,
    repo.notes ?? "",
  ];
}
