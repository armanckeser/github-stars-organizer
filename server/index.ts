import "dotenv/config";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import pg from "pg";

type GraphQLError = { message: string };
type GraphQLResponse<TData> = { data?: TData; errors?: GraphQLError[] };

type StarredRepoNode = {
  databaseId: number;
  id: string;
  name: string;
  nameWithOwner: string;
  owner: { login: string };
  description: string | null;
  url: string;
  homepageUrl: string | null;
  primaryLanguage: { name: string } | null;
  stargazerCount: number;
  forkCount: number;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  isArchived?: boolean;
  pushedAt?: string | null;
  createdAt?: string | null;
};

type StarredData = {
  viewer: {
    starredRepositories: {
      edges: { node: StarredRepoNode; starredAt: string }[];
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
    };
  };
};

type ListItemNode = { databaseId?: number };
type ListNode = {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  items: { nodes: ListItemNode[] };
};
type ListsData = { viewer?: { lists?: { nodes?: ListNode[] } } };

type HealthRepoNode = {
  id: string;
  isArchived?: boolean;
  defaultBranchRef?: { target?: { committedDate?: string } };
  pushedAt?: string | null;
  openIssues?: { totalCount: number };
  closedIssues?: { totalCount: number };
  mentionableUsers?: { totalCount: number };
  stargazerCount: number;
  releases?: { nodes?: { createdAt: string }[] };
};
type HealthBatchData = { nodes?: HealthRepoNode[] };

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5433/app";
const ELECTRIC_URL = process.env.ELECTRIC_URL ?? "http://localhost:3000";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? null;
const PORT = Number(process.env.PORT ?? 4000);

const pool = new pg.Pool({ connectionString: DATABASE_URL });

function resolveGitHubToken(body: Record<string, unknown>): string | null {
  return (body.token as string | undefined) ?? GITHUB_TOKEN;
}

const app = new Hono();
app.use(cors());

const ELECTRIC_PARAMS = new Set([
  "offset", "handle", "live", "cursor", "shape_id",
  "replica", "columns", "where", "table",
]);

function electricProxy(table: string) {
  return async (c: Context) => {
    const originUrl = new URL(`${ELECTRIC_URL}/v1/shape`);
    const requestUrl = new URL(c.req.url);

    requestUrl.searchParams.forEach((value: string, key: string) => {
      if (ELECTRIC_PARAMS.has(key)) {
        originUrl.searchParams.set(key, value);
      }
    });
    originUrl.searchParams.set("table", table);

    const response = await fetch(originUrl.toString());
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

app.get("/api/electric/repos", electricProxy("repos"));
app.get("/api/electric/lists", electricProxy("lists"));
app.get("/api/electric/list_items", electricProxy("list_items"));
app.get("/api/electric/tags", electricProxy("tags"));
app.get("/api/electric/repo_tags", electricProxy("repo_tags"));

async function withTxid(fn: (client: pg.PoolClient) => Promise<Record<string, unknown>>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txidResult = await client.query("SELECT pg_current_xact_id()::xid::text as txid");
    const txid = parseInt(txidResult.rows[0].txid, 10);
    const result = await fn(client);
    await client.query("COMMIT");
    return { ...result, txid };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const STARRED_REPOS_QUERY = `
  query($first: Int!, $after: String) {
    viewer {
      starredRepositories(first: $first, after: $after, orderBy: {field: STARRED_AT, direction: DESC}) {
        totalCount
        pageInfo { endCursor hasNextPage }
        edges {
          starredAt
          node {
            id databaseId name nameWithOwner owner { login }
            description url homepageUrl
            primaryLanguage { name }
            stargazerCount forkCount
            isArchived pushedAt createdAt
            repositoryTopics(first: 10) { nodes { topic { name } } }
          }
        }
      }
    }
  }
`;

type ImportJob = {
  status: "running" | "done" | "error";
  full: boolean;
  imported: number;
  lists: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
};

// One import at a time, run in the background. Paging through GitHub takes
// about 30s for a few hundred stars, which is longer than a phone browser will
// hold a request open, so the request only starts the job and the UI polls
// GET /api/import-stars for the outcome. New rows reach the UI through Electric.
let importJob: ImportJob | null = null;

async function runStarImport(token: string, full: boolean, job: ImportJob) {
  const client = await pool.connect();
  try {
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: STARRED_REPOS_QUERY, variables: { first: 100, after: cursor } }),
      });
      const json = (await response.json()) as GraphQLResponse<StarredData>;
      if (json.errors?.length) throw new Error(json.errors[0].message);

      const connection = json.data!.viewer.starredRepositories;
      let reachedKnown = false;
      for (const edge of connection.edges) {
        const n = edge.node;
        const topics = n.repositoryTopics.nodes.map((t) => t.topic.name).join(",");
        const { rows } = await client.query(
          `INSERT INTO repos (github_id, node_id, name, full_name, owner, description, url, homepage, language, stars, forks, topics, starred_at, is_archived, pushed_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (github_id) DO UPDATE SET
             node_id=EXCLUDED.node_id, stars=EXCLUDED.stars, forks=EXCLUDED.forks,
             description=EXCLUDED.description, topics=EXCLUDED.topics, language=EXCLUDED.language,
             is_archived=EXCLUDED.is_archived, pushed_at=EXCLUDED.pushed_at
           RETURNING (xmax = 0) AS inserted`,
          [n.databaseId, n.id, n.name, n.nameWithOwner, n.owner.login,
           n.description, n.url, n.homepageUrl, n.primaryLanguage?.name ?? null,
           n.stargazerCount, n.forkCount, topics, edge.starredAt,
           n.isArchived ?? false, n.pushedAt ?? null, n.createdAt ?? null],
        );
        job.imported++;
        if (!rows[0].inserted) reachedKnown = true;
      }
      cursor = connection.pageInfo.endCursor;
      // Stars come newest first, so once a page holds a repo we already had,
      // everything after it is already stored too. A full import keeps going to
      // refresh star counts and descriptions on the older ones.
      hasNextPage = connection.pageInfo.hasNextPage && (full || !reachedKnown);
    }
    job.lists = await importGitHubLists(token, client);
    job.status = "done";
  } catch (error) {
    job.status = "error";
    job.error = error instanceof Error ? error.message : String(error);
  } finally {
    job.finishedAt = new Date().toISOString();
    client.release();
  }
}

