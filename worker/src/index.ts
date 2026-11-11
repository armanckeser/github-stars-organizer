import { fetchPublicLists, toPublicList, UserNotFoundError, type GraphQL } from "../../server/github-lists.ts";
import { BATTLE_PATH, RUN_POOL_PATH, TRAINER_PATH, battleResponse, poolResponse, trainerResponse } from "./battle.ts";
import { ART_PATH, CARD_PATH, artResponse, cardResponse } from "./cards.ts";
import { png } from "./draw.ts";
import { GAME_PATH, gameResponse } from "./game.ts";
import { SHARE_PATH, VERSUS_PATH, sharePage, versusResponse } from "./share.ts";

// BATTLE_KEY signs the teams in a battle's opening post (worker/src/game.ts):
//   npx wrangler secret put BATTLE_KEY   # any long random text
type Env = { GITHUB_TOKEN: string; BATTLE_KEY?: string };

const RESPONSE_SHAPE = "3";

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
    // The app's own page: anything but a plain read goes straight to the site.
    if (SHARE_PATH.test(url.pathname)) return request.method === "GET" ? sharePage(request, url) : fetch(request);
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

    // A match changes with every comment, so its replies set their own short cache and skip this one.
    const match = GAME_PATH.exec(url.pathname);
    if (match) return gameResponse(match[1], url.searchParams, env.GITHUB_TOKEN, env.BATTLE_KEY);

    const card = CARD_PATH.exec(url.pathname);
    const fight = BATTLE_PATH.exec(url.pathname);
    const trainer = TRAINER_PATH.test(url.pathname);
    const versus = VERSUS_PATH.test(url.pathname);
    const pool = RUN_POOL_PATH.test(url.pathname);
    const art = ART_PATH.test(url.pathname);
    if (card || fight || trainer || versus || pool || art) {
      // Sorted, so one card asked for with its parameters in another order shares an entry.
      url.searchParams.sort();
      // Usernames ignore case on GitHub, so a battle's two names are keyed in lower case.
      // The version goes up whenever a reply's shape changes, so a deploy never serves
      // an older shape to the newer app out of the cache.
      const keyUrl = new URL(fight || versus || pool ? url.toString().toLowerCase() : url.toString());
      keyUrl.searchParams.set("_shape", RESPONSE_SHAPE);
      const key = new Request(keyUrl.toString());
      const cached = await caches.default.match(key);
      if (cached) return cached;
      const response = art
        ? await artResponse(url.searchParams, env.GITHUB_TOKEN, png)
        : pool
        ? await poolResponse(url.searchParams, env.GITHUB_TOKEN)
        : versus
        ? await versusResponse(url.searchParams, env.GITHUB_TOKEN)
        : trainer
        ? await trainerResponse(url.searchParams, env.GITHUB_TOKEN)
        : fight
          ? await battleResponse(fight[1], url.searchParams, env.GITHUB_TOKEN)
          : await cardResponse(card![1], url.searchParams, env.GITHUB_TOKEN, png);
      if (response.headers.get("Cache-Control") !== "no-store") context.waitUntil(caches.default.put(key, response.clone()));
      return response;
    }
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
