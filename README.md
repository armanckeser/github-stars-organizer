<p align="center">
  <img src="img/banner.png" alt="GitHub Stars Organizer - Tame your stars" width="640" />
</p>

---

Organize your GitHub stars into Lists and tags, then sync the Lists back to GitHub. A local, reactive UI over your starred repos, backed by Postgres and ElectricSQL so an agent can help you curate.

- ⭐ **Import stars** — Pull every starred repo (and your existing GitHub Lists) into a local database.
- 🗂️ **Curate Lists** — Create Lists, add and remove repos, and delete Lists. Membership changes sync to GitHub.
- 🏷️ **Tag and rate** — Attach local tags, notes, and a 1-5 usefulness rating to any repo.
- 📊 **Explore** — A dashboard of languages, health, and activity across your stars.
- 🔴 **Unstar** — Drop a repo from your stars, synced back to GitHub.
- ⚡ **Live sync** — ElectricSQL streams changes into a reactive TanStack DB cache; the UI updates on its own.

---

## How It Works

**Import.** One call pulls your starred repos and existing GitHub Lists into Postgres via the GitHub GraphQL API.

**Curate.** Build Lists, tag and rate repos, and write notes. List membership, List create/delete, and unstars are written through the API, which runs the GitHub sync so your changes land upstream.

**Watch it update.** ElectricSQL replicates Postgres into the browser, where TanStack DB exposes each table as a live collection. Edits show up without a refresh.

**Let an agent help.** The agent reads the database over a read-only SQL connection and makes changes through the same API the UI uses, so business logic always runs.

---

## Screenshots

<p align="center"><em>Screenshots coming soon.</em></p>

---

## Why This Exists

I have hundreds of starred repos and no good way to organize them. GitHub's native Lists are barely discoverable and there is no tagging, rating, or bulk curation. I wanted a local surface over my stars that an agent could read and help me tidy: sort into Lists, tag by purpose, rate usefulness, and push the results back to GitHub so the organization survives outside this tool.

---

## Development

### Prerequisites

- Docker (Postgres + ElectricSQL)
- Node.js 20+
- A GitHub personal access token with `repo` and `read:user` scopes

### Quick Start

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

### Commands

```bash
npm run lint          # eslint
npm run build         # tsc -b && vite build
```

---

## Architecture

```
github-stars-organizer/
├── src/
│   ├── routes/            # index (main table), explore (dashboard), list.$listId
│   ├── components/        # table, views (dashboard/kanban/list), detail sheet, ui
│   ├── db/                # PGlite + Electric provider
│   └── lib/
│       ├── collections.ts # TanStack DB collections, one per table
│       └── api.ts         # browser -> API fetch wrapper
├── server/
│   └── index.ts           # Hono API: GitHub sync + business logic + Electric proxy
├── schema.sql             # Postgres schema
└── docker-compose.yml     # Postgres + ElectricSQL
```

**Reads and writes are separated.** An agent reads the database directly over a read-only SQL connection. All writes go through the Hono API so the GitHub sync and validation run; nothing writes to Postgres as a superuser.

**Electric drives the UI.** ElectricSQL streams Postgres shapes into the browser through an API proxy. TanStack DB turns each table (`repos`, `lists`, `list_items`, `tags`, `repo_tags`) into a live collection, and the React UI re-renders on change.

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

---

## License

Released under the GNU Affero General Public License v3.0 — see [LICENSE](LICENSE). If you run a modified version where other people can reach it, the AGPL asks you to publish your changes too.
