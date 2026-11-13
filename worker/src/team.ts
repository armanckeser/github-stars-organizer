import { BOOST_ROUNDS, boostById } from "../../server/run/boosts.ts";
import { LOSSES_TO_END, OPPONENTS, ROUND_GOLD, SLOT_COST, START_GOLD, WINS_TO_FINISH, WIN_GOLD, boardLimit, inHalf, winnerOf, type RunFighter } from "../../server/run/rules.ts";
import { SAVED_TEAM_VERSION, finalUnits, recordOf, type SavedRound, type SavedTeam } from "../../server/run/saved-team.ts";
import type { Snapshot } from "../../server/run/types.ts";
import { LOGIN } from "./cards.ts";
import type { CountEvent } from "./events.ts";
import type { OptOuts } from "./no-play.ts";
import { seal } from "./sealed.ts";
import {
  BAD_REQUEST, CORS, REFUSED, RunRefused, TEAM_PACKING, TEAM_PURPOSE, fight, fightSeed, integer, json, openTeam, opponentAt, playableTeam, readBody, type RunDeps,
} from "./run.ts";

// A finished run's team, for its share link. The Play screen plays a run in the
// browser, so before the Worker signs a team it plays the run's fights again itself:
// every card has to be one of the player's cards (numbers from the Worker,
// not the browser), each round's team has to fit that round's board, and the record is
// the one these fights give. The link then carries the team, so it never needs storing.
// An account that opted out of being played against (worker/src/no-play.ts) gets no
// team link, and a link to its team stops opening once it opts out.
//
//   POST /api/run/team {login, seed, rounds, against?}  the team's token, and the team
//   GET  /api/run/team?t=<token>                  the team, once the token checks out
//   GET  /team?t=<token>[&to=<friend>]            the app's page, with the team's link-preview tags
//
// `rounds` is the team as fought at each round, round 1 first:
// `{units: [{repo: "owner/name", col, row}], boosts: [<boost id>]}`.
// `seed` is the run's seed (newRunSeed), which picked its opponents and seeded its fights.
// `against` is the token of the saved team the run was played against, if it was.

export const TEAM_PATH = /^\/api\/run\/team$/;
export const TEAM_PAGE_PATH = /^\/team\/?$/;

// A draw counts for neither side, so a run can go past its 7th round; this only bounds the replay's work.
const MAX_ROUNDS = 20;
// A token never changes what it says, so its team can be cached as long as anything.
const CACHE_SECONDS = 86400;
// newRunSeed's is 32 characters; this only bounds what a request may send.
const MAX_SEED_CHARS = 64;

/**
 * The most board slots a player could have bought by a round: every gold piece a run
 * can hold by then (each round's gold and a win's), spent on slots. The replay doesn't
 * follow gold, so this bounds a round's board without knowing what was bought.
 */
const mostSlotsBy = (round: number) => Math.floor((START_GOLD + (round - 1) * (ROUND_GOLD + WIN_GOLD)) / SLOT_COST);

type PlayedRound = { units: { repo: string; col: number; row: number }[]; boosts: string[] };

function roundIn(value: unknown, number: number): PlayedRound {
  const round = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  if (!Array.isArray(round.units)) throw new RunRefused(`Round ${number} has no team.`, BAD_REQUEST);
  const boosts = round.boosts ?? [];
  if (!Array.isArray(boosts) || boosts.some((boost) => typeof boost !== "string")) throw new RunRefused(`Round ${number}'s boosts are their ids.`, BAD_REQUEST);
  const units = round.units.map((unit: unknown) => {
    const cell = typeof unit === "object" && unit !== null ? (unit as Record<string, unknown>) : {};
    if (typeof cell.repo !== "string") throw new RunRefused(`A card in round ${number} has no repo.`, BAD_REQUEST);
    return { repo: cell.repo, col: integer(cell.col, "col"), row: integer(cell.row, "row") };
  });
  return { units, boosts: boosts as string[] };
}

function roundsIn(value: unknown): PlayedRound[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROUNDS) throw new RunRefused(`A run has 1 to ${MAX_ROUNDS} rounds.`, BAD_REQUEST);
  return value.map((round: unknown, i) => roundIn(round, i + 1));
}

