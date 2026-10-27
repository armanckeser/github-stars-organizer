import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createApp, type Db } from "./app.ts";
import { startFakeGitHub, type FakeGitHub } from "../scripts/fake-github.ts";

// The self-hosted API's GitHub writes, end to end: real routes, an in-memory
// Postgres with the real schema, and the fake GitHub. GitHub owns stars and Lists,
// so each test checks both sides agree after a write, refused or not.

const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

let fake: FakeGitHub | null = null;

afterEach(async () => {
  // A test that takes GitHub offline has closed it already.
  await fake?.close().catch(() => {});
  fake = null;
});

function pgliteDb(pglite: PGlite): Db {
  const query = async (text: string, values?: unknown[]) => ({ rows: (await pglite.query(text, values)).rows as Record<string, unknown>[] });
  return { query, connect: async () => ({ query, release: () => {} }) };
}

/** An app over a fresh database holding the fake's stars and Lists. */
async function setUp({ token = "fake-token" as string | null } = {}) {
  fake = await startFakeGitHub({ repoCount: 5, lists: [{ name: "Paintball", repoIndexes: [0] }] });
  const pglite = new PGlite();
  await pglite.exec(SCHEMA);
  const app = createApp({ db: pgliteDb(pglite), githubToken: token, electricUrl: "http://127.0.0.1:9", githubApiUrl: fake.url });

  const call = async (method: string, path: string, body: unknown = {}) => {
    const response = await app.request(path, method === "GET"
      ? { method }
      : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, json: (await response.json()) as Record<string, unknown> };
  };
  const rows = async (sql: string, values: unknown[] = []) => (await pglite.query<Record<string, unknown>>(sql, values)).rows;

  if (token) {
    await call("POST", "/api/import-stars", { full: true });
    for (let tries = 0; tries < 50; tries++) {
      const job = (await (await app.request("/api/import-stars")).json()) as { status: string };
      if (job.status !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  const repoId = async (githubId: number) => (await rows("SELECT id FROM repos WHERE github_id = $1", [githubId]))[0].id as string;
  const listId = async (name: string) => (await rows("SELECT id FROM lists WHERE name = $1", [name]))[0]?.id as string | undefined;
  const members = async (listName: string) => (await rows(
    "SELECT r.github_id FROM list_items i JOIN lists l ON l.id = i.list_id JOIN repos r ON r.id = i.repo_id WHERE l.name = $1 ORDER BY r.github_id",
    [listName],
  )).map((row) => row.github_id);

  return { fake: fake!, call, rows, repoId, listId, members };
}

describe("creating a List", () => {
  test("createList_stores_the_list_with_its_github_id_when_github_accepts_it", async () => {
    const { fake, call, rows } = await setUp();

    const { status, json } = await call("POST", "/api/lists/create", { name: "Study Group" });

    expect(status).toBe(200);
    expect((json.list as { github_list_id: string }).github_list_id).toBe(fake.listNamed("Study Group").id);
    expect(await rows("SELECT name FROM lists WHERE name = 'Study Group'")).toHaveLength(1);
  });

  test("createList_returns_githubs_reason_and_stores_nothing_when_github_refuses", async () => {
    // Regression guarded: a refused List was still stored and answered 200, so the
    // app showed a List that GitHub didn't have.
    const { fake, call, listId } = await setUp();
    fake.failNext("createUserList");

    const { status, json } = await call("POST", "/api/lists/create", { name: "Study Group" });

    expect(status).toBe(502);
    expect(json.error).toMatch(/Couldn't create the List "Study Group" on GitHub: Something went wrong/);
    expect(await listId("Study Group")).toBeUndefined();
  });

  test("createList_asks_for_a_token_instead_of_storing_a_list_only_this_app_knows", async () => {
    const { call, listId } = await setUp({ token: null });

    const { status } = await call("POST", "/api/lists/create", { name: "Study Group" });

    expect(status).toBe(400);
    expect(await listId("Study Group")).toBeUndefined();
  });
});

describe("adding and removing a repo", () => {
  test("addRepo_adds_it_on_github_and_here_when_github_accepts_it", async () => {
    const { fake, call, repoId, listId, members } = await setUp();

    const { status } = await call("POST", `/api/lists/${await listId("Paintball")}/add-repo`, { repo_id: await repoId(1001) });

    expect(status).toBe(200);
    expect([...fake.listNamed("Paintball").itemIds].sort()).toEqual(["R_1000", "R_1001"]);
    expect(await members("Paintball")).toEqual([1000, 1001]);
  });

  test("addRepo_returns_githubs_reason_and_leaves_the_list_alone_when_github_refuses", async () => {
    // Regression guarded: the membership was stored and answered 200 after GitHub
    // refused it, so the importer and "Add to list" reported a success that wasn't.
    const { fake, call, repoId, listId, members } = await setUp();
    fake.failNext("updateUserListsForItem");

    const { status, json } = await call("POST", `/api/lists/${await listId("Paintball")}/add-repo`, { repo_id: await repoId(1001) });

    expect(status).toBe(502);
    expect(json.error).toMatch(/^Couldn't add the repo to the List on GitHub: /);
    expect(fake.listNamed("Paintball").itemIds).toEqual(["R_1000"]);
    expect(await members("Paintball")).toEqual([1000]);
  });

  test("addRepo_refuses_a_list_that_only_exists_here_without_asking_github", async () => {
    const { fake, call, rows, repoId, members } = await setUp();
    const [{ id }] = await rows("INSERT INTO lists (name) VALUES ('Pillow Fort') RETURNING id");
    const writesBefore = fake.writes.length;

    const { status, json } = await call("POST", `/api/lists/${id}/add-repo`, { repo_id: await repoId(1001) });

    expect(status).toBe(409);
    expect(json.error).toBe("Can't add the repo to the List: this List only exists here, not on GitHub");
    expect(fake.writes).toHaveLength(writesBefore);
    expect(await members("Pillow Fort")).toEqual([]);
  });

  test("removeRepo_keeps_the_membership_when_github_refuses", async () => {
    const { fake, call, repoId, listId, members } = await setUp();
    fake.failNext("updateUserListsForItem");

    const { status } = await call("POST", `/api/lists/${await listId("Paintball")}/remove-repo`, { repo_id: await repoId(1000) });

    expect(status).toBe(502);
    expect(fake.listNamed("Paintball").itemIds).toEqual(["R_1000"]);
    expect(await members("Paintball")).toEqual([1000]);
  });

  test("removeRepo_removes_it_on_github_and_here_when_github_accepts_it", async () => {
    const { fake, call, repoId, listId, members } = await setUp();

    const { status } = await call("POST", `/api/lists/${await listId("Paintball")}/remove-repo`, { repo_id: await repoId(1000) });

    expect(status).toBe(200);
    expect(fake.listNamed("Paintball").itemIds).toEqual([]);
    expect(await members("Paintball")).toEqual([]);
  });
});

describe("renaming and deleting a List", () => {
  test("updateList_keeps_the_old_name_when_github_refuses", async () => {
    const { fake, call, listId } = await setUp();
    const id = await listId("Paintball");
    fake.failNext("updateUserList(");

    const { status } = await call("PATCH", `/api/lists/${id}/update`, { name: "Paintball II" });

    expect(status).toBe(502);
    expect(fake.listNamed("Paintball").name).toBe("Paintball");
    expect(await listId("Paintball")).toBe(id);
  });

  test("deleteList_keeps_the_list_when_github_refuses", async () => {
    const { fake, call, listId } = await setUp();
    const id = await listId("Paintball");
    fake.failNext("deleteUserList");

    const { status } = await call("DELETE", `/api/lists/${id}/delete`);

    expect(status).toBe(502);
    expect(await listId("Paintball")).toBe(id);
  });

  test("deleteList_removes_a_list_that_only_exists_here_without_asking_github", async () => {
    // A List stored before GitHub writes were checked has no GitHub id; it has to
    // stay deletable, or it could never be cleaned up.
    const { fake, call, rows, listId } = await setUp();
    const [{ id }] = await rows("INSERT INTO lists (name) VALUES ('Pillow Fort') RETURNING id");
    const writesBefore = fake.writes.length;

    const { status } = await call("DELETE", `/api/lists/${id}/delete`);

    expect(status).toBe(200);
    expect(await listId("Pillow Fort")).toBeUndefined();
    expect(fake.writes).toHaveLength(writesBefore);
  });
});

describe("unstarring", () => {
  test("unstar_removes_the_repo_on_github_and_here_when_github_accepts_it", async () => {
    const { fake, call, rows, repoId } = await setUp();

    const { status } = await call("POST", `/api/repos/${await repoId(1003)}/unstar`);

    expect(status).toBe(200);
    expect(fake.starred().map((repo) => repo.databaseId)).not.toContain(1003);
    expect(await rows("SELECT 1 FROM repos WHERE github_id = 1003")).toEqual([]);
  });

  test("unstar_keeps_the_repo_when_github_cannot_be_reached", async () => {
    // Regression guarded: a failed unstar deleted the repo here (and its tags,
    // rating and notes) while it stayed starred on GitHub.
    const { fake, call, rows, repoId } = await setUp();
    const id = await repoId(1003);
    await fake.close();

    const { status, json } = await call("POST", `/api/repos/${id}/unstar`);

    expect(status).toBe(502);
    expect(json.error).toMatch(/^Couldn't unstar .*project-3 on GitHub: /);
    expect(await rows("SELECT 1 FROM repos WHERE github_id = 1003")).toHaveLength(1);
  });
});

describe("similar repos and the token", () => {
  test("similar_returns_ranked_repos_without_the_repo_itself", async () => {
    const { fake, call, rows } = await setUp();
    const [{ id, full_name: self }] = await rows("SELECT id, full_name FROM repos ORDER BY github_id LIMIT 1");
    const { status, json } = await call("GET", `/api/repos/${id}/similar`);
    expect(status).toBe(200);
    const names = (json.similar as { full_name: string }[]).map((r) => r.full_name);
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain(self);
    expect(fake.writes.filter((w) => w.startsWith("search ")).length).toBeLessThanOrEqual(3);
  });

  test("similar_asks_for_a_token_when_there_is_none", async () => {
    const { call } = await setUp({ token: null });
    expect((await call("GET", "/api/repos/00000000-0000-0000-0000-000000000000/similar")).json).toMatchObject({ code: "no_token" });
  });

  test("githubToken_reports_the_login_and_the_classic_scopes", async () => {
    const { call } = await setUp();
    expect((await call("GET", "/api/github-token")).json).toEqual({ connected: true, login: "abed-nadir", scopes: ["repo", "read:org"] });
  });

  test("agentStars_lists_every_repo_with_the_lists_it_is_in", async () => {
    const { call, listId } = await setUp();
    const { json } = await call("GET", "/api/agent/stars");
    const repos = json.repos as { full_name: string; list_ids: string[] }[];
    const paintball = await listId("Paintball");
    expect(repos).toHaveLength(5);
    expect(repos.filter((r) => r.list_ids.includes(paintball!))).toHaveLength(1);
    expect(json.lists).toEqual([expect.objectContaining({ name: "Paintball" })]);
  });

  test("githubToken_says_not_connected_without_a_token", async () => {
    const { call } = await setUp({ token: null });
    expect((await call("GET", "/api/github-token")).json).toEqual({ connected: false });
  });
});
