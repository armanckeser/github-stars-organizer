import { listCard, messageCard, reviewCard, topFourCard, type CardRepo } from "../../server/cards.ts";
import { askGitHub } from "./github-budget.ts";

// The SVGs a profile README embeds (server/cards.ts draws them):
//
//   /api/card/top4.svg?user=<login>&repos=<owner/name,...>&ratings=<5,4.5,...>
//   /api/card/review.svg?user=<login>&repo=<owner/name>&rating=<4.5>&text=<what they wrote>
//   /api/card/list.svg?user=<login>&title=<name>&count=<n>&repos=<owner/name,...>
//
// Everything a card shows is in its address, so nothing is stored here. GitHub
// fetches each card through its image proxy and keeps its own copy for a while.

export const CARD_PATH = /^\/api\/card\/(top4|review|list)\.svg$/;

export const LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
export const REPO = /^[\w.-]{1,39}\/[\w.-]{1,100}$/;
const CACHE_SECONDS = 6 * 3600;
const MAX_REPOS = 6;
const MAX_REVIEW_CHARS = 400;

type RepoNode = {
  nameWithOwner: string;
  stargazerCount: number;
  primaryLanguage: { name: string; color: string | null } | null;
  owner: { avatarUrl: string };
};

// btoa wants a binary string; building one in chunks keeps a large avatar off the call stack.
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// An SVG shown through <img> can't load outside images, so each avatar goes in as data.
export async function avatarData(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const type = response.headers.get("Content-Type") ?? "image/png";
    return `data:${type};base64,${base64(new Uint8Array(await response.arrayBuffer()))}`;
  } catch {
    return null;
  }
}

// One fixed-shape query for the named repos. The names were checked against REPO, so
// this never becomes a general GraphQL proxy on the owner's token. A repo that is
// gone or private comes back null and is left off the card.
async function fetchRepos(token: string, names: string[]): Promise<CardRepo[]> {
  const fields = "nameWithOwner stargazerCount primaryLanguage { name color } owner { avatarUrl(size: 96) }";
  const query = `query {${names
    .map((name, i) => {
      const [owner, repo] = name.split("/");
      return ` r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repo)}) { ${fields} }`;
    })
    .join("")} }`;
  const response = await askGitHub(token, { query });
  const json = (await response.json().catch(() => ({}))) as { data?: Record<string, RepoNode | null> };
  if (!json.data) throw new Error(`GitHub returned ${response.status}`);
  const nodes = names.flatMap((_, i) => json.data![`r${i}`] ?? []);
  return Promise.all(
    nodes.map(async (node) => ({
      fullName: node.nameWithOwner,
      stars: node.stargazerCount,
      language: node.primaryLanguage?.name ?? null,
      color: node.primaryLanguage?.color ?? null,
      avatar: await avatarData(node.owner.avatarUrl),
    })),
  );
}

export function svg(body: string, status: number, cacheSeconds: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
      // A card holds text people typed. Opened directly it is a document on this
      // domain, so it may run nothing and load nothing but its own inline images.
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      // The app previews cards from other origins (a self-hosted copy, the npx version).
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function parseRating(value: string | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 5 ? Math.round(n * 2) / 2 : null;
}

export async function cardResponse(kind: string, params: URLSearchParams, token: string): Promise<Response> {
  const login = params.get("user") ?? "";
  if (!LOGIN.test(login)) return svg(messageCard("This card needs a GitHub username."), 400, CACHE_SECONDS);
  const names = (params.get("repos") ?? params.get("repo") ?? "")
    .split(",")
    .filter((name) => REPO.test(name))
    .slice(0, MAX_REPOS);
  if (names.length === 0) return svg(messageCard("This card has no repos to show."), 400, CACHE_SECONDS);
  try {
    const repos = await fetchRepos(token, names);
    if (repos.length === 0) return svg(messageCard("None of this card's repos could be found on GitHub."), 404, CACHE_SECONDS);
    if (kind === "top4") {
      // Ratings line up with the repos asked for, so a missing repo takes its rating with it.
      const asked = (params.get("ratings") ?? "").split(",");
      const found = new Map(repos.map((r) => [r.fullName.toLowerCase(), r]));
      const kept = names.slice(0, 4).flatMap((name, i) => {
        const repo = found.get(name.toLowerCase());
        return repo ? [{ repo, rating: parseRating(asked[i]) }] : [];
      });
      return svg(topFourCard(login, kept.map((k) => k.repo), kept.map((k) => k.rating)), 200, CACHE_SECONDS);
    }
    if (kind === "review") {
      const text = (params.get("text") ?? "").slice(0, MAX_REVIEW_CHARS);
      return svg(reviewCard(login, repos[0], parseRating(params.get("rating")), text), 200, CACHE_SECONDS);
    }
    const count = Math.max(Number.parseInt(params.get("count") ?? "", 10) || 0, repos.length);
    return svg(listCard(login, (params.get("title") ?? "").slice(0, 80) || "A list", count, repos), 200, CACHE_SECONDS);
  } catch (error) {
    console.error(error);
    return svg(messageCard("GitHub didn't answer. This card will be back shortly."), 502, 0);
  }
}
