import { repoCollection, listCollection, listItemCollection, repoTagCollection, type Repo } from "./collections";

// Unauthenticated requests get 60 an hour per IP, so the demo reads at most the
// 500 most recent stars (5 requests). GitHub Lists and the health score both
// need GraphQL, which needs a token, so a loaded user arrives without them.
const MAX_PAGES = 5;

type RestStar = {
  starred_at: string;
  repo: {
    id: number; node_id: string; name: string; full_name: string; owner: { login: string };
    description: string | null; html_url: string; homepage: string | null; language: string | null;
    stargazers_count: number; forks_count: number; topics?: string[]; archived: boolean;
    pushed_at: string | null; created_at: string | null;
  };
};

export async function loadUserStars(username: string, onProgress: (count: number) => void): Promise<number> {
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
    onProgress(stars.length);
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
  return repos.length;
}
