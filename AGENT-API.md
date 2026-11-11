# Using Stard with an AI agent

While `npx github-stars-organizer` is running, it serves a local HTTP API on
`http://127.0.0.1:5185/api/local`. Any agent that can run `curl` can read your
stars and Lists, score repo health, and manage your GitHub Lists through it. Changes
land on GitHub, so the app's UI shows them the next time you press Import.

Tags, ratings and notes live in your browser, so an agent can't read or change them.

## Search your stars from the command line

`npx github-stars-organizer search <words>` needs no running server. It prints the
stars that match, with each repo's Lists and whether it is active, quiet (no push in
6 months) or archived, so an agent can check what you already starred before it
suggests a library or tool. It reads a copy kept in `~/.github-stars-organizer` and
refreshes it from GitHub once a day (`--refresh` to do it now). `--json` and
`--limit <n>` change the output. To have your agent do this on its own, add one line
to your `CLAUDE.md` or `AGENTS.md`:

```text
Before you suggest a library, tool or GitHub repo, run `npx github-stars-organizer search <a few words>` to check what I already starred. If my pick is quiet or hasn't released in a year, say so and name the current alternative.
```

## Profile cards

A Stard profile is a block of Markdown for a GitHub README: the person's top four repos, a few reviews, and their Lists. Each part is an image whose address holds everything the image shows, so making one needs no API call and no running server. Build the addresses, wrap each in a link, and hand over the Markdown.

All cards live under `https://stars-demo.armanckeser.com/api/card/`. Every card needs `user`, the person's GitHub username. URL-encode every value.

| Card | Address | Parameters |
|---|---|---|
| Top four | `top4.svg` | `repos`: up to four `owner/name`, comma-separated, in the order to show. `ratings` (optional): one number per repo, 0.5 to 5 in halves, `0` for no rating. |
| Review | `review.svg` | `repo`: one `owner/name`. `rating` (optional): 0.5 to 5. `text` (optional): the review, at most 400 characters; the card shows about four lines. |
| List | `list.svg` | `title`: the List's name. `count`: how many repos the List has. `repos`: up to six `owner/name` to show as posters. |

The Markdown, one card per paragraph:

```markdown
[![octocat's top four repos on GitHub: astral-sh/uv, immich-app/immich, BurntSushi/ripgrep, sveltejs/svelte](https://stars-demo.armanckeser.com/api/card/top4.svg?user=octocat&repos=astral-sh%2Fuv%2Cimmich-app%2Fimmich%2CBurntSushi%2Fripgrep%2Csveltejs%2Fsvelte&ratings=5%2C5%2C4.5%2C4)](https://stars-demo.armanckeser.com/?user=octocat)

## Reviews

[![BurntSushi/ripgrep, rated 4.5 of 5: Searches a monorepo before I finish typing the flags.](https://stars-demo.armanckeser.com/api/card/review.svg?user=octocat&repo=BurntSushi%2Fripgrep&rating=4.5&text=Searches+a+monorepo+before+I+finish+typing+the+flags.)](https://github.com/BurntSushi/ripgrep)

[![Run your server, a list of 28 repos by octocat](https://stars-demo.armanckeser.com/api/card/list.svg?user=octocat&title=Run+your+server&count=28&repos=immich-app%2Fimmich%2Cjellyfin%2Fjellyfin)](https://stars-demo.armanckeser.com/?user=octocat)

<details>
<summary>All 28 repos</summary>

- [immich-app/immich](https://github.com/immich-app/immich) - Where every photo I take ends up

</details>

Made with [Stard](https://stars-demo.armanckeser.com/)
```

Rules for an agent writing a profile:

- The top four and the reviews are the person's taste. Ask; never pick for them, and never write a review for them. Tidy their wording only if they ask.
- Put the image's content in the alt text, as above. Screen readers and broken images fall back to the alt text.
- The top four and List cards link to `https://stars-demo.armanckeser.com/?user=<username>`; a review links to the repo.
- Leave archived repos out of Lists. Check with `npx github-stars-organizer search` or the endpoints below.
- A GitHub profile README is the `README.md` of the repo named after the username (`octocat/octocat`). Show the finished Markdown and wait for a yes before creating that repo or changing its README, and keep whatever the README already holds.
- GitHub keeps its own copy of each image for a while, so a changed card can take some hours to show. A new address shows at once.

## Copy-paste prompt

