// A read through the Workers Cache API that can serve an old entry while it reads a
// new one. The Cache API has no stale-while-revalidate and keeps no time an entry was
// written, so each stored entry carries that time in a header of its own.
//
//   fresh   served as it is
//   stale   served at once, and read again in the background (waitUntil)
//   expired read again before answering
//
// The Cache API keeps entries in one data center only, so the first read in each
// region still waits on the read.

import { RESPONSE_SHAPE } from "../../server/response-shape.ts";

export const SECOND = 1000;
export const HOUR = 3600 * SECOND;
export const DAY = 24 * HOUR;

// The cache entry for a read: sorted, so one card asked for with its parameters in
// another order shares an entry, and keyed on the reply's shape (server/response-shape.ts).
export function cacheKeyFor(url: URL, lowerCase: boolean): Request {
  const keyUrl = new URL(lowerCase ? url.toString().toLowerCase() : url.toString());
  keyUrl.searchParams.sort();
  keyUrl.searchParams.set("_shape", RESPONSE_SHAPE);
  return new Request(keyUrl.toString());
}

/** When the entry was stored, in milliseconds since the epoch. */
export const WRITTEN_AT = "X-Stard-Written-At";

// The browser holds a reply for at most this long, however long the edge keeps it,
// so a refreshed entry reaches a returning visitor within the hour.
const BROWSER_HOLD = HOUR;

/** How long an entry is served as it is (`fresh`), and how long it may be served at all (`keep`). Milliseconds. */
export type Lifetime = { fresh: number; keep: number };

export type EdgeCache = Pick<Cache, "match" | "put">;

/** What a read needs from the Worker: the cache, the clock, and a way to finish work after the reply is sent. */
export type CacheDeps = { cache: EdgeCache; now: number; waitUntil: (work: Promise<unknown>) => void };

type Age = "fresh" | "stale" | "expired";

// Only a good reply is kept for the long window. An error reply that got stored
// (an unknown login's 404) lives one fresh window and is never served stale.
const keepOf = (entry: Response, lifetime: Lifetime) => (entry.ok ? lifetime.keep : lifetime.fresh);

function ageOf(entry: Response, lifetime: Lifetime, now: number): Age {
  const writtenAt = Number(entry.headers.get(WRITTEN_AT) ?? Number.NaN);
  // Stored before entries carried their time: usable, but read again.
  if (!Number.isFinite(writtenAt)) return entry.ok ? "stale" : "expired";
  const age = now - writtenAt;
  if (age < lifetime.fresh) return "fresh";
  return age < keepOf(entry, lifetime) ? "stale" : "expired";
}

// A no-store reply (GitHub didn't answer) is never stored.
const NO_STORE = "no-store";

function forStorage(reply: Response, lifetime: Lifetime, now: number): Response {
  const stored = new Response(reply.clone().body, reply);
  stored.headers.set("Cache-Control", `public, max-age=${Math.ceil(keepOf(reply, lifetime) / SECOND)}`);
  stored.headers.set(WRITTEN_AT, String(now));
  return stored;
}

function forBrowser(entry: Response, holdFor: number): Response {
  const reply = new Response(entry.body, entry);
  reply.headers.set("Cache-Control", `public, max-age=${Math.max(0, Math.floor(Math.min(holdFor, BROWSER_HOLD) / SECOND))}`);
  return reply;
}

// A stale entry is replaced only by a good reply: a failed or refused read leaves it
// in place, to be tried again by the next visitor.
async function refresh(key: Request, read: () => Promise<Response>, lifetime: Lifetime, deps: CacheDeps): Promise<void> {
  try {
    const reply = await read();
    if (reply.ok && reply.headers.get("Cache-Control") !== NO_STORE) await deps.cache.put(key, forStorage(reply, lifetime, deps.now));
  } catch (error) {
    console.error(error);
  }
}

/**
 * The cached reply for `key`, read with `read` when there is none yet.
 *
 * Args:
 *   key: The cache entry's key.
 *   read: Builds the reply from the source (GitHub).
 *   lifetime: How long an entry is fresh, and how long it may be served.
 *   deps: The cache, the time now, and the request's waitUntil.
 *
 * Returns:
 *   The reply to send. A stale entry is sent at once while a new one is read.
 */
export async function readThrough(key: Request, read: () => Promise<Response>, lifetime: Lifetime, deps: CacheDeps): Promise<Response> {
  const entry = await deps.cache.match(key);
  const age = entry ? ageOf(entry, lifetime, deps.now) : "expired";
  if (entry && age === "fresh") {
    const writtenAt = Number(entry.headers.get(WRITTEN_AT));
    return forBrowser(entry, lifetime.fresh - (deps.now - writtenAt));
  }
  if (entry && age === "stale") {
    deps.waitUntil(refresh(key, read, lifetime, deps));
    return forBrowser(entry, 0);
  }

  const reply = await read();
  // An expired good entry is still a good entry: only a good reply replaces it.
  const replaces = entry === undefined || !entry.ok || reply.ok;
  if (replaces && reply.headers.get("Cache-Control") !== NO_STORE) deps.waitUntil(deps.cache.put(key, forStorage(reply, lifetime, deps.now)));
  return reply;
}
