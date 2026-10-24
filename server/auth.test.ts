import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createApp, type Db } from "./app.ts";
import { createAuth, type AuthConfig } from "./auth.ts";

// Sign-in on a self-hosted install: off unless configured, and when on, nothing but
// the health check and the sign-in page answers without a session.

const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

async function setUp(config: AuthConfig, webRoot?: string) {
  const pglite = new PGlite();
  await pglite.exec(SCHEMA);
  const query = async (text: string, values?: unknown[]) => ({ rows: (await pglite.query(text, values)).rows as Record<string, unknown>[] });
  const db: Db = { query, connect: async () => ({ query, release: () => {} }) };
  return createApp({ db, githubToken: null, electricUrl: "http://127.0.0.1:9", auth: createAuth(config), webRoot });
}

const PASSWORD = { password: "correct horse", sessionSecret: "test-secret", agentToken: "agent-token" };

async function signIn(app: Awaited<ReturnType<typeof setUp>>, password: string) {
  return app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password }).toString(),
  });
}

describe("sign-in", () => {
  test("api_is_open_when_no_sign_in_is_configured", async () => {
    const app = await setUp({});

    expect((await app.request("/api/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "cli" }) })).status).toBe(200);
    expect(await (await app.request("/api/me")).json()).toEqual({ authEnabled: false, signedIn: true });
  });

  test("api_answers_401_without_a_session_and_health_stays_open_when_a_password_is_set", async () => {
    const app = await setUp(PASSWORD);

    expect((await app.request("/api/electric/repos")).status).toBe(401);
    expect((await app.request("/api/tags", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await app.request("/api/health")).status).toBe(200);
  });

  test("password_sign_in_sets_a_session_the_api_accepts", async () => {
    const app = await setUp(PASSWORD);

    const response = await signIn(app, "correct horse");
    const cookie = response.headers.get("set-cookie")!.split(";")[0];

    expect(response.status).toBe(302);
    expect(await (await app.request("/api/me", { headers: { Cookie: cookie } })).json()).toEqual({ authEnabled: true, signedIn: true });
  });

  test("sign_out_clears_the_session_and_returns_to_sign_in", async () => {
    const app = await setUp(PASSWORD);

    const response = await app.request("/auth/logout");

    expect(response.headers.get("location")).toBe("/auth/login");
    expect(response.headers.get("set-cookie")).toMatch(/^stars-session=;.*Max-Age=0/);
  });

  test("password_sign_in_refuses_a_wrong_password", async () => {
    const app = await setUp(PASSWORD);

    const response = await signIn(app, "wrong");

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("session_signed_with_another_key_is_refused", async () => {
    const app = await setUp(PASSWORD);
    const other = await setUp({ ...PASSWORD, sessionSecret: "another-secret" });
    const cookie = (await signIn(other, "correct horse")).headers.get("set-cookie")!.split(";")[0];

    expect((await app.request("/api/me", { headers: { Cookie: cookie } })).status).toBe(401);
  });

  test("agent_token_is_accepted_as_a_bearer", async () => {
    const app = await setUp(PASSWORD);

    expect((await app.request("/api/electric/repos", { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
    expect(await (await app.request("/api/me", { headers: { Authorization: "Bearer agent-token" } })).json()).toMatchObject({ signedIn: true });
  });

  test("page_load_without_a_session_goes_to_sign_in_and_assets_do_not", async () => {
    const webRoot = await mkdtemp(path.join(tmpdir(), "stars-web-"));
    await writeFile(path.join(webRoot, "index.html"), "<!doctype html><title>app</title>");
    await writeFile(path.join(webRoot, "app.js"), "console.log(1)");
    const app = await setUp(PASSWORD, path.relative(process.cwd(), webRoot));

    expect((await app.request("/list/abc")).headers.get("location")).toBe("/auth/login");
    expect((await app.request("/app.js")).status).toBe(200);
    expect(await (await app.request("/auth/login")).text()).toContain('name="password"');

    const cookie = (await signIn(app, "correct horse")).headers.get("set-cookie")!.split(";")[0];
    expect(await (await app.request("/list/abc", { headers: { Cookie: cookie } })).text()).toContain("<title>app</title>");
  });
});

describe("generic routes", () => {
  test("generic_routes_refuse_a_table_the_app_does_not_write", async () => {
    // Regression guarded: the table name went straight into the SQL, so
    // /api/instance_secret read and wrote the session key.
    const app = await setUp({});

    const response = await app.request("/api/instance_secret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "k", value: "v" }) });

    expect(response.status).toBe(404);
  });

  test("generic_routes_refuse_a_column_name_that_is_not_plain", async () => {
    const app = await setUp({});

    const response = await app.request("/api/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ 'name") VALUES (1); --': "x" }) });

    expect(response.status).toBe(400);
  });
});
