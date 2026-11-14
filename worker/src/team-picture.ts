import { savedTeamCard } from "../../server/cards.ts";
import { finalUnits } from "../../server/run/saved-team.ts";
import { cacheKeyFor } from "./edge-cache.ts";
import type { OptOuts } from "./no-play.ts";
import { RunRefused, openTeam, playableTeam } from "./run.ts";
import type { TeamLinks } from "./team-links.ts";
import { png, shelfPlayer } from "./share.ts";

// The share picture of a finished run's team, drawn the way the run's picture is (worker/src/share.ts).
//
//   /api/card/team.png?t=<team token>

export const TEAM_PICTURE_PATH = /^\/api\/card\/team\.png$/;

// A token never changes what it says, so the picture can be cached as long as anything.
const CACHE_SECONDS = 86400;
const FONT_FAMILY = "Space Grotesk";

function image(bytes: Uint8Array): Response {
  return new Response(bytes, {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=${CACHE_SECONDS}`, "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" },
  });
}

/**
 * The picture, from the edge cache when it was drawn before. The owner's opt-out is
 * checked first, so a cached picture stops being served once they opt out.
 */
export async function teamPictureResponse(url: URL, key: string | undefined, optOuts: OptOuts, waitUntil: (work: Promise<unknown>) => void, links?: TeamLinks): Promise<Response> {
  if (!key) return new Response("Runs aren't set up on this server yet.", { status: 503 });
  try {
    const saved = await openTeam(url.searchParams.get("t") ?? "", key, links);
    await playableTeam(saved, "", optOuts);
    // A token is case-sensitive, so its picture is keyed exactly as asked.
    const cacheKey = cacheKeyFor(url, false);
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
    // Front row first, as the board stands the team.
    const team = finalUnits(saved).sort((one, other) => one.row - other.row || one.col - other.col).map((unit) => unit.fighter);
    const player = await shelfPlayer(saved.login, saved.avatarUrl, saved.character, team);
    const response = image(await png(savedTeamCard(player, saved.wins, saved.losses, FONT_FAMILY)));
    waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    if (error instanceof RunRefused) return new Response(error.message, { status: error.status });
    console.error(error);
    return new Response("The picture couldn't be drawn.", { status: 502 });
  }
}
