import { savedTeamCard } from "../../server/cards.ts";
import { finalUnits } from "../../server/run/saved-team.ts";
import { RunRefused, openTeam } from "./run.ts";
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

export async function teamPictureResponse(params: URLSearchParams, key: string | undefined): Promise<Response> {
  if (!key) return new Response("Runs aren't set up on this server yet.", { status: 503 });
  try {
    const saved = await openTeam(params.get("t") ?? "", key);
    // Front row first, as the board stands the team.
    const team = finalUnits(saved).sort((one, other) => one.row - other.row || one.col - other.col).map((unit) => unit.fighter);
    const player = await shelfPlayer(saved.login, saved.avatarUrl, saved.character, team);
    return image(await png(savedTeamCard(player, saved.wins, saved.losses, FONT_FAMILY)));
  } catch (error) {
    if (error instanceof RunRefused) return new Response(error.message, { status: error.status });
    console.error(error);
    return new Response("The picture couldn't be drawn.", { status: 502 });
  }
}
