import type { PGlite } from "@electric-sql/pglite";

export async function initSchema(db: PGlite) {
  await db.exec(`
    DROP TABLE IF EXISTS repo_tags CASCADE;
    DROP TABLE IF EXISTS tags CASCADE;
    DROP TABLE IF EXISTS playlist_items CASCADE;
    DROP TABLE IF EXISTS playlists CASCADE;
    DROP TABLE IF EXISTS list_items CASCADE;
    DROP TABLE IF EXISTS lists CASCADE;
    DROP TABLE IF EXISTS repos CASCADE;

    CREATE TABLE repos (
      id SERIAL PRIMARY KEY,
      github_id INTEGER UNIQUE NOT NULL,
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

    CREATE TABLE lists (
      id SERIAL PRIMARY KEY,
      github_list_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      is_private BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE list_items (
      id SERIAL PRIMARY KEY,
      list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(list_id, repo_id)
    );

    CREATE TABLE tags (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      color TEXT NOT NULL DEFAULT '#00d47e'
    );

    CREATE TABLE repo_tags (
      id SERIAL PRIMARY KEY,
      repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE(repo_id, tag_id)
    );
  `);
}