```text
Stard is running at http://127.0.0.1:5185. Read
https://github.com/armanckeser/github-stars-organizer/blob/main/AGENT-API.md, then
fetch my stars and Lists with POST /api/local/import. Suggest which List each repo
in no List belongs in, and any new Lists worth creating. Show me the plan as a
table and wait for my OK before changing anything.
```

## Rules the server enforces

- Send requests to `127.0.0.1:5185` or `localhost:5185`. Any other `Host` is refused.
- Every request except `GET` needs `Content-Type: application/json`, including `DELETE`.
- Requests with a browser `Origin` from another site are refused. `curl` sends none.

`--port <number>` changes the port; use the same one in the URL.

## Endpoints

All paths are under `/api/local`. Errors come back as `{"error": "..."}`.

| Method and path | Body | Returns |
|---|---|---|
| `POST /import` | `{}` | `{repos, lists}`, read live from GitHub |
| `POST /health` | `{repos: [{node_id, stars, health_refreshed_at: null}]}` | `{scores: [{node_id, score, data, is_archived, stars}]}` |
| `POST /lists` | `{name, description}` | `{githubListId}` |
| `PATCH /lists/:id` | `{name?, description?}` | `{}` |
| `DELETE /lists/:id` | `{}` | `{}` |
| `POST /membership` | `{repoNodeId, repoGithubId, githubListId, change: "add" \| "remove"}` | `{listIds}`, the repo's Lists after the change |
| `POST /unstar` | `{owner, name}` | `{}` |

From `/import`:

- `repos[]` has `node_id`, `github_id`, `full_name`, `description`, `language`, `topics`, `stars`, `pushed_at`, `is_archived` and more.
- `lists[]` has `id`, `name`, `description`, and `repos[]` of `{githubId, nodeId, fullName}`.

For `/membership`, `repoNodeId` is a repo's `node_id`, `repoGithubId` is its `github_id`,
and `githubListId` is a List's `id`. The server re-reads the repo's Lists from GitHub and
changes only the one you name.

Health scores run 0 to 10. `/health` scores 20 repos per GitHub request with a second
between requests, so all your stars at once can take a few minutes.

## Example: sort one repo into a List

```bash
API=http://127.0.0.1:5185/api/local
curl -s -X POST $API/import -H 'Content-Type: application/json' -d '{}' > stars.json

curl -s -X POST $API/membership -H 'Content-Type: application/json' -d '{
  "repoNodeId": "R_kgDOxxxxxx",
  "repoGithubId": 123456789,
  "githubListId": "UL_kwDOxxxxxx",
  "change": "add"
}'
```

## Undo

Before it opens, every launch backs up your stars and Lists to
`~/.github-stars-organizer/backups/<login>/`. The app's Backups page restores one,
adding back anything that's missing without removing what you've added since.

## Self-hosted

A self-hosted install (Docker, the all-in-one image or an app store) serves the same
kind of API on its own address, under `/api`. The robot icon beside **Import Stars**
shows a copy-paste prompt with the right address filled in.

With sign-in on (`AUTH_PASSWORD` or OIDC), send `Authorization: Bearer <AGENT_API_TOKEN>`
with every request. Use the `AGENT_API_TOKEN` you set, or read the one generated on
first start from the `instance_secret` table. Without sign-in, no header is needed.

Every request except `GET` needs `Content-Type: application/json`.

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/agent/stars` | | `{repos, lists}`: every star with the Lists it is in |
| `POST /api/lists/create` | `{name, description}` | `{list}`, the new List with its `id` |
| `POST /api/lists/:id/add-repo` | `{repo_id}` | `{item}` |
| `POST /api/lists/:id/remove-repo` | `{repo_id}` | `{}` |
| `POST /api/repos/:id/unstar` | `{}` | `{}` |
| `GET /api/repos/:id/similar` | | `{similar}`: repos like this one, found through GitHub search |

`repos[]` has `id` (what `repo_id` and `/repos/:id` take), `full_name`, `description`,
`language`, `topics`, `stars`, `pushed_at`, `is_archived`, `health_score`,
`usefulness_rating`, `notes` and `list_ids`. `lists[]` has `id`, `name` and `description`.
Every write goes to GitHub first and is refused if GitHub refuses it.

```bash
API=https://stars.example.com/api
AUTH="Authorization: Bearer $AGENT_API_TOKEN"
curl -s $API/agent/stars -H "$AUTH" > stars.json

curl -s -X POST $API/lists/<list id>/add-repo -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"repo_id": "<repo id>"}'
```

`/similar` spends up to three of the token's 30 GitHub searches a minute, so ask for one
repo at a time.
