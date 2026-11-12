import { fetchPublicLists, toPublicList, UserNotFoundError, type GraphQL } from "../../server/github-lists.ts";
import { BATTLE_PATH, RUN_POOL_PATH, TRAINER_PATH, battleResponse, trainerResponse } from "./battle.ts";
import { CARD_PATH, cardResponse } from "./cards.ts";
import { cacheKeyFor } from "./edge-cache.ts";
import { GAME_PATH, gameResponse } from "./game.ts";
import { OPPONENTS_PATH, OptedOut, checkPoolRead, opponentsBody, readOptOuts, type OptOuts } from "./no-play.ts";
import { cachedPool, poolReply, type PoolDeps } from "./pool.ts";
import { RUN_PATH, runResponse, type RunDeps } from "./run.ts";
import { SHARE_PATH, VERSUS_PATH, sharePage, versusResponse } from "./share.ts";
import { TEAM_PAGE_PATH, TEAM_PATH, teamPage, teamResponse } from "./team.ts";
import { TEAM_PICTURE_PATH, teamPictureResponse } from "./team-picture.ts";

// BATTLE_KEY signs the teams in a battle's opening post (worker/src/game.ts), a run's token (worker/src/run.ts)
// and a finished run's team (worker/src/team.ts):
//   npx wrangler secret put BATTLE_KEY   # any long random text
type Env = { GITHUB_TOKEN: string; BATTLE_KEY?: string };

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

function json(body: unknown, status: number, cacheSeconds = 0, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
      ...headers,
    },
  });
}

// The Play screen reads the run's GET routes from the Worker's origin, like /api/run/pool.
const OPEN = { "Access-Control-Allow-Origin": "*" };

// Who opted out of being played against, read once an hour per set of logins, so an
// opt-out takes effect within the hour.
function cachedOptOuts(origin: string, env: Env, context: ExecutionContext): OptOuts {
  return async (logins) => {
    const url = new URL("/api/run/no-play", origin);
    url.searchParams.set("logins", [...logins].map((login) => login.toLowerCase()).sort().join(","));
    const key = cacheKeyFor(url, true);
    const cached = await caches.default.match(key);
    if (cached) return ((await cached.json()) as { optedOut: string[] }).optedOut;
    const optedOut = await readOptOuts(env.GITHUB_TOKEN, logins);
    context.waitUntil(caches.default.put(key, json({ optedOut }, 200, CACHE_SECONDS)));
    return optedOut;
  };
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
    const now = Date.now();
    const pools: PoolDeps = { cache: caches.default, now, waitUntil: (work) => context.waitUntil(work), origin: url.origin, token: env.GITHUB_TOKEN };
    const optOuts = cachedOptOuts(url.origin, env, context);
    const run = RUN_PATH.exec(url.pathname);
    const runs: RunDeps = { key: env.BATTLE_KEY, read: (login) => cachedPool(login, pools), optedOut: optOuts, now };
    if (run) return runResponse(run[1], request, runs);
    // A finished run's team: saved by replaying the run, read back from its token, its page and its picture.
    if (TEAM_PAGE_PATH.test(url.pathname)) return request.method === "GET" ? teamPage(request, url, env.BATTLE_KEY) : fetch(request);
    if (TEAM_PATH.test(url.pathname)) return teamResponse(request, url, runs);
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

    if (OPPONENTS_PATH.test(url.pathname)) {
      try {
        return json(await opponentsBody(optOuts), 200, 0, OPEN);
      } catch (error) {
        console.error(error);
        return json({ error: "GitHub didn't answer. Try again shortly." }, 502, 0, OPEN);
      }
    }

    // A match changes with every comment, so its replies set their own short cache and skip this one.
    const match = GAME_PATH.exec(url.pathname);
    if (match) return gameResponse(match[1], url.searchParams, env.GITHUB_TOKEN, env.BATTLE_KEY);

    if (TEAM_PICTURE_PATH.test(url.pathname)) {
      // A token is case-sensitive, so its picture is keyed exactly as asked.
      const key = cacheKeyFor(url, false);
      const cached = await caches.default.match(key);
      if (cached) return cached;
      const response = await teamPictureResponse(url.searchParams, env.BATTLE_KEY);
      if (response.ok) context.waitUntil(caches.default.put(key, response.clone()));
      return response;
    }

    const card = CARD_PATH.exec(url.pathname);
    const fight = BATTLE_PATH.exec(url.pathname);
    const trainer = TRAINER_PATH.test(url.pathname);
    const versus = VERSUS_PATH.test(url.pathname);
    if (RUN_POOL_PATH.test(url.pathname)) {
      try {
        await checkPoolRead(url.searchParams, optOuts);
      } catch (error) {
        if (error instanceof OptedOut) return json({ error: error.message }, error.status, 0, OPEN);
        console.error(error);
        return json({ error: "GitHub didn't answer. Try again shortly." }, 502, 0, OPEN);
      }
      // Whose run the read is for decides only the check above; everyone shares one cached pool.
      return poolReply(url.searchParams.get("login") ?? "", pools);
    }
    if (card || fight || trainer || versus) {
      // Usernames ignore case on GitHub, so a battle's two names are keyed in lower case.
      const key = cacheKeyFor(url, Boolean(fight || versus));
      const cached = await caches.default.match(key);
      if (cached) return cached;
      const response = versus
        ? await versusResponse(url.searchParams, env.GITHUB_TOKEN)
        : trainer
        ? await trainerResponse(url.searchParams, env.GITHUB_TOKEN)
        : fight
          ? await battleResponse(fight[1], url.searchParams, env.GITHUB_TOKEN)
          : await cardResponse(card![1], url.searchParams, env.GITHUB_TOKEN);
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
