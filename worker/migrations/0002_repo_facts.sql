-- Repo facts as GitHub last told them (worker/src/repo-facts.ts), shared by every pool.
-- `name` is owner/repo in lower case; `read_at` is when GitHub gave them, in epoch ms.
CREATE TABLE repo_facts (
  name TEXT PRIMARY KEY,
  facts TEXT NOT NULL,
  read_at INTEGER NOT NULL
);
