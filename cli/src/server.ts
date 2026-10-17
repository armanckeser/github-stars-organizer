import { Hono, type MiddlewareHandler } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { computeHealthScore } from "../../server/health.ts";
import {
  GitHubError, starredPages, topicsOf, fetchHealthNodes,
  createList, updateList, deleteList, changeRepoList, unstar, type GitHubClient,
} from "../../server/github.ts";
import { fetchViewerLists } from "../../server/github-lists.ts";
import {
  LOCAL_APP_SIGNATURE,
  type GitHubRepo, type ImportResponse, type HealthRequest, type HealthResponse, type HealthScore,
  type CreateListRequest, type CreateListResponse, type UpdateListRequest, type MembershipRequest, type MembershipResponse,
  type UnstarRequest, type PingResponse, type BackupsResponse, type RestoreRequest, type RestoreResult,
} from "../../src/lib/local-api.ts";
import { buildBackup, InvalidBackupError, parseBackup, type BackupSummary, type RestorePlan } from "../../src/lib/backup.ts";
import { BackupNotFoundError, type BackupStore } from "./backup-store.ts";
import { applyRestore, previewRestore, refuseOtherAccounts, RestoreRefusedError } from "./restore.ts";
import { readGitHubSnapshot } from "./snapshot.ts";

// The npx CLI's localhost server: the app's static files plus a stateless proxy
// to GitHub that holds the user's token. The browser owns every row, so each
// route only makes the GitHub call it is named for (src/lib/local-api.ts).

const HEALTH_BATCH_SIZE = 20;
const HEALTH_BATCH_SPACING_MS = 1000;
const DAY_MS = 86_400_000;

export type LocalServerOptions = { github: GitHubClient; appDir: string; port: number; store: BackupStore; login: string };

// The token can unstar and delete Lists, so only this app's own pages may call
// the API. Checking Host stops DNS rebinding (a hostile name resolving to
// 127.0.0.1); checking Origin and requiring a JSON body stops another site's
// form or fetch, since a cross-origin JSON request needs CORS this server never grants.
function sameOriginOnly(port: number): MiddlewareHandler {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([...hosts].map((host) => `http://${host}`));
  return async (c, next) => {
    if (!hosts.has(c.req.header("host") ?? "")) return c.json({ error: "Unknown host." }, 403);
    if (c.req.path.startsWith("/api/")) {
      const origin = c.req.header("origin");
      if (origin !== undefined && !origins.has(origin)) return c.json({ error: "Cross-origin request refused." }, 403);
      const isJson = c.req.header("content-type")?.startsWith("application/json") ?? false;
      if (c.req.method !== "GET" && !isJson) return c.json({ error: "Expected a JSON body." }, 403);
    }
    await next();
  };
}

function toGitHubRepo(edge: { node: Parameters<typeof topicsOf>[0]; starredAt: string }): GitHubRepo {
  const n = edge.node;
  return {
    github_id: n.databaseId, node_id: n.id, name: n.name, full_name: n.nameWithOwner, owner: n.owner.login,
    description: n.description, url: n.url, homepage: n.homepageUrl || null, language: n.primaryLanguage?.name ?? null,
    stars: n.stargazerCount, forks: n.forkCount, topics: topicsOf(n) || null, starred_at: edge.starredAt,
    is_archived: n.isArchived ?? false, pushed_at: n.pushedAt ?? null, created_at: n.createdAt ?? null,
  };
}

async function scoreHealth(github: GitHubClient, request: HealthRequest): Promise<HealthScore[]> {
  const scores: HealthScore[] = [];
  for (let start = 0; start < request.repos.length; start += HEALTH_BATCH_SIZE) {
    if (start > 0) await new Promise((resolve) => setTimeout(resolve, HEALTH_BATCH_SPACING_MS));
    const batch = request.repos.slice(start, start + HEALTH_BATCH_SIZE);
    const { nodes = [] } = await fetchHealthNodes(github, batch.map((repo) => repo.node_id));
    batch.forEach((repo, index) => {
      const node = nodes[index];
      if (!node?.id) return;
      const daysSinceLastRefresh = repo.health_refreshed_at
        ? (Date.now() - new Date(repo.health_refreshed_at).getTime()) / DAY_MS
        : null;
      const { score, data } = computeHealthScore(node, repo.stars, daysSinceLastRefresh);
      scores.push({ node_id: repo.node_id, score, data, is_archived: node.isArchived ?? false, stars: node.stargazerCount });
    });
  }
  return scores;
}

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