app.post("/api/import-stars", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = resolveGitHubToken(body);
  if (!token) return c.json({ error: "Token required — set GITHUB_TOKEN in server/.env or pass in request body" }, 400);

  if (importJob?.status !== "running") {
    importJob = { status: "running", full: Boolean(body.full), imported: 0, lists: 0, startedAt: new Date().toISOString() };
    const job = importJob;
    const run = runStarImport(token, job.full, job);
    // Scripts can still ask for the old blocking behaviour.
    if (c.req.query("wait")) await run;
  }
  return c.json(importJob, importJob.status === "running" ? 202 : 200);
});

app.get("/api/import-stars", (c) => c.json(importJob ?? { status: "idle" }));

async function importGitHubLists(token: string, client: pg.PoolClient): Promise<number> {
  const listsResponse = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{ viewer { lists(first: 100) { nodes { id name description isPrivate items(first: 100) { nodes { ... on Repository { databaseId } } } } } } }`,
    }),
  });
  const listsJson = (await listsResponse.json()) as GraphQLResponse<ListsData>;
  const ghLists = listsJson.data?.viewer?.lists?.nodes ?? [];
  let listsImported = 0;

  for (const ghList of ghLists) {
    const { rows: existing } = await client.query(
      "SELECT id FROM lists WHERE github_list_id = $1", [ghList.id],
    );
    let localListId: string;
    if (existing.length > 0) {
      localListId = existing[0].id;
      await client.query(
        "UPDATE lists SET name = $1, description = $2, is_private = $3, updated_at = NOW() WHERE id = $4",
        [ghList.name, ghList.description ?? null, ghList.isPrivate, localListId],
      );
    } else {
      const { rows } = await client.query(
        "INSERT INTO lists (name, description, github_list_id, is_private) VALUES ($1, $2, $3, $4) RETURNING id",
        [ghList.name, ghList.description ?? null, ghList.id, ghList.isPrivate],
      );
      localListId = rows[0].id;
    }

    for (const item of ghList.items.nodes) {
      if (!item?.databaseId) continue;
      const { rows: repoRows } = await client.query(
        "SELECT id FROM repos WHERE github_id = $1", [item.databaseId],
      );
      if (repoRows.length === 0) continue;
      await client.query(
        `INSERT INTO list_items (list_id, repo_id, position)
         VALUES ($1, $2, COALESCE((SELECT MAX(position) + 1 FROM list_items WHERE list_id = $1), 0))
         ON CONFLICT (list_id, repo_id) DO NOTHING`,
        [localListId, repoRows[0].id],
      );
    }
    listsImported++;
  }

  return listsImported;
}

app.post("/api/import-lists", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = resolveGitHubToken(body);
  if (!token) return c.json({ error: "Token required" }, 400);

  const client = await pool.connect();
  try {
    const listsImported = await importGitHubLists(token, client);
    return c.json({ lists: listsImported });
  } finally {
    client.release();
  }
});

async function githubGraphQL<TData>(token: string, query: string, variables?: Record<string, unknown>): Promise<TData | undefined> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await response.json()) as GraphQLResponse<TData>;
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

const HEALTH_BATCH_QUERY = `
  query HealthBatch($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Repository {
        id
        isArchived
        pushedAt
        stargazerCount
        openIssues: issues(states: [OPEN]) { totalCount }
        closedIssues: issues(states: [CLOSED]) { totalCount }
        releases(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) {
          nodes { createdAt }
        }
        defaultBranchRef {
          target { ... on Commit { committedDate } }
        }
        mentionableUsers(first: 1) { totalCount }
      }
    }
  }
