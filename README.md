<p align="center">
  <img src="img/banner.png" alt="Stars Organizer: finally do something with your GitHub stars. Lists synced to GitHub, a health score per repo, tags, ratings and notes." width="100%" />
</p>

Search, tag, rate and sort your GitHub stars into Lists that sync back to GitHub.

```bash
npx github-stars-organizer
```

Uses your [GitHub CLI](https://cli.github.com/) login (`gh auth login`). Nothing to host.
Or **[try the demo](https://stars-demo.armanckeser.com/)**, no sign-in.

<p align="center">
  <img src="img/hero.gif" alt="Opening a repo's health breakdown, rating it four stars and adding a note, opening the Homelab list, then the Explore dashboard" width="800" />
</p>

- **Lists that sync to GitHub**, plus a "Not in any list" pile to sort.
- **A health score per repo**, so dead projects stand out.
- **Tags, ratings and notes** on top of your stars.
- **Backups before every launch**, and a restore that only adds back what's missing.
- **Private:** talks only to GitHub with your token. No telemetry.

Works with AI agents: they can read your stars, suggest Lists and sort repos into them over a local HTTP API. [Guide and copy-paste prompt](AGENT-API.md).

<details>
<summary>Self-host with Docker</summary>

Needs Docker and a [classic token](https://github.com/settings/tokens/new?scopes=repo&description=Stars%20Organizer) with `repo` scope.

```bash
git clone https://github.com/armanckeser/github-stars-organizer.git && cd github-stars-organizer
cp server/.env.example server/.env    # set GITHUB_TOKEN=ghp_...
docker compose -f docker-compose.prod.yml up -d --build
```

Open http://localhost:5184 and press **Import Stars**. There's no login, so put it behind your reverse proxy's auth. An AI agent can act through the same API as the UI (`/api/*` on port 5184); [AGENT-API.md](AGENT-API.md) covers the `npx` version's API.
</details>

Developing: [CONTRIBUTING.md](CONTRIBUTING.md). Like it? A star helps others find it.

Copyright (C) 2026 Armanc Keser. [AGPL-3.0-or-later](LICENSE), with absolutely no warranty. Not affiliated with or endorsed by GitHub.
