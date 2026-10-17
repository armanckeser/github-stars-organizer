import type { Repo } from "./collections";
import type { GitHubList, RepoListChange } from "../../server/github-lists";

// The contract between the browser and the npx CLI's localhost server
// (cli/src/server.ts). The server holds the gh token and only talks to GitHub;
// the browser owns every row, so each call carries the GitHub ids it needs.

export const LOCAL_APP_SIGNATURE = "github-stars-organizer";

// The repo fields GitHub owns. Notes, rating and health live only in the browser.
export type GitHubRepo = Pick<
  Repo,
  | "github_id" | "node_id" | "name" | "full_name" | "owner" | "description" | "url" | "homepage"
  | "language" | "stars" | "forks" | "topics" | "starred_at" | "is_archived" | "pushed_at" | "created_at"
>;

export type ImportResponse = { repos: GitHubRepo[]; lists: GitHubList[] };

export type HealthRequest = { repos: { node_id: string; stars: number; health_refreshed_at: string | null }[] };
export type HealthScore = {
  node_id: string;
  score: number;
  data: Record<string, number | string>;
  is_archived: boolean;
  stars: number;
};
export type HealthResponse = { scores: HealthScore[] };

export type CreateListRequest = { name: string; description: string | null };
export type CreateListResponse = { githubListId: string };
export type UpdateListRequest = { name?: string; description?: string | null };
// One List at a time: the server re-reads the repo's Lists from GitHub and changes
// only this one, so the browser's copy being stale can't drop the others.
export type MembershipRequest = RepoListChange;
export type MembershipResponse = { listIds: string[] };
export type UnstarRequest = { owner: string; name: string };
export type PingResponse = { app: typeof LOCAL_APP_SIGNATURE };
export type ErrorResponse = { error: string };

async function call<TResponse>(method: string, path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(`/api/local/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as TResponse | ErrorResponse;
  if (!response.ok) {
    throw new Error((json as ErrorResponse).error ?? `GitHub request failed (${response.status}).`);
  }
  return json as TResponse;
}

export const localApi = {
  importStars: () => call<ImportResponse>("POST", "import", {}),
  scoreHealth: (request: HealthRequest) => call<HealthResponse>("POST", "health", request),
  createList: (request: CreateListRequest) => call<CreateListResponse>("POST", "lists", request),
  updateList: (githubListId: string, request: UpdateListRequest) =>
    call<Record<string, never>>("PATCH", `lists/${encodeURIComponent(githubListId)}`, request),
  deleteList: (githubListId: string) =>
    call<Record<string, never>>("DELETE", `lists/${encodeURIComponent(githubListId)}`, {}),
  changeMembership: (request: MembershipRequest) => call<MembershipResponse>("POST", "membership", request),
  unstar: (request: UnstarRequest) => call<Record<string, never>>("POST", "unstar", request),
};
