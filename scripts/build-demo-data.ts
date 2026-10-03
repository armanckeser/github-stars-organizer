// Snapshots one GitHub user's public stars, public Lists and health scores into
// src/lib/demo/demo-data.json for the static demo build (VITE_DEMO=1).
//
//   GITHUB_TOKEN=... DEMO_USER=armanckeser npx tsx scripts/build-demo-data.ts
//
// Any token works, including the Actions GITHUB_TOKEN: everything read here is
// public. The rows are shaped exactly like the ones Electric streams from
// Postgres, so the app renders them with no demo-specific components.

import { writeFileSync, mkdirSync } from "node:fs";
import { HEALTH_BATCH_QUERY, computeHealthScore, type HealthBatchData } from "../server/health.ts";

const token = process.env.GITHUB_TOKEN;
const user = process.env.DEMO_USER ?? "armanckeser";
const maxStars = Number(process.env.DEMO_MAX_STARS ?? 600);
const outFile = "src/lib/demo/demo-data.json";

if (!token) {
  console.error("GITHUB_TOKEN is required (any token can read public stars).");
  process.exit(1);
}

// GitHub's GraphQL endpoint answers the occasional heavy page with an HTML 502,
// and a burst of health batches with a 403 secondary rate limit, so a failed
// request gets a few retries before the build gives up.
async function graphql<T>(query: string, variables: Record<string, unknown>, attempt = 1): Promise<T> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await response.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  if (response.ok && !json.errors?.length && json.data) return json.data;
  const reason = json.errors?.[0]?.message ?? `GitHub returned ${response.status}`;
  if (attempt >= 4) throw new Error(reason);
  // A secondary rate limit says how long to back off in retry-after; honour it.
  const waitSeconds = Number(response.headers.get("retry-after")) || 2 * attempt;
  console.warn(`${reason}, retrying in ${waitSeconds}s (${attempt}/3)`);
  await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
  return graphql(query, variables, attempt + 1);
}

type StarEdge = {
  starredAt: string;
  node: {
    id: string; databaseId: number; name: string; nameWithOwner: string; owner: { login: string };
    description: string | null; url: string; homepageUrl: string | null;
    primaryLanguage: { name: string } | null; stargazerCount: number; forkCount: number;
    isArchived: boolean; pushedAt: string | null; createdAt: string | null;
    repositoryTopics: { nodes: { topic: { name: string } }[] };
  };
};

const STARS_QUERY = `
  query($login: String!, $after: String) {
    user(login: $login) {
      starredRepositories(first: 50, after: $after, orderBy: {field: STARRED_AT, direction: DESC}) {
        pageInfo { endCursor hasNextPage }
        edges {
          starredAt
          node {
            id databaseId name nameWithOwner owner { login }
            description url homepageUrl primaryLanguage { name }
            stargazerCount forkCount isArchived pushedAt createdAt
            repositoryTopics(first: 10) { nodes { topic { name } } }
          }
        }
      }
    }
  }
`;

const LISTS_QUERY = `
  query($login: String!) {
    user(login: $login) {
      lists(first: 100) {
        nodes {
          id name description isPrivate createdAt updatedAt
          items(first: 100) { nodes { ... on Repository { databaseId } } }
        }
      }
    }
  }
`;

type ListsData = {
  user: { lists: { nodes: {
    id: string; name: string; description: string | null; isPrivate: boolean;
    createdAt: string; updatedAt: string; items: { nodes: { databaseId?: number }[] };
  }[] } };
};

const edges: StarEdge[] = [];
let after: string | null = null;
do {
  const data: { user: { starredRepositories: { pageInfo: { endCursor: string | null; hasNextPage: boolean }; edges: StarEdge[] } } } =
    await graphql(STARS_QUERY, { login: user, after });
  const page = data.user.starredRepositories;
  edges.push(...page.edges);
  after = page.pageInfo.hasNextPage && edges.length < maxStars ? page.pageInfo.endCursor : null;
} while (after);

const now = new Date().toISOString();
const repos = edges.slice(0, maxStars).map(({ starredAt, node: n }) => ({
  id: String(n.databaseId),
  github_id: n.databaseId,
  node_id: n.id,
  name: n.name,
  full_name: n.nameWithOwner,
  owner: n.owner.login,
  description: n.description,
  url: n.url,
  homepage: n.homepageUrl || null,
  language: n.primaryLanguage?.name ?? null,
  stars: n.stargazerCount,
  forks: n.forkCount,
  topics: n.repositoryTopics.nodes.map((t) => t.topic.name).join(",") || null,
  starred_at: starredAt,
  notes: null,
  usefulness_rating: null,
  imported_at: now,
  health_score: null as number | null,
  health_data: null as Record<string, number | string> | null,
  health_refreshed_at: null as string | null,
  is_archived: n.isArchived,
  pushed_at: n.pushedAt,
  created_at: n.createdAt,
}));

// Same batches of 20, a second apart, that the server's refresh endpoint uses.
for (let i = 0; i < repos.length; i += 20) {
  if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
  const batch = repos.slice(i, i + 20);
  const data = await graphql<HealthBatchData>(HEALTH_BATCH_QUERY, { ids: batch.map((r) => r.node_id) });
  (data.nodes ?? []).forEach((node, j) => {
    if (!node?.id) return;
    const { score, data: healthData } = computeHealthScore(node, batch[j].stars, null);
    Object.assign(batch[j], { health_score: score, health_data: healthData, health_refreshed_at: now });
  });
}

const repoIdByGithubId = new Map(repos.map((r) => [r.github_id, r.id]));
const listsData = await graphql<ListsData>(LISTS_QUERY, { login: user });
const publicLists = listsData.user.lists.nodes.filter((l) => !l.isPrivate);
const lists = publicLists.map((l) => ({
  id: l.id,
  github_list_id: l.id,
  name: l.name,
  description: l.description,
  is_private: false,
  created_at: l.createdAt,
  updated_at: l.updatedAt,
}));
const list_items = publicLists.flatMap((l) =>
  l.items.nodes.flatMap((item, position) => {
    const repoId = item.databaseId !== undefined ? repoIdByGithubId.get(item.databaseId) : undefined;
    return repoId ? [{ id: `${l.id}:${repoId}`, list_id: l.id, repo_id: repoId, position, added_at: l.updatedAt }] : [];
  }),
);

mkdirSync("src/lib/demo", { recursive: true });
writeFileSync(outFile, JSON.stringify({ user, generated_at: now, repos, lists, list_items }));
console.log(`Wrote ${outFile}: ${repos.length} stars, ${lists.length} lists, ${list_items.length} list items for @${user}.`);
