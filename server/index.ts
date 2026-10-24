import "dotenv/config";
import { serve } from "@hono/node-server";
import pg from "pg";
import { createApp } from "./app.ts";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5433/app";
const PORT = Number(process.env.PORT ?? 4000);

const app = createApp({
  db: new pg.Pool({ connectionString: DATABASE_URL }),
  githubToken: process.env.GITHUB_TOKEN ?? null,
  electricUrl: process.env.ELECTRIC_URL ?? "http://localhost:3000",
});

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(`Electric proxy at http://localhost:${PORT}/api/electric/*`);
  console.log(`Database: ${DATABASE_URL}`);
});
