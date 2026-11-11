import { TYPE_COLOR, runCard } from "../../server/cards.ts";
import { CLASSES } from "../../server/character.ts";
import { finalUnits } from "../../server/run/saved-team.ts";
import { avatarData } from "./cards.ts";
import { RunRefused, openTeam } from "./run.ts";
import { png } from "./share.ts";

// The share picture of a finished run's team, drawn the way the versus picture is (worker/src/share.ts).
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
    const team = finalUnits(saved).map((unit) => unit.fighter);
    // GitHub serves avatars at any size; the card shows this one large.
    const avatar = saved.avatarUrl ? await avatarData(saved.avatarUrl.replace(/([?&]s=)\d+/, "$1240")) : null;
    const klass = CLASSES[saved.character.klass];
    const side = {
      login: saved.login,
      name: saved.character.name,
      klass: klass.label,
      // A rookie has no class colour, so the ace's type colours the side, as on the versus picture.
      tint: saved.character.klass === "rookie" && team[0] ? TYPE_COLOR[team[0].type] : klass.color,
      look: saved.character.look,
      avatar,
      team: team.map((fighter) => ({ name: fighter.fullName.split("/")[1] ?? fighter.fullName, color: TYPE_COLOR[fighter.type], shiny: fighter.shiny })),
    };
    return image(await png(runCard(side, saved.wins, saved.losses, FONT_FAMILY)));
  } catch (error) {
    if (error instanceof RunRefused) return new Response(error.message, { status: error.status });
    console.error(error);
    return new Response("The picture couldn't be drawn.", { status: 502 });
  }
}