`;

function computeHealthScore(repo: HealthRepoNode, storedStars: number, daysSinceLastRefresh: number | null): { score: number; data: Record<string, number | string> } {
  if (repo.isArchived) {
    return { score: 0, data: { reason: "archived", commit_recency: 0, issue_resolution: 0, contributors: 0, star_velocity: 0, release_cadence: 0 } };
  }

  const now = Date.now();

  const lastCommitDate = repo.defaultBranchRef?.target?.committedDate ?? repo.pushedAt;
  const daysSinceCommit = lastCommitDate ? (now - new Date(lastCommitDate).getTime()) / 86400000 : 999;
  const commitRecency = daysSinceCommit <= 7 ? 10 : Math.max(0, 10 - (daysSinceCommit / 365) * 10);

  const openIssues = repo.openIssues?.totalCount ?? 0;
  const closedIssues = repo.closedIssues?.totalCount ?? 0;
  const totalIssues = openIssues + closedIssues;
  const issueResolution = totalIssues > 0 ? (closedIssues / totalIssues) * 10 : 5;

  const mentionableCount = repo.mentionableUsers?.totalCount ?? 0;
  const contributors = Math.min(10, (mentionableCount / 20) * 10);

  let starVelocity: number;
  if (daysSinceLastRefresh && daysSinceLastRefresh > 0) {
    const starDelta = repo.stargazerCount - storedStars;
    const monthlyGrowth = (starDelta / daysSinceLastRefresh) * 30;
    starVelocity = Math.min(10, Math.max(0, monthlyGrowth > 0 ? Math.log10(monthlyGrowth + 1) * 5 : 0));
  } else {
    const repoCreated = repo.pushedAt ? new Date(repo.pushedAt).getTime() : now;
    const repoAgeDays = Math.max(1, (now - repoCreated) / 86400000);
    const monthlyGrowth = (repo.stargazerCount / repoAgeDays) * 30;
    starVelocity = Math.min(10, Math.log10(monthlyGrowth + 1) * 3);
  }

  const latestRelease = repo.releases?.nodes?.[0]?.createdAt;
  let releaseCadence = 0;
  if (latestRelease) {
    const daysSinceRelease = (now - new Date(latestRelease).getTime()) / 86400000;
    releaseCadence = daysSinceRelease <= 30 ? 10 : Math.max(0, 10 - (daysSinceRelease / 365) * 10);
  }

  const score = commitRecency * 0.3 + issueResolution * 0.2 + contributors * 0.2 + starVelocity * 0.15 + releaseCadence * 0.15;

  return {
    score: Math.round(score * 10) / 10,
    data: {
      commit_recency: Math.round(commitRecency * 10) / 10,
      issue_resolution: Math.round(issueResolution * 10) / 10,
      contributors: Math.round(contributors * 10) / 10,
      star_velocity: Math.round(starVelocity * 10) / 10,
      release_cadence: Math.round(releaseCadence * 10) / 10,
      last_commit: lastCommitDate ?? "unknown",
      latest_release: latestRelease ?? "none",
      mentionable_users: mentionableCount,
    },
  };
}

app.post("/api/refresh-health", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = resolveGitHubToken(body);
  if (!token) return c.json({ error: "Token required" }, 400);

  const client = await pool.connect();
  try {
    const forceAll = body.force === true;
    const query = forceAll
      ? "SELECT id, node_id, stars, health_refreshed_at FROM repos WHERE node_id IS NOT NULL ORDER BY full_name"
      : "SELECT id, node_id, stars, health_refreshed_at FROM repos WHERE node_id IS NOT NULL AND health_score IS NULL ORDER BY full_name";
    const { rows: repos } = await client.query(query);

    let scored = 0;
    const batchSize = 20;

    for (let i = 0; i < repos.length; i += batchSize) {
      const batch = repos.slice(i, i + batchSize);
      const nodeIds = batch.map((r) => r.node_id as string);

      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: HEALTH_BATCH_QUERY, variables: { ids: nodeIds } }),
      });
      const json = (await response.json()) as GraphQLResponse<HealthBatchData>;
      if (!response.ok) {
        console.warn(`Health batch ${i / batchSize + 1} HTTP ${response.status}: ${JSON.stringify(json).slice(0, 200)}`);
        continue;
      }
      if (json.errors?.length) {
        console.warn(`Health batch ${i / batchSize + 1} GraphQL error: ${json.errors[0]?.message}`);
      }

      const nodes = json.data?.nodes ?? [];
      for (let j = 0; j < batch.length; j++) {
        const node = nodes[j];
        const dbRepo = batch[j];

        if (!node || !node.id) {
          continue;
        }

        const lastRefresh = dbRepo.health_refreshed_at ? new Date(dbRepo.health_refreshed_at) : null;
        const daysSinceLastRefresh = lastRefresh ? (Date.now() - lastRefresh.getTime()) / 86400000 : null;

        const { score, data } = computeHealthScore(node, dbRepo.stars, daysSinceLastRefresh);

        await client.query(
          `UPDATE repos SET health_score = $1, health_data = $2, health_refreshed_at = NOW(),
           is_archived = $3, stars = $4 WHERE id = $5`,
          [score, JSON.stringify(data), node.isArchived ?? false, node.stargazerCount, dbRepo.id],
        );
        scored++;
      }
    }

    return c.json({ scored, total: repos.length });
  } finally {
    client.release();
  }
});

app.post("/api/lists/create", async (c) => {
  const body = await c.req.json();
  const { name, description } = body;
  const token = resolveGitHubToken(body);
  if (!name) return c.json({ error: "name required" }, 400);

  let githubListId: string | null = null;
  if (token) {
    try {
      const data = await githubGraphQL<{ createUserList: { list: { id: string; name: string } } }>(token,
        `mutation($input: CreateUserListInput!) { createUserList(input: $input) { list { id name } } }`,
        { input: { name, description: description ?? "", isPrivate: false } },
      );
      githubListId = data?.createUserList.list.id ?? null;
    } catch (error) {
      console.warn("Failed to create GitHub List:", error);
    }
  }

  const result = await withTxid(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO lists (name, description, github_list_id) VALUES ($1, $2, $3) RETURNING *`,
      [name, description ?? null, githubListId],
    );
    return { list: rows[0] };
  });
  return c.json(result);
});

