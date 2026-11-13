import { RARITY_STARS } from "../../server/run/stats.ts";
import { shuffled } from "../../server/run/rules.ts";
import { DAY, readThrough, type CacheDeps } from "./edge-cache.ts";

// Popular repos on GitHub, to top up the pool of an account with few stars, so the
// shop is never short (docs/GAME-DESIGN.md, "Added 2026-11-12"). A few come from each
// star band a rarity starts at, so a topped-up pool spreads over the same 2 to 5 gold
// as a pool of stars, and a newcomer doesn't get a pool of only 5-gold cards.
//
// The list is one GitHub search a day, shared by every player through the edge cache.
// Only repos older than a year that were pushed to in the last year are asked for, so a
// repo whose stars were bought last month, or one nobody keeps up, isn't dealt.

/** Names asked for from each band. A pool tops up by at most 20 cards. */
const PER_BAND = 10;
const YEAR = 365 * DAY;
const LIST: { fresh: number; keep: number } = { fresh: DAY, keep: 2 * DAY };

/** The popular repos for a day, one list of names per star band, cheapest band first. */
export type PopularList = string[][];

/** The star bands, from the stars an uncommon starts at up: `[low, high)`, the last with no top. */
const BANDS: [number, number | null][] = RARITY_STARS.map((low, i) => [low, RARITY_STARS[i + 1] ?? null]);

function bandQuery(band: [number, number | null], yearAgo: string): string {
  const [low, high] = band;
  const stars = high === null ? `stars:>=${low}` : `stars:${low}..${high - 1}`;
  return `${stars} archived:false created:<${yearAgo} pushed:>${yearAgo} sort:stars-desc`;
}

/** The GraphQL query for a day's list: one search per band, side by side. */
export function popularQuery(now: number): string {
  const yearAgo = new Date(now - YEAR).toISOString().slice(0, 10);
  const searches = BANDS.map((band, i) => ` b${i}: search(query: ${JSON.stringify(bandQuery(band, yearAgo))}, type: REPOSITORY, first: ${PER_BAND}) { nodes { ... on Repository { nameWithOwner } } }`);
  return `query {${searches.join("")} }`;
}

export type SearchNodes = { nodes: ({ nameWithOwner?: string } | null)[] } | null | undefined;

/** The day's list, read from GitHub. A band GitHub didn't answer is empty. */
export async function readPopular(read: (query: string) => Promise<Record<string, SearchNodes>>, now: number): Promise<PopularList> {
  const found = await read(popularQuery(now));
  return BANDS.map((_, i) => (found[`b${i}`]?.nodes ?? []).flatMap((node) => (node?.nameWithOwner ? [node.nameWithOwner] : [])));
}

/**
 * The day's list from the edge cache, read from GitHub once a day. A failed read isn't
 * kept, so the next pool tries again, and a pool is never refused for want of it.
 */
export async function cachedPopular(read: (query: string) => Promise<Record<string, SearchNodes>>, origin: string, deps: CacheDeps): Promise<PopularList> {
  const day = new Date(deps.now).toISOString().slice(0, 10);
  const key = new Request(new URL(`/api/run/popular?day=${day}`, origin));
  const reply = await readThrough(
    key,
    async () => {
      try {
        return Response.json(await readPopular(read, deps.now));
      } catch (error) {
        console.error(error);
        return new Response("[]", { status: 502, headers: { "Cache-Control": "no-store" } });
      }
    },
    LIST,
    deps,
  );
  return reply.ok ? ((await reply.json()) as PopularList) : [];
}

/**
 * `need` names from the list, one band after another, cheapest first, so a pool short
 * by one card gets a cheap one. Names in `taken` are skipped. `seed` picks which names
 * of each band, so two players topped up on the same day get different cards.
 */
export function pickPopular(list: PopularList, need: number, taken: readonly string[], seed: string): string[] {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  const bands = list.map((names, i) => shuffled(names.filter((name) => !used.has(name.toLowerCase())), `${seed}|${i}`));
  const picked: string[] = [];
  for (let turn = 0; picked.length < need && bands.some((band) => band.length > turn); turn++) {
    for (const band of bands) if (picked.length < need && turn < band.length) picked.push(band[turn]);
  }
  return picked;
}
