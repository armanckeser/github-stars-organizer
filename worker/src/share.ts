import { Resvg, initWasm } from "@resvg/resvg-wasm";
import wasm from "@resvg/resvg-wasm/index_bg.wasm";
import { TYPE_COLOR, runPreviewCard, versusCard, type ShareCard, type ShelfPlayer, type VersusSide } from "../../server/cards.ts";
import { CLASSES, type Character } from "../../server/character.ts";
import { creatureRecipe } from "../../server/creature-recipe.ts";
import { priceOf, type RunFighter } from "../../server/run/rules.ts";
import { NoSuchUser, evened, teamFor, withRunCards, type Team } from "./battle.ts";
import { LOGIN, avatarData } from "./cards.ts";
import font from "./SpaceGrotesk-Bold.ttf";

// What a battle link looks like when it is shared (Slack, X, Discord, iMessage).
// Those read a page's tags without running it, and the app is one static page, so
// the Worker stands in front of /battle and writes the tags for the two usernames
// in the address. The picture they point at is drawn here too: link previews don't
// take SVG, so the card is turned into a PNG.
//
//   /battle?a=<login>&b=<login>[&play=1]      the app's page, with this battle's tags
//   /api/card/versus.png?a=<login>&b=<login>  the picture

export const VERSUS_PATH = /^\/api\/card\/versus\.png$/;
export const SHARE_PATH = /^\/battle\/?$/;

const CACHE_SECONDS = 3600;
const FONT_FAMILY = "Space Grotesk";

let ready: Promise<void> | undefined;

export async function png(svg: string): Promise<Uint8Array> {
  await (ready ??= initWasm(wasm));
  const drawn = new Resvg(svg, { font: { fontBuffers: [new Uint8Array(font)], loadSystemFonts: false, defaultFontFamily: FONT_FAMILY } }).render();
  const bytes = drawn.asPng();
  drawn.free();
  return bytes;
}

async function sideOf(team: Team): Promise<VersusSide> {
  // GitHub serves avatars at any size; the card shows this one large.
  const avatar = team.avatarUrl ? await avatarData(team.avatarUrl.replace(/([?&]s=)\d+/, "$1240")) : null;
  return {
    login: team.login,
    name: team.character.name,
    klass: CLASSES[team.character.klass].label,
    // A side is tinted with its class colour; a rookie has none, so the ace's type colours the side.
    tint: team.character.klass === "rookie" && team.team[0] ? TYPE_COLOR[team.team[0].type] : CLASSES[team.character.klass].color,
    look: team.character.look,
    avatar,
    team: team.team.map((fighter) => ({ name: fighter.fullName.split("/")[1] ?? fighter.fullName, color: TYPE_COLOR[fighter.type], shiny: fighter.shiny })),
  };
}