app.delete("/api/lists/:id/delete", async (c) => {
  const listId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const token = resolveGitHubToken(body);

  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT github_list_id FROM lists WHERE id = $1", [listId]);
    const githubListId = rows[0]?.github_list_id;

    if (token && githubListId) {
      try {
        await githubGraphQL(token,
          `mutation($input: DeleteUserListInput!) { deleteUserList(input: $input) { user { id } } }`,
          { input: { listId: githubListId } },
        );
      } catch (error) {
        console.warn("Failed to delete GitHub List:", error);
      }
    }
  } finally {
    client.release();
  }

  const result = await withTxid(async (client) => {
    await client.query("DELETE FROM lists WHERE id = $1", [listId]);
    return {};
  });
  return c.json(result);
});

app.patch("/api/lists/:id/update", async (c) => {
  const listId = c.req.param("id");
  const body = await c.req.json();
  const { name, description } = body;
  const token = resolveGitHubToken(body);

  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT github_list_id FROM lists WHERE id = $1", [listId]);
    const githubListId = rows[0]?.github_list_id;

    if (token && githubListId) {
      try {
        await githubGraphQL(token,
          `mutation($input: UpdateUserListInput!) { updateUserList(input: $input) { list { id } } }`,
          { input: { listId: githubListId, name, description: description ?? "" } },
        );
      } catch (error) {
        console.warn("Failed to update GitHub List:", error);
      }
    }
  } finally {
    client.release();
  }

  const result = await withTxid(async (client) => {
    const sets: string[] = [];
    const values: unknown[] = [listId];
    let idx = 2;
    if (name !== undefined) { sets.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { sets.push(`description = $${idx}`); values.push(description); }
    sets.push(`updated_at = NOW()`);
    const { rows } = await client.query(
      `UPDATE lists SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, values,
    );
    return { list: rows[0] };
  });
  return c.json(result);
});

app.post("/api/lists/:id/add-repo", async (c) => {
  const listId = c.req.param("id");
  const body = await c.req.json();
  const { repo_id } = body;
  const token = resolveGitHubToken(body);

  const result = await withTxid(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO list_items (list_id, repo_id, position)
       VALUES ($1, $2, COALESCE((SELECT MAX(position) + 1 FROM list_items WHERE list_id = $1), 0))
       ON CONFLICT (list_id, repo_id) DO NOTHING RETURNING *`,
      [listId, repo_id],
    );
    return { item: rows[0] ?? null };
  });

  if (token) {
    const client = await pool.connect();
    try {
      const { rows: listRows } = await client.query("SELECT github_list_id FROM lists WHERE id = $1", [listId]);
      const { rows: repoRows } = await client.query("SELECT node_id FROM repos WHERE id = $1", [repo_id]);
      const githubListId = listRows[0]?.github_list_id;
      const nodeId = repoRows[0]?.node_id;

      if (githubListId && nodeId) {
        try {
          await githubGraphQL(token,
            `mutation($input: UpdateUserListsForItemInput!) { updateUserListsForItem(input: $input) { user { id } } }`,
            { input: { itemId: nodeId, listIds: [githubListId] } },
          );
        } catch (error) {
          console.warn("Failed to add repo to GitHub List:", error);
        }
      }
    } finally {
      client.release();
    }
  }

  return c.json(result);
});

