import { fetchPublicLists, toPublicList, UserNotFoundError, type GraphQL } from "../../server/github-lists.ts";

type Env = { GITHUB_TOKEN: string };

// GitHub's own rule for logins: alphanumerics and single inner hyphens, at most 39.
// Anything else is rejected before it reaches GitHub, so this stays a fixed query
// and never a general GraphQL proxy on the owner's token.
const LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

// An hour keeps the shared token's 5,000 points/hour far away even when a demo
// link gets passed around, and Lists rarely change faster than that.
const CACHE_SECONDS = 3600;

type GraphQLResponse<T> = { data?: T; errors?: { type?: string; message: string }[] };

// GitHub answers the occasional GraphQL request with a 502 or 504; one retry
// clears nearly all of them, and more would eat the Worker's subrequest limit.
const RETRIED_STATUSES = new Set([502, 503, 504]);

function githubGraphQL(token: string): GraphQL {
  const request = async <T>(query: string, variables: Record<string, unknown>, attempt: number): Promise<T> => {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "stars-demo-lists",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (RETRIED_STATUSES.has(response.status) && attempt === 1) {
      return request<T>(query, variables, attempt + 1);
    }
    const json = (await response.json().catch(() => ({}))) as GraphQLResponse<T>;
    const firstError = json.errors?.[0];
    if (firstError?.type === "NOT_FOUND") throw new UserNotFoundError(firstError.message);
    if (!response.ok || firstError || !json.data) {
      throw new Error(firstError?.message ?? `GitHub returned ${response.status}`);
    }
    return json.data;
  };
  return (query, variables) => request(query, variables, 1);
}

function json(body: unknown, status: number, cacheSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
    },
  });
}

async function listsResponse(login: string, env: Env): Promise<Response> {
  try {
    const lists = await fetchPublicLists(githubGraphQL(env.GITHUB_TOKEN), login);
    return json({ lists: lists.map(toPublicList) }, 200, CACHE_SECONDS);
  } catch (error) {
    if (error instanceof UserNotFoundError) return json({ error: `No GitHub user called ${login}.` }, 404, CACHE_SECONDS);
    console.error(error);
    return json({ error: "Couldn't read Lists from GitHub." }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
    if (url.pathname !== "/api/lists") return json({ error: "Not found." }, 404);

    const login = url.searchParams.get("user") ?? "";
    if (!LOGIN.test(login)) return json({ error: "Not a GitHub username." }, 400);

    // Keyed on the lowercased login so ?user=Foo and ?user=foo share one entry.
    const cacheKey = new Request(`${url.origin}/api/lists?user=${login.toLowerCase()}`);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const response = await listsResponse(login, env);
    if (response.headers.get("Cache-Control") !== "no-store") {
      context.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  },
} satisfies ExportedHandler<Env>;