/** A round's team as pool indexes, once it fits the rules for that round. */
function checkedRound(pool: RunFighter[], login: string, round: PlayedRound, number: number, before: string[]): SavedRound {
  const limit = boardLimit(number, mostSlotsBy(number));
  if (round.units.length === 0 || round.units.length > limit) throw new RunRefused(`A team holds 1 to ${limit} cards in round ${number}.`, REFUSED);
  const seen = new Set<number>();
  const cells = new Set<string>();
  const units = round.units.map((unit) => {
    const fighter = pool.findIndex((card) => card.fullName.toLowerCase() === unit.repo.toLowerCase());
    if (fighter === -1) throw new RunRefused(`${unit.repo} isn't one of ${login}'s cards.`, REFUSED);
    if (seen.has(fighter)) throw new RunRefused(`${unit.repo} is on the team twice in round ${number}.`, REFUSED);
    const cell = `${unit.col},${unit.row}`;
    if (!inHalf(unit.col, unit.row) || cells.has(cell)) throw new RunRefused(`Two cards share a cell, or a card is off the board, in round ${number}.`, REFUSED);
    seen.add(fighter);
    cells.add(cell);
    return { fighter, col: unit.col, row: unit.row };
  });
  const earned = BOOST_ROUNDS.filter((after) => after < number).length;
  const keepsEarlier = before.every((boost, i) => round.boosts[i] === boost);
  if (!keepsEarlier || round.boosts.length > earned || round.boosts.some((boost) => !boostById(boost))) throw new RunRefused(`Round ${number}'s boosts don't follow the run.`, REFUSED);
  return { units, boosts: round.boosts };
}

async function saveTeam(body: Record<string, unknown>, deps: RunDeps, key: string) {
  const login = typeof body.login === "string" ? body.login : "";
  if (!LOGIN.test(login)) throw new RunRefused("A team needs its player's GitHub username.", BAD_REQUEST);
  if (body.against !== undefined && typeof body.against !== "string") throw new RunRefused("A team to play against is its link's token.", BAD_REQUEST);
  const seed = typeof body.seed === "string" ? body.seed : "";
  if (seed.length === 0 || seed.length > MAX_SEED_CHARS) throw new RunRefused("A team needs its run's seed.", BAD_REQUEST);
  const played = roundsIn(body.rounds);
  const against = typeof body.against === "string" ? await openTeam(body.against, key) : null;
  // Nobody else may play against an opted-out account, so its team gets no link to be played from.
  // Asked before the stars are read, so a blocked account's are never read.
  const ownOptOut = await deps.optedOut([login]);
  if (ownOptOut.length > 0) throw new RunRefused(`${login} has asked not to be played against, so their team gets no link.`, REFUSED);
  const [player, optedOut] = await Promise.all([deps.read(login), deps.optedOut(OPPONENTS), against ? playableTeam(against, login, deps.optedOut) : null]);
  const day = new Date(deps.now).toISOString().slice(0, 10);

  const rounds: SavedRound[] = [];
  let wins = 0;
  let losses = 0;
  for (const [i, round] of played.entries()) {
    const number = i + 1;
    if (wins >= WINS_TO_FINISH || losses >= LOSSES_TO_END) throw new RunRefused(`The run was over before round ${number}.`, REFUSED);
    const checked = checkedRound(player.team, player.login, round, number, rounds.at(-1)?.boosts ?? []);
    const mine: Snapshot = { login: player.login, round: number, units: checked.units.map((unit) => ({ card: player.team[unit.fighter].card, col: unit.col, row: unit.row })), boosts: checked.boosts };
    const opponent = await opponentAt(player.login, number, seed, against, deps.read, optedOut);
    const winner = winnerOf(fight(mine, opponent.snapshot, fightSeed(player.login, opponent.login, number, seed)));
    if (winner === 0) wins++;
    if (winner === 1) losses++;
    rounds.push(checked);
  }
  if (wins < WINS_TO_FINISH && losses < LOSSES_TO_END) throw new RunRefused("The run isn't over yet.", REFUSED);

  // The saved team keeps only the cards it fielded, numbered in the order they first played.
  const fielded = [...new Set(rounds.flatMap((round) => round.units.map((unit) => unit.fighter)))];
  const saved: SavedTeam = {
    v: SAVED_TEAM_VERSION,
    login: player.login,
    avatarUrl: player.avatarUrl,
    character: player.character,
    day,
    wins,
    losses,
    fighters: fielded.map((index) => player.team[index]),
    rounds: rounds.map((round) => ({ ...round, units: round.units.map((unit) => ({ ...unit, fighter: fielded.indexOf(unit.fighter) })) })),
  };
  const token = await seal(saved, key, TEAM_PURPOSE, TEAM_PACKING);
  deps.count?.("team_saved");
  return { token, team: saved };
}

