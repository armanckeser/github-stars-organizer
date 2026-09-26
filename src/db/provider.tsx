import { useState, useEffect, createContext, useContext, type ReactNode } from "react";
import { PGliteProvider } from "@electric-sql/pglite-react";
import { PGlite } from "@electric-sql/pglite";
import { live, type PGliteWithLive } from "@electric-sql/pglite/live";
import { electricSync } from "@electric-sql/pglite-sync";

const ELECTRIC_URL = import.meta.env.VITE_ELECTRIC_URL ?? "http://localhost:3000";
const TABLES = ["repos", "lists", "list_items", "tags", "repo_tags"];

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id INTEGER UNIQUE,
  node_id TEXT,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  homepage TEXT,
  language TEXT,
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  topics TEXT,
  starred_at TIMESTAMPTZ,
  notes TEXT,
  usefulness_rating INTEGER CHECK (usefulness_rating IS NULL OR (usefulness_rating >= 1 AND usefulness_rating <= 5)),
  imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_list_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL,
  repo_id UUID NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, repo_id)
);
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL DEFAULT '#00d47e'
);
CREATE TABLE IF NOT EXISTS repo_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  UNIQUE(repo_id, tag_id)
);
`;

const RawDbContext = createContext<PGlite | null>(null);

export function useRawDb(): PGlite {
  const db = useContext(RawDbContext);
  if (!db) throw new Error("useRawDb must be used within DbProvider");
  return db;
}

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<PGliteWithLive | null>(null);

  useEffect(() => {
    async function init() {
      const pg = await PGlite.create({
        dataDir: "idb://github-stars-organizer",
        extensions: {
          electric: electricSync(),
          live,
        },
      });

      await pg.exec(SCHEMA_SQL);

      for (const table of TABLES) {
        await pg.electric.syncShapeToTable({
          shape: {
            url: `${ELECTRIC_URL}/v1/shape`,
            params: { table },
          },
          table,
          primaryKey: ["id"],
          shapeKey: table,
        });
      }

      setDb(pg as unknown as PGliteWithLive);
    }
    init();
  }, []);

  if (!db) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Connecting to database...</p>
      </div>
    );
  }

  return (
    <RawDbContext.Provider value={db as unknown as PGlite}>
      <PGliteProvider db={db}>
        {children}
      </PGliteProvider>
    </RawDbContext.Provider>
  );
}
