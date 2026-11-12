import { OPPONENTS } from "../../server/run/rules.ts";
import { poolResponse, type RunPool } from "./battle.ts";
import { DAY, HOUR, cacheKeyFor, readThrough, type CacheDeps, type Lifetime } from "./edge-cache.ts";
import { RunRefused } from "./run.ts";

// An account's pool, as the Play screen (GET /api/run/pool) and a run's referee
// (worker/src/run.ts) read it: one way in, one cache entry, so the two can't drift.
//
// A player's own stars should feel fresh, so their pool is read again after an hour.
// The opponents are the same dozen accounts for every player, so their pools are kept
// for a week and then served while a new one is read. An opponent's pool (its 21
// drawn cards, and their numbers as of the read) so changes about weekly; which of
// those cards it fields in a round still changes with the run's day (opponentUnits).

const PLAYER_POOL: Lifetime = { fresh: HOUR, keep: HOUR };
const OPPONENT_POOL: Lifetime = { fresh: 7 * DAY, keep: 30 * DAY };
const OPPONENT_LOGINS = new Set<string>(OPPONENTS);

/** What reading a pool needs: the edge cache, the Worker's origin, and the GitHub token. */
export type PoolDeps = CacheDeps & { origin: string; token: string };

/** An account's pool as the reply to GET /api/run/pool, from the edge when it has one. */
export function poolReply(login: string, deps: PoolDeps): Promise<Response> {
  const url = new URL("/api/run/pool", deps.origin);
  url.searchParams.set("login", login);
  const lifetime = OPPONENT_LOGINS.has(login.toLowerCase()) ? OPPONENT_POOL : PLAYER_POOL;
  return readThrough(cacheKeyFor(url, true), () => poolResponse(url.searchParams, deps.token), lifetime, deps);
}

/**
 * An account's pool for a run.
 *
 * Raises:
 *   RunRefused: The account can't be played (unknown, no repos), or GitHub didn't answer.
 */
export async function cachedPool(login: string, deps: PoolDeps): Promise<RunPool> {
  const response = await poolReply(login, deps);
  const body = (await response.json()) as RunPool & { error?: string };
  if (!response.ok) throw new RunRefused(body.error ?? "GitHub didn't answer. Try again shortly.", response.status);
  return body;
}
