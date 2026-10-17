import type { Repo, StarList, ListItem, RepoTag } from "./collections";
import type { GitHubRepo, ImportResponse } from "./local-api";

// Pure: folds a fresh read of GitHub into the rows the npx build stored in the
// browser. GitHub owns stars and Lists; the browser owns tags, ratings, notes
// and health scores. local-sync.ts applies the plan.

export type StoredRows = { repos: Repo[]; lists: StarList[]; list_items: ListItem[]; repo_tags: RepoTag[] };

export type ImportPlan = {
  insert: { repos: Repo[]; lists: StarList[]; list_items: ListItem[] };
  update: { repos: Repo[]; lists: StarList[] };
  remove: { repos: string[]; lists: string[]; list_items: string[]; repo_tags: string[] };
};

const GITHUB_REPO_FIELDS = [
  "github_id", "node_id", "name", "full_name", "owner", "description", "url", "homepage",
  "language", "stars", "forks", "topics", "starred_at", "is_archived", "pushed_at", "created_at",
] as const satisfies readonly (keyof GitHubRepo)[];

function githubFieldsChanged(stored: Repo, incoming: GitHubRepo): boolean {
  return GITHUB_REPO_FIELDS.some((field) => stored[field] !== incoming[field]);
}

function listChanged(stored: StarList, incoming: StarList): boolean {
  return stored.name !== incoming.name
    || stored.description !== incoming.description
    || stored.is_private !== incoming.is_private;
}

function planRepos(stored: Repo[], incoming: GitHubRepo[], importedAt: string) {
  const storedByGithubId = new Map(stored.map((repo) => [repo.github_id, repo]));
  const insert: Repo[] = [];
  const update: Repo[] = [];
  const idByGithubId = new Map<number, string>();
  for (const github of incoming) {
    const existing = storedByGithubId.get(github.github_id);
    if (!existing) {
      const id = String(github.github_id);
      insert.push({
        ...github, id, notes: null, usefulness_rating: null, imported_at: importedAt,
        health_score: null, health_data: null, health_refreshed_at: null,
      });
      idByGithubId.set(github.github_id, id);
      continue;
    }
    idByGithubId.set(github.github_id, existing.id);
    if (githubFieldsChanged(existing, github)) update.push({ ...existing, ...github });
  }
  const remove = stored.filter((repo) => !idByGithubId.has(repo.github_id)).map((repo) => repo.id);
  return { insert, update, remove, idByGithubId };
}

function planLists(stored: StarList[], incoming: ImportResponse["lists"]) {
  const storedByGithubId = new Map(stored.flatMap((list) => (list.github_list_id ? [[list.github_list_id, list] as const] : [])));
  const insert: StarList[] = [];
  const update: StarList[] = [];
  const idByGithubId = new Map<string, string>();
  for (const github of incoming) {
    const existing = storedByGithubId.get(github.id);
    const row: StarList = {
      id: existing?.id ?? github.id,
      github_list_id: github.id,
      name: github.name,
      description: github.description,
      is_private: github.isPrivate,
      created_at: github.createdAt,
      updated_at: github.updatedAt,
    };
    idByGithubId.set(github.id, row.id);
    if (!existing) insert.push(row);
    else if (listChanged(existing, row)) update.push(row);
  }
  // A List without a GitHub id is one created this session whose id is still
  // being written back; it is not a List deleted on GitHub.
  const remove = stored
    .filter((list) => list.github_list_id !== null && !idByGithubId.has(list.github_list_id))
    .map((list) => list.id);
  return { insert, update, remove, idByGithubId };
}

/**
 * Folds a fresh read of GitHub into the rows the browser stored.
 *
 * Repos keep their notes, rating and health score; repos no longer starred go,
 * with their tags and List memberships. Lists and memberships follow GitHub.
 */
export function planImport(stored: StoredRows, incoming: ImportResponse, importedAt: string): ImportPlan {
  const repos = planRepos(stored.repos, incoming.repos, importedAt);
  const lists = planLists(stored.lists, incoming.lists);

  const wantedItems = new Map<string, ListItem>();
  for (const github of incoming.lists) {
    const listId = lists.idByGithubId.get(github.id)!;
    github.repoGithubIds.forEach((repoGithubId, position) => {
      const repoId = repos.idByGithubId.get(repoGithubId);
      if (!repoId) return;
      const key = `${listId}:${repoId}`;
      wantedItems.set(key, { id: key, list_id: listId, repo_id: repoId, position, added_at: github.updatedAt });
    });
  }
  const syncedListIds = new Set(lists.idByGithubId.values());
  const removedListIds = new Set(lists.remove);
  const removedRepoIds = new Set(repos.remove);
  const storedItemKeys = new Set<string>();
  const removeItems: string[] = [];
  for (const item of stored.list_items) {
    const key = `${item.list_id}:${item.repo_id}`;
    storedItemKeys.add(key);
    const orphaned = removedListIds.has(item.list_id) || removedRepoIds.has(item.repo_id);
    const droppedOnGitHub = syncedListIds.has(item.list_id) && !wantedItems.has(key);
    if (orphaned || droppedOnGitHub) removeItems.push(item.id);
  }

  return {
    insert: {
      repos: repos.insert,
      lists: lists.insert,
      list_items: [...wantedItems].filter(([key]) => !storedItemKeys.has(key)).map(([, item]) => item),
    },
    update: { repos: repos.update, lists: lists.update },
    remove: {
      repos: repos.remove,
      lists: lists.remove,
      list_items: removeItems,
      repo_tags: stored.repo_tags.filter((tag) => removedRepoIds.has(tag.repo_id)).map((tag) => tag.id),
    },
  };
}
