# Using Stars Organizer with an AI agent

While `npx github-stars-organizer` is running, it serves a local HTTP API on
`http://127.0.0.1:5185/api/local`. Any agent that can run `curl` can read your
stars and Lists, score repo health, and manage your GitHub Lists through it. Changes
land on GitHub, so the app's UI shows them the next time you press Import.

Tags, ratings and notes live in your browser, so an agent can't read or change them.

## Copy-paste prompt

```text
Stars Organizer is running at http://127.0.0.1:5185. Read
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