function statusOf(error: Error): number {
  if (error instanceof GitHubError) return error.status;
  if (error instanceof InvalidBackupError) return HTTP_BAD_REQUEST;
  if (error instanceof BackupNotFoundError) return HTTP_NOT_FOUND;
  if (error instanceof RestoreRefusedError) return HTTP_CONFLICT;
  return 500;
}

export function createLocalServer({ github, appDir, port, store, login }: LocalServerOptions): Hono {
  const app = new Hono();
  app.use("*", sameOriginOnly(port));

  app.onError((error, c) => {
    const status = statusOf(error);
    console.error(`  ${c.req.method} ${c.req.path} failed: ${error.message}`);
    return c.json({ error: error.message }, status >= 400 && status < 600 ? (status as 400) : 500);
  });

  const api = new Hono();

  api.get("/ping", (c) => c.json<PingResponse>({ app: LOCAL_APP_SIGNATURE }));

  api.post("/import", async (c) => {
    const repos: GitHubRepo[] = [];
    for await (const edges of starredPages(github)) repos.push(...edges.map(toGitHubRepo));
    const lists = await fetchViewerLists(github.graphql);
    return c.json<ImportResponse>({ repos, lists });
  });

  api.post("/health", async (c) => {
    const request = await c.req.json<HealthRequest>();
    return c.json<HealthResponse>({ scores: await scoreHealth(github, request) });
  });

  api.post("/lists", async (c) => {
    const { name, description } = await c.req.json<CreateListRequest>();
    if (!name?.trim()) return c.json({ error: "A List needs a name." }, 400);
    return c.json<CreateListResponse>({ githubListId: await createList(github, name, description) });
  });

  api.patch("/lists/:id", async (c) => {
    await updateList(github, c.req.param("id"), await c.req.json<UpdateListRequest>());
    return c.json({});
  });

  api.delete("/lists/:id", async (c) => {
    await deleteList(github, c.req.param("id"));
    return c.json({});
  });

  api.post("/membership", async (c) => {
    const listIds = await changeRepoList(github, await c.req.json<MembershipRequest>());
    return c.json<MembershipResponse>({ listIds });
  });

  api.post("/unstar", async (c) => {
    const { owner, name } = await c.req.json<UnstarRequest>();
    await unstar(github, owner, name);
    return c.json({});
  });

  api.get("/backups", async (c) => c.json<BackupsResponse>({ directory: store.directory, backups: await store.list() }));

  api.post("/backups", async (c) =>
    c.json<BackupSummary>(await store.save(buildBackup(login, "manual", await readGitHubSnapshot(github), new Date()))));

  api.get("/backups/:id", async (c) => c.json(await store.read(c.req.param("id"))));

  api.post("/backups/upload", async (c) => {
    const backup = parseBackup(await c.req.json());
    refuseOtherAccounts(backup, login);
    return c.json<BackupSummary>(await store.save({ ...backup, reason: "uploaded", createdAt: new Date().toISOString() }));
  });

  api.post("/restore/plan", async (c) => {
    const { backupId } = await c.req.json<RestoreRequest>();
    return c.json<RestorePlan>(await previewRestore(github, login, await store.read(backupId)));
  });

  // One restore at a time: two at once would both recreate the same deleted List.
  let restoreRunning: Promise<RestoreResult> | null = null;
  api.post("/restore/apply", async (c) => {
    if (restoreRunning) return c.json({ error: "A restore is already running." }, HTTP_CONFLICT);
    // Claimed before the first await, or two requests arriving together both get past the check.
    restoreRunning = (async () => {
      const { backupId } = await c.req.json<RestoreRequest>();
      return applyRestore(github, store, login, await store.read(backupId));
    })();
    try {
      return c.json<RestoreResult>(await restoreRunning);
    } finally {
      restoreRunning = null;
    }
  });

  app.route("/api/local", api);
  app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

  app.use("/*", serveStatic({ root: appDir }));
  // Client-side routes (/explore, /list/...) all load the same page.
  app.get("*", serveStatic({ root: appDir, path: "index.html" }));
  return app;
}
