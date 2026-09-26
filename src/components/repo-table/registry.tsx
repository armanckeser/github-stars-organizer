import type { Repo } from "@/lib/collections";
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

// Auto-infer filters + sorts from the Repo shape, then override what needs customization
export function buildRepoRegistry(sampleItems: Repo[]) {
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
  ];
}
