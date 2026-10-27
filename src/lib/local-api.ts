import type { Repo } from "./collections";
import type { GitHubList, RepoListChange } from "../../server/github-lists";
import type { SimilarRepo, SimilarSource } from "../../server/similar";
import type { Backup, BackUpRequest, BackupSummary, RestorePlan } from "./backup";

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
export type BackupsResponse = { directory: string; backups: BackupSummary[] };
export type RestoreRequest = { backupId: string };
export type FailedWrite = { what: string; reason: string };
export type RestoreResult = {
  restarred: number;
  recreatedLists: number;
  /** Memberships attempted; any that failed are in `failed`. */
  addedToLists: number;
  failed: FailedWrite[];
  beforeRestore: BackupSummary;
};
export type ErrorResponse = { error: string };
export type TokenResponse = { connected: boolean; login?: string; scopes?: string[] | null; error?: string };
export type SimilarRequest = { repo: SimilarSource };
export type SimilarResponse = { similar: SimilarRepo[] };

async function call<TResponse>(method: string, path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(`/api/local/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
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
  listBackups: () => call<BackupsResponse>("GET", "backups", undefined),
  backUpNow: (request: BackUpRequest) => call<BackupSummary>("POST", "backups", request),
  readBackup: (id: string) => call<Backup>("GET", `backups/${encodeURIComponent(id)}`, undefined),
  uploadBackup: (backup: unknown) => call<BackupSummary>("POST", "backups/upload", backup),
  planRestore: (request: RestoreRequest) => call<RestorePlan>("POST", "restore/plan", request),
  applyRestore: (request: RestoreRequest) => call<RestoreResult>("POST", "restore/apply", request),
  token: () => call<TokenResponse>("GET", "token", undefined),
  similar: (request: SimilarRequest) => call<SimilarResponse>("POST", "similar", request),
};