export async function teamResponse(request: Request, url: URL, deps: RunDeps): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
  if (request.method !== "POST" && request.method !== "GET") return json({ error: "Save a team with POST, read one with GET." }, 405);
  if (!deps.key) return json({ error: "Runs aren't set up on this server yet." }, 503);
  try {
    if (request.method === "POST") return json(await saveTeam(await readBody(request), deps, deps.key), 200);
    const team = await openTeam(url.searchParams.get("t") ?? "", deps.key);
    // Opened to be looked at or played against by anyone, so the owner's opt-out applies.
    await playableTeam(team, "", deps.optedOut);
    return new Response(JSON.stringify(team), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_SECONDS}`, ...CORS } });
  } catch (error) {
    if (error instanceof RunRefused) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "GitHub didn't answer. Try again shortly." }, 502);
  }
}

const attribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * What a team link's preview says. Anyone can type any username, so it names whose
 * stars the team was drafted from, never a person who played. A challenge link names
 * the friend it was sent to (`to`, a username once checked).
 */
export function teamPreview(saved: SavedTeam, to: string | null = null): { title: string; description: string; alt: string } {
  const record = recordOf(saved.wins, saved.losses);
  const cards = finalUnits(saved).map((unit) => unit.fighter.fullName.split("/")[1] ?? unit.fighter.fullName);
  return {
    title: to ? `@${saved.login} challenges @${to} · Stard` : `A team from @${saved.login}'s stars · Stard`,
    description: `${record}, with ${cards.join(", ")}. Beat this team on Stard.`,
    alt: `A team of repo cards from @${saved.login}'s stars, ${record}`,
  };
}

/**
 * The app's own page for /team, with the link-preview tags of the team in its address
 * (as /battle's in worker/src/share.ts). A team whose owner opted out gets the plain page.
 */
export async function teamPage(request: Request, url: URL, key: string | undefined, optOuts: OptOuts, count: CountEvent): Promise<Response> {
  const page = await fetch(request);
  if (!(page.headers.get("Content-Type") ?? "").includes("text/html")) return page;
  // The static host answers a deep link with its fallback page and a 404; the page is the app, so it is a 200.
  const headers = new Headers(page.headers);
  const token = url.searchParams.get("t") ?? "";
  let saved: SavedTeam;
  try {
    if (!key) throw new RunRefused("No key.", 503);
    saved = await openTeam(token, key);
    await playableTeam(saved, "", optOuts);
  } catch {
    return new Response(page.body, { status: 200, headers });
  }
  count("team_opened");

  const to = url.searchParams.get("to") ?? "";
  const challenged = LOGIN.test(to) ? to : null;
  const query = `t=${encodeURIComponent(token)}`;
  const { title, description: says, alt } = teamPreview(saved, challenged);
  const picture = `${url.origin}/api/card/team.png?${query}`;
  const tags = [
    ["property", "og:type", "website"],
    ["property", "og:url", `${url.origin}/team?${query}${challenged ? `&to=${challenged}` : ""}`],
    ["property", "og:title", title],
    ["property", "og:description", says],
    ["property", "og:image", picture],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", alt],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", says],
    ["name", "twitter:image", picture],
  ].map(([kind, name, value]) => `<meta ${kind}="${name}" content="${attribute(value)}" />`).join("");

  headers.set("Cache-Control", "public, max-age=300");
  return new HTMLRewriter()
    .on('meta[property^="og:"], meta[name^="twitter:"]', { element: (element) => void element.remove() })
    .on("title", { element: (element) => void element.setInnerContent(title) })
    .on("head", { element: (element) => void element.append(tags, { html: true }) })
    .transform(new Response(page.body, { status: 200, headers }));
}
