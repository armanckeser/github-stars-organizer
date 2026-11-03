---
name: github-stars-organizer
description: Sort the user's GitHub stars into GitHub Lists, find abandoned or archived starred repos, and unstar the ones they no longer want, through Stars Organizer's local API. Use when the user wants to organize, categorize, tag, clean up or search their GitHub stars or Lists.
---

# Organize GitHub stars

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
