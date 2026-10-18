# Contributing

## Prerequisites

- Docker (Postgres + ElectricSQL)
- Node.js 20+
- A GitHub personal access token with the `repo` scope

## Quick Start

```bash
cp .env.example .env
cp server/.env.example server/.env
# edit server/.env and set GITHUB_TOKEN to a real PAT

docker compose up -d          # Postgres (:5433) + ElectricSQL (:3000)

cd server && npm install && npm run dev   # Hono API on :4000
npm install && npm run dev                # Vite frontend on :5173
```

Apply the schema once Postgres is up:

```bash
PGPASSWORD=password psql -h localhost -p 5433 -U postgres -d app -f schema.sql
```

Then open http://localhost:5173 and import your stars.

## Commands

```bash
npm run lint          # eslint
npm test              # vitest
npm run build         # tsc -b && vite build
npm run build:cli     # the npx package: the app built with VITE_LOCAL=1 + the CLI, into cli/dist
```

To try List and unstar writes without touching a real account, run the fake GitHub in
`scripts/fake-github.ts` and point either server at it:

```bash
npx tsx scripts/fake-github.ts                                       # :4999, state at /__state
GITHUB_TOKEN=fake GITHUB_API_URL=http://127.0.0.1:4999 node cli/dist/cli.js
```

## Releasing

The npm package is `cli/`, built by `npm run build:cli`. Bump `version` in `cli/package.json`, merge
to `main`, then publish a GitHub release tagged `v<that version>`. `.github/workflows/release.yml`
tests, builds and publishes it to npm from the tag, with provenance, using npm trusted publishing
(no npm token anywhere). It refuses a tag that doesn't match the version.

npm can only trust a workflow for a package that already exists, so the very first version is
published by hand, once:

1. On an up-to-date `main`: `npm login`, then `npm run publish:first`.
2. On npmjs.com, open the package's Settings, Trusted publishing, and add GitHub Actions with
   owner `armanckeser`, repository `github-stars-organizer`, workflow `release.yml`. A new trusted
   publisher expires unless something publishes through it within 2 days, so release the next
   version soon after.
3. Optional, once the release workflow has published: set the package's publishing access to
   disallow tokens, so only the workflow can publish.

---

## Architecture

```
github-stars-organizer/
├── src/
│   ├── routes/            # index (main table), explore (dashboard), list.$listId
│   ├── components/        # table, views (dashboard/kanban/list), detail sheet, ui
│   ├── db/                # PGlite + Electric provider
│   └── lib/
│       ├── mode.ts        # build mode: server (self-host), demo, or local (npx)
│       ├── collections.ts # TanStack DB collections, one per table, with each mode's writes
│       ├── import-plan.ts # local mode: folds a GitHub read into what the browser stored
│       └── api.ts         # browser -> API fetch wrapper
├── server/
│   ├── index.ts           # Hono API: GitHub sync + business logic + Electric proxy
│   └── github.ts          # every GitHub call, shared with the CLI
├── cli/                   # the npx package: localhost server holding the gh token
├── schema.sql             # Postgres schema
└── docker-compose.yml     # Postgres + ElectricSQL
```

**Reads and writes are separated.** An agent reads the database directly over a read-only SQL connection. All writes go through the Hono API so the GitHub sync and validation run; nothing writes to Postgres as a superuser.

**Electric drives the UI.** ElectricSQL streams Postgres shapes into the browser through an API proxy. TanStack DB turns each table (`repos`, `lists`, `list_items`, `tags`, `repo_tags`) into a live collection, and the React UI re-renders on change.

**The npx build keeps the data in the browser.** Built with `VITE_LOCAL=1`, the same collections persist in an OPFS SQLite database instead of streaming from Postgres. The CLI's localhost server holds the token and only makes GitHub calls; each launch re-reads GitHub and keeps the browser's tags, ratings and notes.

**The schema is the source of truth.** Tables use UUID primary keys and are defined in `schema.sql`; drizzle-orm config is available for schema tooling.

---

## Tech Stack

| Layer      | Technology                                             |
|------------|--------------------------------------------------------|
| UI         | React 19, TypeScript, Vite, Tailwind v4, shadcn        |
| State      | TanStack DB, TanStack Router, TanStack Table           |
| Sync       | ElectricSQL (@electric-sql/client, pglite)             |
| API        | Hono                                                    |
| Data       | Postgres 16, drizzle-orm                                |
| GitHub     | @octokit/rest, GitHub GraphQL API                      |