function image(bytes: Uint8Array, status: number, cacheSeconds: number): Response {
  return new Response(bytes, {
    status,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function versusResponse(params: URLSearchParams, token: string): Promise<Response> {
  const loginA = params.get("a") ?? "";
  const loginB = params.get("b") ?? "";
  if (!LOGIN.test(loginA) || !LOGIN.test(loginB)) return new Response("A battle needs two GitHub usernames.", { status: 400 });
  try {
    const now = Date.now();
    const [a, b] = evened(...(await Promise.all([teamFor(token, loginA, now), teamFor(token, loginB, now)])));
    const [left, right] = await Promise.all([sideOf(a), sideOf(b)]);
    return image(await png(versusCard(left, right, FONT_FAMILY)), 200, CACHE_SECONDS);
  } catch (error) {
    if (error instanceof NoSuchUser) return new Response(`No GitHub user called ${error.message}.`, { status: 404 });
    console.error(error);
    return new Response("The picture couldn't be drawn.", { status: 502 });
  }
}

const attribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The app's own page for /battle, with the link-preview tags of the battle in its address. */
export async function sharePage(request: Request, url: URL): Promise<Response> {
  const page = await fetch(request);
  if (!(page.headers.get("Content-Type") ?? "").includes("text/html")) return page;
  const a = url.searchParams.get("a") ?? "";
  const b = url.searchParams.get("b") ?? "";
  // The static host answers a deep link with its fallback page and a 404; the page is the app, so it is a 200.
  const headers = new Headers(page.headers);
  if (!LOGIN.test(a) || !LOGIN.test(b)) return new Response(page.body, { status: 200, headers });

  const query = `a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
  const title = `${a} vs ${b} · Stard battle`;
  const says = `${a}'s GitHub repos against ${b}'s, as cards. Watch the battle or start your own.`;
  const picture = `${url.origin}/api/card/versus.png?${query}`;
  const tags = [
    ["property", "og:type", "website"],
    // A preview opens the fight itself (play=1), with no team screen first.
    ["property", "og:url", `${url.origin}/battle?${query}&play=1`],
    ["property", "og:title", title],
    ["property", "og:description", says],
    ["property", "og:image", picture],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", `${a} and ${b}, each with a team of repo cards, facing each other`],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", says],
    ["name", "twitter:image", picture],
  ].map(([kind, key, value]) => `<meta ${kind}="${key}" content="${attribute(value)}" />`).join("");

  headers.set("Cache-Control", "public, max-age=300");
  const rewritten = new HTMLRewriter()
    .on('meta[property^="og:"], meta[name^="twitter:"]', { element: (element) => void element.remove() })
    .on("title", { element: (element) => void element.setInnerContent(title) })
    .on("head", { element: (element) => void element.append(tags, { html: true }) })
    .transform(new Response(page.body, { status: 200, headers }));
  return rewritten;
}

// A run link is shared the same way: the Worker stands in front of /run too.
//
//   /run?me=<login>              the app's page, with tags for a run with that player's stars
//   /run                         the app's page, with tags for a run with anyone's stars
//   /api/card/run.png?me=<login> the picture (no `me`: the picture for anyone)

export const RUN_PICTURE_PATH = /^\/api\/card\/run\.png$/;
export const RUN_SHARE_PATH = /^\/run\/?$/;

/** A run's cards as a share picture draws them, each with its creature. */
export function shareCards(fighters: RunFighter[]): ShareCard[] {
  return fighters.map((fighter) => ({
    name: fighter.fullName.split("/")[1] ?? fighter.fullName,
    cost: priceOf(fighter.card.rarity),
    sets: fighter.card.sets,
    language: fighter.language?.toLowerCase() ?? null,
    creature: creatureRecipe(fighter),
  }));
}

/** A player as a share picture draws them: their trainer, avatar and cards. */
export async function shelfPlayer(login: string, avatarUrl: string | null, character: Character, fighters: RunFighter[]): Promise<ShelfPlayer> {
  // GitHub serves avatars at any size; the picture shows this one large.
  const avatar = avatarUrl ? await avatarData(avatarUrl.replace(/([?&]s=)\d+/, "$1240")) : null;
  return { login, name: character.name, klass: CLASSES[character.klass].label, look: character.look, avatar, cards: shareCards(fighters) };
}

export async function runPictureResponse(params: URLSearchParams, token: string): Promise<Response> {
  const login = params.get("me");
  if (login === null) return image(await png(runPreviewCard(null, FONT_FAMILY)), 200, CACHE_SECONDS);
  if (!LOGIN.test(login)) return new Response("A run needs a GitHub username.", { status: 400 });
  try {
    const player = withRunCards(await teamFor(token, login, Date.now()));
    return image(await png(runPreviewCard(await shelfPlayer(player.login, player.avatarUrl, player.character, player.team.slice(0, 4)), FONT_FAMILY)), 200, CACHE_SECONDS);
  } catch (error) {
    if (error instanceof NoSuchUser) return new Response(`No GitHub user called ${error.message}.`, { status: 404 });
    console.error(error);
    return new Response("The picture couldn't be drawn.", { status: 502 });
  }
}

/** The app's own page for /run, with the link-preview tags of a run with the player in its address. */
export async function runSharePage(request: Request, url: URL): Promise<Response> {
  const page = await fetch(request);
  if (!(page.headers.get("Content-Type") ?? "").includes("text/html")) return page;
  const headers = new Headers(page.headers);
  const me = url.searchParams.get("me") ?? "";
  const named = LOGIN.test(me);

  const query = named ? `?me=${encodeURIComponent(me)}` : "";
  const title = named ? `Play Stard with ${me}'s stars` : "Play Stard with your GitHub stars";
  const says = named
    ? `Build a team from ${me}'s GitHub stars and fight other teams. 5 wins finishes a run, 3 losses ends one. No sign-in.`
    : "Build a team from your GitHub stars and fight other teams. 5 wins finishes a run, 3 losses ends one. No sign-in.";
  const picture = `${url.origin}/api/card/run.png${query}`;
  const tags = [
    ["property", "og:type", "website"],
    ["property", "og:url", `${url.origin}/run${query}`],
    ["property", "og:title", title],
    ["property", "og:description", says],
    ["property", "og:image", picture],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", named ? `${me}'s trainer beside four of their repos as cards, under the words Play Stard` : "A blank card of each cost, 1 to 5 gold, under the words Play Stard"],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", says],
    ["name", "twitter:image", picture],
  ].map(([kind, key, value]) => `<meta ${kind}="${key}" content="${attribute(value)}" />`).join("");

  // The static host answers a deep link with its fallback page and a 404; the page is the app, so it is a 200.
  headers.set("Cache-Control", "public, max-age=300");
  return new HTMLRewriter()
    .on('meta[property^="og:"], meta[name^="twitter:"]', { element: (element) => void element.remove() })
    .on("title", { element: (element) => void element.setInnerContent(title) })
    .on("head", { element: (element) => void element.append(tags, { html: true }) })
    .transform(new Response(page.body, { status: 200, headers }));
}
