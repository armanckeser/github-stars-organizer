import type { LocalLayer } from "./backup";
import type { Repo, RepoTag, Tag } from "./collections";

// The part of a backup only the browser knows: tags, ratings and notes. GitHub
// ids key it, since browser row ids mean nothing in another browser.

export type LocalRows = { repos: Repo[]; tags: Tag[]; repo_tags: RepoTag[] };

export function captureLocalLayer({ repos, tags, repo_tags }: LocalRows): LocalLayer {
  const githubIdOf = new Map(repos.map((repo) => [repo.id, repo.github_id]));
  return {
    repos: repos
      .filter((repo) => repo.notes || repo.usefulness_rating !== null)
      .map((repo) => ({ githubId: repo.github_id, notes: repo.notes || null, usefulnessRating: repo.usefulness_rating })),
    tags: tags.map(({ id, name, color }) => ({ id, name, color })),
    repoTags: repo_tags.flatMap((repoTag) => {
      const githubId = githubIdOf.get(repoTag.repo_id);
      return githubId === undefined ? [] : [{ githubId, tagId: repoTag.tag_id }];
    }),
  };
}

export type RepoFill = { id: string; notes?: string; usefulness_rating?: number };

export type LocalFill = { repos: RepoFill[]; tags: Tag[]; repo_tags: RepoTag[] };

/**
 * What a backup's local layer adds to this browser: notes and ratings where the
 * repo has none, tags it doesn't have (matched by name), and their repo links.
 * Never overwrites or removes anything, so restoring an old file can't undo newer edits.
 */
export function planLocalFill(layer: LocalLayer, stored: LocalRows, newId: () => string): LocalFill {
  const repoByGithubId = new Map(stored.repos.map((repo) => [repo.github_id, repo]));

  const repos = layer.repos.flatMap((saved): RepoFill[] => {
    const repo = repoByGithubId.get(saved.githubId);
    if (!repo) return [];
    const fill: RepoFill = { id: repo.id };
    if (!repo.notes && saved.notes) fill.notes = saved.notes;
    if (repo.usefulness_rating === null && saved.usefulnessRating !== null) fill.usefulness_rating = saved.usefulnessRating;
    return Object.keys(fill).length > 1 ? [fill] : [];
  });

  const tagIdByName = new Map(stored.tags.map((tag) => [tag.name.toLowerCase(), tag.id]));
  const tags: Tag[] = [];
  const localTagId = new Map<string, string>();
  for (const saved of layer.tags) {
    const existing = tagIdByName.get(saved.name.toLowerCase());
    if (existing) {
      localTagId.set(saved.id, existing);
      continue;
    }
    const tag = { id: newId(), name: saved.name, color: saved.color };
    tags.push(tag);
    tagIdByName.set(tag.name.toLowerCase(), tag.id);
    localTagId.set(saved.id, tag.id);
  }

  const linked = new Set(stored.repo_tags.map((repoTag) => `${repoTag.repo_id}:${repoTag.tag_id}`));
  const repo_tags = layer.repoTags.flatMap((saved): RepoTag[] => {
    const repo = repoByGithubId.get(saved.githubId);
    const tagId = localTagId.get(saved.tagId);
    if (!repo || !tagId) return [];
    const key = `${repo.id}:${tagId}`;
    if (linked.has(key)) return [];
    linked.add(key);
    return [{ id: newId(), repo_id: repo.id, tag_id: tagId }];
  });

  return { repos, tags, repo_tags };
}
