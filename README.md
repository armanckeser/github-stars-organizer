<h1 align="center">Stars Organizer</h1>

<p align="center"><b>Sort your GitHub stars into Lists and find the dead ones</b></p>

<p align="center">
  <a href="https://stars-demo.armanckeser.com/">Live demo</a> ·
  <a href="https://www.npmjs.com/package/github-stars-organizer">npm</a> ·
  <a href="AGENT-API.md">Agent API</a> ·
  <a href="#option-b-self-host-with-docker">Self-host</a>
</p>

<p align="center">
  <a href="https://stars-demo.armanckeser.com/"><img src="https://img.shields.io/badge/Try_the_live_demo-2f9e7a?style=for-the-badge" alt="Try the live demo" height="36"></a>
</p>

<p align="center"><sub>Put in any GitHub username, no sign-in. If you like it, a star helps others find it.</sub></p>

<p align="center">
  <img src="img/hero.gif" alt="Opening a repo's health breakdown, rating it four stars and adding a note, opening the Homelab list, then the Explore dashboard" width="800" />
</p>

```bash
npx github-stars-organizer
```

That's the whole install. Stars Organizer uses your [GitHub CLI](https://cli.github.com/) login (`gh auth login`) and runs on localhost.

I starred hundreds of repos over the years and could never find anything again. GitHub has Lists now, but sorting 500 stars into them one dropdown at a time is pretty much nobody's idea of a weekend, and a good chunk of what I had starred was dead anyway. Stars Organizer lets Claude Code or Codex do the sorting, writes the Lists back to GitHub, and gives every repo a health score so the abandoned ones stand out.

## Compared with the alternatives

|  | GitHub's stars page | [Astral](https://astralapp.com) | [GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager) | Stars Organizer |
|---|---|---|---|---|
| **Organizes with** | Lists, by hand | Tags, by hand | Its own categories, sorted by an AI with your API key | GitHub Lists, sorted by the Claude Code or Codex you already use |
| **Shows up on GitHub** | Yes | No, tags live in Astral | Yes, Lists sync both ways | Yes, Lists sync both ways |
| **Flags dead repos** | No | No | No | Health score per repo, plus active alternatives for dead ones |
| **Tags, notes, ratings** | No | Tags and notes | Tags | Tags, notes and 1–5 ratings |
| **Extras** | | Rule-based filters | Semantic search, release tracking, repo Q&A | Explore charts of what you starred over time, backups before every launch |
| **How you run it** | Built in | Hosted, or self-host (PHP) | Desktop app or Docker | `npx`, or Docker |

<sub>Based on each project's README and website as of November 2026. Coming from Astral? Stars Organizer imports Astral's export: tags become Lists and notes carry over.</sub>

## What's inside

| | |
|---|---|
| **Lists** | Your GitHub Lists, plus a "Not in any list" pile to sort. Every change syncs back to GitHub. |
| **Health score** | 0 to 10 from last commit, closed vs open issues, contributors, star growth and last release. Archived repos score 0. |
| **Similar repos** | For any star, and active alternatives for the ones nobody maintains anymore. |
| **Tags, ratings, notes** | On top of your stars, searchable and filterable. |
| **Explore** | Charts of your stars by language, health and last commit, and what kinds of repos you starred over time. |
| **AI sorting** | Claude Code, Codex or any agent that can run `curl` reads your stars, suggests Lists and sorts repos into them once you agree. The robot icon beside **Import Stars** gives you the prompt, or install the skill with `npx skills add armanckeser/github-stars-organizer`. [AGENT-API.md](AGENT-API.md) has the API. |
| **Search for your agent** | `npx github-stars-organizer search pdf parser` lists the stars that match, with their Lists and whether each is still alive. To have Claude Code or Codex check your stars before suggesting a library or tool, add this line to your `CLAUDE.md` or `AGENTS.md`: "Before you suggest a library, tool or GitHub repo, run `npx github-stars-organizer search <a few words>` to check what I already starred. If my pick is quiet or hasn't released in a year, say so and name the current alternative." |
| **Backups** | A backup before every launch, and a restore that only adds back what's missing. |
| **Private** | Talks only to GitHub with your token. No telemetry. |

<p align="center">
  <img src="img/lists.png" alt="A List called Run Your Server: 27 repos with language, stars, a health score per repo and topics" width="760" />
  <br><sub><b>Lists.</b> The same table inside a List, with a health score on every repo.</sub>
</p>

## Is this for you?

**Yes, if** you have a few hundred stars you never look at, you already use (or want to use) GitHub Lists, or you want to know which of your stars quietly died.

**Not yet, if** you want semantic search over READMEs or release notifications (GithubStarsManager does both), or a hosted site you sign into (Astral has one).

## Getting started

### Option A: npx (recommended)

Needs Node.js 20+ and the [GitHub CLI](https://cli.github.com/) logged in. Nothing to host:

```bash
npx github-stars-organizer
```

### Option B: self-host with Docker

Needs Docker and a [classic token](https://github.com/settings/tokens/new?scopes=repo&description=Stars%20Organizer) with the `repo` scope, which is what lets Stars Organizer edit your Lists and unstar repos. Stars Organizer never reads or changes code; the key icon beside **Import Stars** shows which account and scopes the app is using. No clone:

```bash
GITHUB_TOKEN=ghp_... docker compose -f oci://ghcr.io/armanckeser/github-stars-organizer-stack:latest up -d
```

Open http://localhost:8080 and press **Import Stars**. That runs three containers (the app, Postgres and Electric); `ghcr.io/armanckeser/github-stars-organizer:aio` is all three in one, with its data under `/data`:

```bash
docker run -d -p 8080:8080 -v stars-data:/data -e GITHUB_TOKEN=ghp_... ghcr.io/armanckeser/github-stars-organizer:aio
```

The token can unstar repos and edit your Lists, so anyone who can reach the port can too. Set `AUTH_PASSWORD` to require a password, or sign in through your OIDC provider (Authentik, Authelia, Pocket ID...) with `AUTH_ENABLED=1` and the `OIDC_*` settings in [docker-compose.selfhost.yml](docker-compose.selfhost.yml). Or leave both unset behind a proxy that already checks who gets in.

**From your server's app store:** add the catalog once, then install Stars Organizer like any other app.

| Server | Where | Paste |
| --- | --- | --- |
| Cosmos | Market → Sources → Add Source | `https://armanckeser.github.io/selfhost-apps/servapps.json` |
| CasaOS / ZimaOS | App Store → Add Source | `https://github.com/armanckeser/selfhost-apps/archive/refs/heads/casaos.zip` |
| Runtipi | Settings → App Stores → Add App Store | `https://github.com/armanckeser/selfhost-apps` |
| Portainer | Settings → App Templates → URL | `https://armanckeser.github.io/selfhost-apps/portainer/templates.json` |

Unraid's Community Apps doesn't list it yet; [selfhost-apps](https://github.com/armanckeser/selfhost-apps#add-the-catalog-to-your-server) has the template to add by hand.

Umbrel isn't listed: Umbrel installs take no settings, and Stars Organizer needs the token.

An AI agent can act through the same API as the UI (`/api/*`). With sign-in on, it sends `Authorization: Bearer <AGENT_API_TOKEN>`; set that yourself, or read the one generated on first start from the `instance_secret` table. [AGENT-API.md](AGENT-API.md#self-hosted) lists the routes.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) has the dev setup.

Copyright (C) 2026 Armanc Keser. [AGPL-3.0-or-later](LICENSE), with absolutely no warranty. Not affiliated with or endorsed by GitHub.
