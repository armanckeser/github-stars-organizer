import "dotenv/config";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import pg from "pg";
import { computeHealthScore } from "./health.ts";
import {
  createGitHubClient, starredPages, topicsOf, fetchHealthNodes,
  createList, updateList, deleteList, changeRepoList, unstar, type GitHubClient,
} from "./github.ts";
import { fetchViewerLists } from "./github-lists.ts";



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
  const github = createGitHubClient(token);
  const client = await pool.connect();
  try {
    for await (const edges of starredPages(github)) {
      let reachedKnown = false;
      for (const edge of edges) {
        const n = edge.node;
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
           n.stargazerCount, n.forkCount, topicsOf(n), edge.starredAt,
           n.isArchived ?? false, n.pushedAt ?? null, n.createdAt ?? null],
        );
        job.imported++;
        if (!rows[0].inserted) reachedKnown = true;
      }
      // Stars come newest first, so once a page holds a repo we already had,
      // everything after it is already stored too. A full import keeps going to
      // refresh star counts and descriptions on the older ones.
      if (!full && reachedKnown) break;
    }
    job.lists = await importGitHubLists(github, client);
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

// Makes Postgres match GitHub's Lists: every List and every item (all pages),
// including Lists deleted and repos removed on GitHub since the last import.
// Lists created here whose GitHub create failed have no github_list_id and stay.
async function importGitHubLists(github: GitHubClient, client: pg.PoolClient): Promise<number> {
  const ghLists = await fetchViewerLists(github.graphql);
  await client.query("BEGIN");
  try {
    await client.query(
      "DELETE FROM lists WHERE github_list_id IS NOT NULL AND NOT (github_list_id = ANY($1::text[]))",
      [ghLists.map((list) => list.id)],
    );
    for (const ghList of ghLists) {
      // github_list_id has no unique constraint (existing installs keep their
      // schema), so this looks the List up instead of using ON CONFLICT.
      const { rows: updated } = await client.query(
        `UPDATE lists SET name = $1, description = $2, is_private = $3, updated_at = NOW()
         WHERE github_list_id = $4 RETURNING id`,
        [ghList.name, ghList.description ?? null, ghList.isPrivate, ghList.id],
      );
      const localListId: string = updated[0]?.id ?? (await client.query(
        "INSERT INTO lists (name, description, github_list_id, is_private) VALUES ($1, $2, $3, $4) RETURNING id",
        [ghList.name, ghList.description ?? null, ghList.id, ghList.isPrivate],
      )).rows[0].id;
      const githubIds = ghList.repos.map((repo) => repo.githubId);
      await client.query(
        `DELETE FROM list_items li USING repos r
         WHERE li.repo_id = r.id AND li.list_id = $1 AND NOT (r.github_id = ANY($2::int[]))`,
        [localListId, githubIds],
      );
      // Position follows GitHub's order; repos not starred (so not in repos) are skipped.
      await client.query(
        `INSERT INTO list_items (list_id, repo_id, position)
         SELECT $1, r.id, ordering.position - 1
         FROM unnest($2::int[]) WITH ORDINALITY AS ordering(github_id, position)
         JOIN repos r ON r.github_id = ordering.github_id
         ON CONFLICT (list_id, repo_id) DO UPDATE SET position = EXCLUDED.position`,
        [localListId, githubIds],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  return ghLists.length;
}

app.post("/api/import-lists", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = resolveGitHubToken(body);
  if (!token) return c.json({ error: "Token required" }, 400);

  const client = await pool.connect();
  try {
    const listsImported = await importGitHubLists(createGitHubClient(token), client);
    return c.json({ lists: listsImported });
  } finally {
    client.release();
  }
});

// Mirrors one membership change onto GitHub. changeRepoList re-reads the repo's
// Lists from GitHub itself, so a List Postgres hasn't fully imported can't be
// dropped by accident.
async function syncListChange(token: string | null, listId: string, repoId: string, change: "add" | "remove"): Promise<void> {
  if (!token) return;
  const { rows } = await pool.query(
    "SELECT r.node_id, r.github_id, l.github_list_id FROM repos r, lists l WHERE r.id = $1 AND l.id = $2",
    [repoId, listId],
  );
  const row = rows[0];
  if (!row?.node_id || !row.github_list_id) return;
  try {
    await changeRepoList(createGitHubClient(token), {
      repoNodeId: row.node_id, repoGithubId: row.github_id, githubListId: row.github_list_id, change,
    });
  } catch (error) {
    console.warn("Failed to update the repo's GitHub Lists:", error);
  }
}

app.post("/api/refresh-health", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = resolveGitHubToken(body);
  if (!token) return c.json({ error: "Token required" }, 400);

  const github = createGitHubClient(token);
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

      let nodes;
      try {
        nodes = (await fetchHealthNodes(github, nodeIds)).nodes ?? [];
      } catch (error) {
        console.warn(`Health batch ${i / batchSize + 1} failed: ${error instanceof Error ? error.message : error}`);
        continue;
      }
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
      githubListId = await createList(createGitHubClient(token), name, description ?? null);
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
        await deleteList(createGitHubClient(token), githubListId);
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
        await updateList(createGitHubClient(token), githubListId, { name, description });
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

  await syncListChange(token, listId, repo_id, "add");

  return c.json(result);
});

app.post("/api/lists/:id/remove-repo", async (c) => {
  const listId = c.req.param("id");
  const body = await c.req.json();
  const { repo_id } = body;
  const token = resolveGitHubToken(body);

  const result = await withTxid(async (client) => {
    await client.query("DELETE FROM list_items WHERE list_id = $1 AND repo_id = $2", [listId, repo_id]);
    return {};
  });
  await syncListChange(token, listId, repo_id, "remove");
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
          await unstar(createGitHubClient(token), rows[0].owner, rows[0].name);
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
