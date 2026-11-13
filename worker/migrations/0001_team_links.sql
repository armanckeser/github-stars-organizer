-- A team's short link (worker/src/team-links.ts): the sealed token kept under a short id.
-- `login` is whose team it is, so one account's links can be deleted on request.
CREATE TABLE team_links (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  login TEXT NOT NULL,
  created TEXT NOT NULL
);
