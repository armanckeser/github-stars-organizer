import { repoCollection, listCollection, listItemCollection, repoTagCollection, type Repo } from "./collections";
import type { PublicList } from "./github-lists";
import { toListRows } from "./github-list-rows";

// Unauthenticated requests get 60 an hour per IP, so the demo reads at most the
// 500 most recent stars (5 requests). Lists and the health score both need
// GraphQL, which needs a token: Lists come from the demo's Worker (worker/),
// which holds one, and the health score is left out.
const MAX_PAGES = 5;

export type LoadedUser = { stars: number; lists: number | "unavailable" };

// Null when the Worker can't be reached, as on a copy of the demo without one:
// the stars still load, just without Lists.
async function fetchLists(username: string): Promise<PublicList[] | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/lists?user=${encodeURIComponent(username)}`);
    if (!response.ok) return null;
    return ((await response.json()) as { lists: PublicList[] }).lists;
  } catch {
    return null;
  }
}

type RestStar = {
  starred_at: string;
  repo: {
    id: number; node_id: string; name: string; full_name: string; owner: { login: string };
    description: string | null; html_url: string; homepage: string | null; language: string | null;
    stargazers_count: number; forks_count: number; topics?: string[]; archived: boolean;
    pushed_at: string | null; created_at: string | null;
  };
};

export async function loadUserStars(username: string, onProgress: (status: string) => void): Promise<LoadedUser> {
  // Started first and awaited last: GitHub takes seconds to answer the Lists query.
  const listsRequest = fetchLists(username);
  const stars: RestStar[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/starred?per_page=100&page=${page}`,
      { headers: { Accept: "application/vnd.github.star+json" } },
    );
    if (response.status === 404) throw new Error(`No GitHub user called ${username}.`);
    if (response.status === 403 || response.status === 429) {
      throw new Error("GitHub's limit for signed-out requests is 60 an hour. Try again later, or self-host it.");
    }
    if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
    const pageStars = (await response.json()) as RestStar[];
    stars.push(...pageStars);
    onProgress(`Read ${stars.length} stars...`);
    if (pageStars.length < 100) break;
  }
  if (stars.length === 0) throw new Error(`${username} hasn't starred anything public.`);

  const now = new Date().toISOString();
  const repos: Repo[] = stars.map(({ starred_at, repo: r }) => ({
    id: String(r.id),
    github_id: r.id,
    node_id: r.node_id,
    name: r.name,
    full_name: r.full_name,
    owner: r.owner.login,
    description: r.description,
    url: r.html_url,
    homepage: r.homepage || null,
    language: r.language,
    stars: r.stargazers_count,
    forks: r.forks_count,
    topics: r.topics?.length ? r.topics.join(",") : null,
    starred_at,
    notes: null,
    usefulness_rating: null,
    imported_at: now,
    health_score: null,
    health_data: null,
    health_refreshed_at: null,
    is_archived: r.archived,
    pushed_at: r.pushed_at,
    created_at: r.created_at,
  }));

  // Children first, so nothing points at a repo or list that is already gone.
  for (const collection of [repoTagCollection, listItemCollection, listCollection, repoCollection]) {
    const keys = [...collection.keys()];
    if (keys.length > 0) collection.delete(keys);
  }
  repoCollection.insert(repos);

  onProgress("Reading Lists...");
  const publicLists = await listsRequest;
  if (publicLists === null) return { stars: repos.length, lists: "unavailable" };
  const rows = toListRows(publicLists, new Map(repos.map((r) => [r.github_id, r.id])));
  if (rows.lists.length > 0) listCollection.insert(rows.lists);
  if (rows.list_items.length > 0) listItemCollection.insert(rows.list_items);
  return { stars: repos.length, lists: rows.lists.length };
}
