---
name: github-stars-organizer
description: Search the user's GitHub stars before suggesting a library, tool or repo, sort the stars into GitHub Lists, and find and unstar abandoned or archived ones, through Stard. Use whenever you are about to recommend or pick a library, framework, CLI tool or GitHub repo for the user, when the user wants to organize, categorize, clean up or search their GitHub stars or Lists, and when the user wants a Stard profile: their top four repos, reviews and Lists as cards for their GitHub profile README.
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
or `ARCHIVED`. Start from an active star that fits, and say it's one they starred. If
the best match is quiet or archived, or its last release is over a year old, say so
and check whether a current alternative has overtaken it before you recommend it. The
user wants their own picks first, but not stale ones. If nothing fits, suggest
something else as usual. The search reads a copy on disk and needs no running server; the first
search of the day reads from GitHub and takes about 30 seconds for 500 stars. Add
`--json` for machine-readable output.

If the user wants this every time, offer to add this line to their `CLAUDE.md` or
`AGENTS.md`, since a skill isn't always loaded at the moment a tool is picked:
Before you suggest a library, tool or GitHub repo, run `npx github-stars-organizer search <a few words>` to check what I already starred. If my pick is quiet or hasn't released in a year, say so and name the current alternative.

Stard runs on the user's machine and serves an HTTP API at
`http://127.0.0.1:5185/api/local`. Changes go straight to the user's GitHub account, so
show a plan and wait for the user's OK before any write.

## Make the user's Stard profile

A Stard profile is a block for the user's GitHub profile README: their top four repos, a few short reviews, and their Lists, drawn as cards. The cards are images whose address holds what they show, so nothing has to be running. Read the "Profile cards" section of AGENT-API.md (https://github.com/armanckeser/github-stars-organizer/blob/main/AGENT-API.md#profile-cards) for the addresses and the Markdown.

The profile is the user's taste, so get the content by asking, one question at a time:

1. Their GitHub username, unless `gh api user --jq .login` already gives the name.
2. "Which four repos would you put on a poster?" If they want help remembering, run `npx github-stars-organizer search <words>` or show their most recent stars, but never choose for them.
3. For each of the four, a rating out of 5 if they want ratings shown.
4. "Which repos would you rave about, or warn people off?" For each: a rating and a sentence or two in their own words. Keep their wording. Do not write or pad a review; offer to tidy a review only when asked. Three reviews is plenty.
5. Whether they want a character for the battle game. If yes: a name, a motto, and a class (maintainer, scout, collector, specialist, veteran or archivist; say what each perk is). The look is easiest to build on the Profile screen at https://stars-demo.armanckeser.com/compose; offer that, or pick the six numbers with them.
6. Which of their GitHub Lists to show, and in what order. Leave private Lists out unless they name one. Leave archived repos out of every List.

Then build the Markdown, show the whole block, and wait for a yes. Offer two ways to place the block: they paste the Markdown themselves, or you put the block in the `README.md` of the repo named after their username (create that repo, public, only with their OK; keep everything the README already holds, and replace an earlier Stard block rather than adding a second one). Tell them a card that changed can take a few hours to refresh on GitHub.

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

A self-hosted Stard serves a different API under `/api` on its own address,
with `Authorization: Bearer <AGENT_API_TOKEN>` when sign-in is on. Ask the user for the
address and follow the "Self-hosted" section of AGENT-API.md.
