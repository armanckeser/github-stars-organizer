import type { Repo } from "./collections";
import { APP_MODE } from "./mode";
import { localApi, type TokenResponse } from "./local-api";
import { findSimilar, readmeLead, type SearchItem, type SimilarRepo } from "../../server/similar";

// GitHub lookups the app makes on request rather than on import: repos similar
// to a star, and which token the app is using. Each mode reaches GitHub its own
// way (mode.ts); the demo has no token and asks GitHub directly.

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${response.status}).`);
  return body as T;
}

// Without a token GitHub allows 10 searches a minute per visitor, enough for
// three lookups; its "rate limit" answer is a 403.
async function demoSearch(q: string, sort: "stars" | "best-match"): Promise<SearchItem[]> {
  const params = new URLSearchParams({ q, per_page: "30" });
  if (sort === "stars") params.set("sort", "stars");
  const response = await fetch(`https://api.github.com/search/repositories?${params}`);
  if (response.status === 403 || response.status === 429) {
    throw new Error("GitHub allows a few searches a minute without signing in. Try again in a minute.");
  }
  return (await json<{ items: SearchItem[] }>(response)).items;
}

async function demoReadme(fullName: string): Promise<string | null> {
  const response = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
    headers: { Accept: "application/vnd.github.raw" },
  });
  return response.ok ? readmeLead(await response.text()) : null;
}

export async function fetchSimilar(repo: Repo): Promise<SimilarRepo[]> {
  const source = {
    full_name: repo.full_name, description: repo.description, language: repo.language,
    topics: repo.topics, stars: repo.stars,
  };
  if (APP_MODE === "local") return (await localApi.similar({ repo: source })).similar;
  if (APP_MODE === "demo") return findSimilar({ ...source, readme: await demoReadme(repo.full_name) }, demoSearch);
  return (await json<{ similar: SimilarRepo[] }>(await fetch(`${API_URL}/api/repos/${repo.id}/similar`))).similar;
}

export async function fetchTokenInfo(): Promise<TokenResponse | null> {
  if (APP_MODE === "demo") return null;
  if (APP_MODE === "local") return localApi.token();
  return json<TokenResponse>(await fetch(`${API_URL}/api/github-token`));
}
