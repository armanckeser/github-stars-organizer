import {
  repoCollection, listCollection, listItemCollection, tagCollection, repoTagCollection, writeWithoutSync,
} from "./collections";
import { planImport, type StoredRows } from "./import-plan";
import { localApi } from "./local-api";

// The npx build's import and health scoring: each launch reads everything from
// GitHub and writes the result into the browser's storage without re-sending it.

const ALL_COLLECTIONS = [repoCollection, listCollection, listItemCollection, tagCollection, repoTagCollection];

async function storedRows(): Promise<StoredRows> {
  await Promise.all(ALL_COLLECTIONS.map((collection) => collection.preload()));
  return {
    repos: repoCollection.toArray,
    lists: listCollection.toArray,
    list_items: listItemCollection.toArray,
    repo_tags: repoTagCollection.toArray,
  };
}

export type ImportSummary = { stars: number; lists: number };

export async function importFromGitHub(): Promise<ImportSummary> {
  const incoming = await localApi.importStars();
  const plan = planImport(await storedRows(), incoming, new Date().toISOString());
  await writeWithoutSync(() => {
    // Children before parents on the way out, parents before children on the way in.
    if (plan.remove.repo_tags.length) repoTagCollection.delete(plan.remove.repo_tags);
    if (plan.remove.list_items.length) listItemCollection.delete(plan.remove.list_items);
    if (plan.remove.lists.length) listCollection.delete(plan.remove.lists);
    if (plan.remove.repos.length) repoCollection.delete(plan.remove.repos);
    if (plan.insert.repos.length) repoCollection.insert(plan.insert.repos);
    if (plan.insert.lists.length) listCollection.insert(plan.insert.lists);
    for (const repo of plan.update.repos) repoCollection.update(repo.id, (draft) => { Object.assign(draft, repo); });
    for (const list of plan.update.lists) listCollection.update(list.id, (draft) => { Object.assign(draft, list); });
    if (plan.insert.list_items.length) listItemCollection.insert(plan.insert.list_items);
  });
  return { stars: incoming.repos.length, lists: incoming.lists.length };
}

// The server spaces GitHub calls a second apart per 20 repos, so a chunk of 100
// takes about 5s and progress moves at a readable pace.
const HEALTH_CHUNK = 100;

export type HealthSummary = { scored: number; total: number };

export async function scoreHealth(
  which: "missing" | "all",
  onProgress: (summary: HealthSummary) => void,
): Promise<HealthSummary> {
  await repoCollection.preload();
  const repos = repoCollection.toArray.filter(
    (repo) => repo.node_id !== null && (which === "all" || repo.health_score === null),
  );
  const summary: HealthSummary = { scored: 0, total: repos.length };
  for (let start = 0; start < repos.length; start += HEALTH_CHUNK) {
    const chunk = repos.slice(start, start + HEALTH_CHUNK);
    const idByNodeId = new Map(chunk.map((repo) => [repo.node_id!, repo.id]));
    const { scores } = await localApi.scoreHealth({
      repos: chunk.map((repo) => ({ node_id: repo.node_id!, stars: repo.stars, health_refreshed_at: repo.health_refreshed_at })),
    });
    const refreshedAt = new Date().toISOString();
    await writeWithoutSync(() => {
      for (const score of scores) {
        const id = idByNodeId.get(score.node_id);
        if (!id || !repoCollection.has(id)) continue;
        repoCollection.update(id, (draft) => {
          draft.health_score = score.score;
          draft.health_data = score.data;
          draft.health_refreshed_at = refreshedAt;
          draft.is_archived = score.is_archived;
          draft.stars = score.stars;
        });
      }
    });
    summary.scored += scores.length;
    onProgress({ ...summary });
  }
  return summary;
}
