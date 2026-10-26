import "dotenv/config";
import { serve } from "@hono/node-server";
import pg from "pg";
import { createApp } from "./app.ts";
import { authConfigFromEnv, createAuth } from "./auth.ts";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5433/app";
const PORT = Number(process.env.PORT ?? 4000);
// Set in the image: the built web app, served beside the API on one port.
const WEB_ROOT = process.env.WEB_ROOT || undefined;

const auth = createAuth(authConfigFromEnv());

const app = createApp({
  db: new pg.Pool({ connectionString: DATABASE_URL }),
  githubToken: process.env.GITHUB_TOKEN ?? null,
  electricUrl: process.env.ELECTRIC_URL ?? "http://localhost:3000",
  electricSecret: process.env.ELECTRIC_SECRET || undefined,
  auth,
  webRoot: WEB_ROOT,
});

serve({ fetch: app.fetch, port: PORT, hostname: process.env.HOST }, () => {
  console.log(`Stars Organizer on http://localhost:${PORT}${WEB_ROOT ? "" : " (API only)"}`);
  console.log(auth.enabled ? "Sign-in is on." : "Sign-in is off: anyone who can reach this port can use it.");
  if (!process.env.GITHUB_TOKEN) console.log("GITHUB_TOKEN is not set: importing stars and writing Lists will fail.");
});
