import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { authConfigFromEnv, signInConfigured } from "./auth.ts";

// The container's entrypoint. Someone installing from an app store opens the app and
// nothing else, so a first start does everything here before the server loads:
// 1. Wait for Postgres: store installers start containers in any order.
// 2. Apply schema.sql. Every statement is IF NOT EXISTS, so this is safe on every start.
// 3. Load the instance secrets into process.env, each generated once into
//    instance_secret unless the environment sets it: SESSION_SECRET (password sign-in),
//    OIDC_AUTH_SECRET (OIDC) and AGENT_API_TOKEN (any sign-in).
// index.ts reads the environment when it loads, which is why it is imported last.

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5433/app";
const SCHEMA = new URL(process.env.SCHEMA_PATH ?? "../schema.sql", import.meta.url);

const pool = new pg.Pool({ connectionString: DATABASE_URL });

for (let attempt = 1; ; attempt++) {
  try {
    await pool.query("SELECT 1");
    break;
  } catch (error) {
    if (attempt === 90) throw error;
    console.log("Waiting for Postgres...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

await pool.query(await readFile(SCHEMA, "utf8"));

async function secret(env: string, key: string) {
  if ((process.env[env] ?? "").length > 0) return;
  const { rows } = await pool.query<{ value: string }>(
    `INSERT INTO instance_secret (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key
     RETURNING value`,
    [key, randomBytes(32).toString("base64url")],
  );
  process.env[env] = rows[0].value;
}

const auth = authConfigFromEnv();
if (auth.password !== undefined) await secret("SESSION_SECRET", "session_secret");
if (auth.oidc !== undefined) await secret("OIDC_AUTH_SECRET", "oidc_auth_secret");
if (signInConfigured(auth)) await secret("AGENT_API_TOKEN", "agent_api_token");
await pool.end();

await import("./index.ts");
