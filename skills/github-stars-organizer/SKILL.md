---
name: github-stars-organizer
description: Search the user's GitHub stars before suggesting a library, tool or repo, sort the stars into GitHub Lists, and find and unstar abandoned or archived ones, through Stars Organizer. Use whenever you are about to recommend or pick a library, framework, CLI tool or GitHub repo for the user, and when the user wants to organize, categorize, clean up or search their GitHub stars or Lists.
---

# Organize GitHub stars

## Check the user's stars before suggesting a tool

Before you recommend or pick a library, framework, CLI tool or repo, look in the
user's stars first. They starred these to use them later:

```bash
npx github-stars-organizer search <a few words>
```

Use two to four plain words for the job, like `pdf parser` or `self hosted photo`. Each
result shows the repo's Lists and whether it is active, `QUIET` (no push in 6 months)
or `ARCHIVED`. Prefer an active star that fits, and say it's one they starred. Don't
pick a quiet or archived one without saying so. If nothing fits, suggest something
else as usual. The search reads a copy on disk and needs no running server; the first
search of the day reads from GitHub and takes about 30 seconds for 500 stars. Add
`--json` for machine-readable output.

Stars Organizer runs on the user's machine and serves an HTTP API at
`http://127.0.0.1:5185/api/local`. Changes go straight to the user's GitHub account, so
show a plan and wait for the user's OK before any write.

## Start it

1. Check whether it is already running: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5185/`.
2. If not, start it in the background with `npx github-stars-organizer --no-open`. It needs
   Node 20+ and a GitHub CLI login (`gh auth login`) or `GITHUB_TOKEN`. Each launch backs
   up the user's stars and Lists first.

The full API is in
[AGENT-API.md](https://github.com/armanckeser/github-stars-organizer/blob/main/AGENT-API.md).
Every request except `GET` needs `Content-Type: application/json`, including `DELETE`.

## Sort stars into Lists

1. `POST /import` with `{}` returns `{repos, lists}`, read live from GitHub.
2. Find the repos that are in no List. Suggest a List for each, reusing the user's Lists
   and proposing new ones only where several repos share a theme.
3. Show the plan as a table (repo, List, new or existing List) and wait for the user's OK.
4. Create new Lists with `POST /lists` `{name, description}`, then add repos with
   `POST /membership` `{repoNodeId, repoGithubId, githubListId, change: "add"}`.

## Clean up abandoned stars

1. `POST /health` with `{repos: [{node_id, stars, health_refreshed_at: null}]}` scores
   repos 0 to 10. It takes about a second per 20 repos.
2. List archived repos and low scores with their last push date, and let the user pick.
3. Unstar only the repos the user named: `POST /unstar` `{owner, name}`.

Tags, ratings and notes live in the browser, so the API can't read or change them.

## Self-hosted installs

A self-hosted Stars Organizer serves a different API under `/api` on its own address,
with `Authorization: Bearer <AGENT_API_TOKEN>` when sign-in is on. Ask the user for the
address and follow the "Self-hosted" section of AGENT-API.md.