app.post("/api/lists/:id/remove-repo", async (c) => {
  const listId = c.req.param("id");
  const { repo_id } = await c.req.json();

  const result = await withTxid(async (client) => {
    await client.query("DELETE FROM list_items WHERE list_id = $1 AND repo_id = $2", [listId, repo_id]);
    return {};
  });
  return c.json(result);
});

app.post("/api/repos/:id/unstar", async (c) => {
  const repoId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const token = resolveGitHubToken(body);

  if (token) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query("SELECT owner, name FROM repos WHERE id = $1", [repoId]);
      if (rows[0]) {
        try {
          await fetch(`https://api.github.com/user/starred/${rows[0].owner}/${rows[0].name}`, {
            method: "DELETE",
            headers: { Authorization: `token ${token}` },
          });
        } catch (error) {
          console.warn("Failed to unstar on GitHub:", error);
        }
      }
    } finally {
      client.release();
    }
  }

  const result = await withTxid(async (client) => {
    await client.query("DELETE FROM repos WHERE id = $1", [repoId]);
    return {};
  });
  return c.json(result);
});

// Generic CRUD (no GitHub side effects)
app.post("/api/:table", async (c) => {
  const table = c.req.param("table");
  const body = await c.req.json();
  const keys = Object.keys(body);
  const values = Object.values(body);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const columns = keys.map((k) => `"${k}"`).join(", ");

  const result = await withTxid(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return { row: rows[0] };
  });
  return c.json(result);
});

app.delete("/api/:table/:id", async (c) => {
  const { table, id } = c.req.param();
  const result = await withTxid(async (client) => {
    await client.query(`DELETE FROM "${table}" WHERE id = $1`, [id]);
    return {};
  });
  return c.json(result);
});

app.patch("/api/:table/:id", async (c) => {
  const { table, id } = c.req.param();
  const body = await c.req.json();
  const keys = Object.keys(body);
  const values = Object.values(body);
  const sets = keys.map((k, i) => `"${k}" = $${i + 2}`).join(", ");

  const result = await withTxid(async (client) => {
    const { rows } = await client.query(
      `UPDATE "${table}" SET ${sets} WHERE id = $1 RETURNING *`,
      [id, ...values],
    );
    return { row: rows[0] };
  });
  return c.json(result);
});

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(`Electric proxy at http://localhost:${PORT}/api/electric/*`);
  console.log(`Database: ${DATABASE_URL}`);
});
