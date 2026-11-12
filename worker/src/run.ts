import type { Fighter } from "../../server/battle.ts";
import { BOOST_ROUNDS, boostOffer } from "../../server/run/boosts.ts";
import { fight as runFight } from "../../server/run/fight.ts";
import {
  LOSSES_TO_END, NoOpponentLeft, OPPONENTS, REROLL_COST, ROUND_GOLD, SHOP_SIZE, START_GOLD, WINS_TO_FINISH, WIN_GOLD,
  freeCell, inHalf, opponentLogin, opponentUnits, priceOf, shopFor, teamSizeAt, winnerOf, type RunFighter,
} from "../../server/run/rules.ts";
import type { Card, Fight, FightEvent, Placed, Side, Snapshot } from "../../server/run/types.ts";
import type { RunPool, Team } from "./battle.ts";
import { LOGIN } from "./cards.ts";
import { sign } from "./game.ts";
import type { OptOuts } from "./no-play.ts";

// A run, refereed here so its result can be trusted (rules in server/run/rules.ts).
// The Worker stores nothing: the whole run travels in a token signed with BATTLE_KEY,
// the way a match's opening post is signed (worker/src/game.ts).
//
//   POST /api/run/new {login}                 the ace, the first shop and the token
//   POST /api/run/act {token, <choice>, boost?}  one choice applied, the next token
//
// A choice is one of: `buy: <shop slot>`, `sell: <card>`, `reroll: true`,
// `place: {card, col, row}`, `fight: true`. A card is its index in `run.pool`.
// With no choice, `act` answers with the run as the token holds it (a reload).
// `boost: <id>` picks one of `run.offer`, and has to come before any other choice.

export const RUN_PATH = /^\/api\/run\/(new|act)$/;

/** The fight engine, with abilities, set bonuses and boosts (server/run/game-rules.ts). */
const fight: Fight = runFight;

/** A card's numbers, frozen when the run starts: the pool deals each fighter with its run card (poolResponse). */
const cardOf = (fighter: RunFighter): Card => fighter.card;


const TOKEN_VERSION = 1;
// Signed with the token, so a match's signature can never pass for a run's.
const TOKEN_PURPOSE = "stard-run";
const MAX_BODY_CHARS = 64 * 1024;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const REFUSED = 422;
const UNAVAILABLE = 503;

/** A card on the team: `card` is its index in the pool. */
type Member = { card: number; col: number; row: number };
/** The player is side 0, so a winner of 0 is a won round. */
type Result = { round: number; opponent: string; winner: Side | null };
type RunStatus = "playing" | "finished" | "over";

/** Everything a run is, carried in the token. */
type RunState = {
  v: typeof TOKEN_VERSION;
  login: string;
  /** The day the run started (UTC). Seeds the shops and the opponents. */
  day: string;
  /** The ace first, then the day's draws, numbers frozen at the start. */
  pool: Card[];
  round: number;
  gold: number;
  rerolls: number;
  /** Pool indexes; null where a card was bought. */
  shop: (number | null)[];
  team: Member[];
  boosts: string[];
  /** Boost ids to pick one of; empty when no pick is due. */
  offer: string[];
  results: Result[];
};

type RunView = {
  login: string;
  day: string;
  status: RunStatus;
  round: number;
  wins: number;
  losses: number;
  gold: number;
  rerollCost: number;
  /** How many cards the team may hold this round. */
  teamSize: number;
  pool: Card[];
  shop: ({ card: number; price: number } | null)[];
  team: Member[];
  boosts: string[];
  offer: string[];
  /** Who this round is played against; null once the run is done. */
  opponent: string | null;
  results: Result[];
};

/** A played round: both snapshots and the seed, so anyone can replay the fight. */
type FightReport = {
  round: number;
  seed: string;
  opponent: { login: string; avatarUrl: string | null; character: Team["character"]; fighters: Fighter[] };
  teams: [Snapshot, Snapshot];
  events: FightEvent[];
  winner: Side | null;
};

type Choice =
  | { kind: "look" }
  | { kind: "buy"; slot: number }
  | { kind: "sell"; card: number }
  | { kind: "reroll" }
  | { kind: "place"; card: number; col: number; row: number }
  | { kind: "fight" };

const CHOICES = ["buy", "sell", "reroll", "place", "fight"] as const;

/**
 * What the Worker gives a run: its key, a way to read an account's cards for the day,
 * which accounts asked not to be played against (worker/src/no-play.ts), and the time.
 */
export type RunDeps = { key: string | undefined; read: (login: string) => Promise<RunPool>; optedOut: OptOuts; now: number };

/** A choice the rules don't allow, or a request that can't be read. The message is shown to the player. */
export class RunRefused extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS } });
}

function toBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function seal(state: RunState, key: string): Promise<string> {
  const payload = toBase64Url(JSON.stringify(state));
  return `${payload}.${await sign(key, `${TOKEN_PURPOSE}.${payload}`)}`;
}

// Compared in constant time, so the answer's timing says nothing about the signature.
async function verify(key: string, payload: string, signature: string): Promise<void> {
  const expected = await sign(key, `${TOKEN_PURPOSE}.${payload}`);
  let difference = expected.length ^ signature.length;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ (signature.charCodeAt(i) || 0);
  if (difference !== 0) throw new RunRefused("This run's token was changed, so the run can't go on.", FORBIDDEN);
}

async function unseal(token: string, key: string): Promise<RunState> {
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) throw new RunRefused("That isn't a run token.", BAD_REQUEST);
  await verify(key, payload, signature);
  const state = JSON.parse(fromBase64Url(payload)) as RunState;
  if (state.v !== TOKEN_VERSION) throw new RunRefused("This run is from an older version of the game. Start a new run.", BAD_REQUEST);
  return state;
}

const winsOf = (state: RunState) => state.results.filter((result) => result.winner === 0).length;
const lossesOf = (state: RunState) => state.results.filter((result) => result.winner === 1).length;

function statusOf(state: RunState): RunStatus {
  if (winsOf(state) >= WINS_TO_FINISH) return "finished";
  if (lossesOf(state) >= LOSSES_TO_END) return "over";
  return "playing";
}

function view(state: RunState, optedOut: readonly string[]): RunView {
  const status = statusOf(state);
  return {
    login: state.login,
    day: state.day,
    status,
    round: state.round,
    wins: winsOf(state),
    losses: lossesOf(state),
    gold: state.gold,
    rerollCost: REROLL_COST,
    teamSize: teamSizeAt(state.round),
    pool: state.pool,
    shop: state.shop.map((card) => (card === null ? null : { card, price: priceOf(state.pool[card].rarity) })),
    team: state.team,
    boosts: state.boosts,
    offer: state.offer,
    opponent: status === "playing" ? opponentLogin(state.login, state.round, state.day, optedOut) : null,
    results: state.results,
  };
}

function shopAt(state: Pick<RunState, "login" | "day" | "pool" | "team">, round: number, rerolls: number): number[] {
  const owned = state.team.map((member) => state.pool[member.card]);
  return shopFor({ login: state.login, team: state.pool }, owned, round, rerolls, SHOP_SIZE, state.day).map((card) => state.pool.indexOf(card));
}

function memberOf(state: RunState, card: number): Member {
  const member = state.team.find((other) => other.card === card);
  if (!member) throw new RunRefused("That card isn't on the team.", REFUSED);
  return member;
}

function pickBoost(state: RunState, boost: string): RunState {
  if (!state.offer.includes(boost)) throw new RunRefused("That boost isn't on offer.", REFUSED);
  return { ...state, boosts: [...state.boosts, boost], offer: [] };
}

function buy(state: RunState, slot: number): RunState {
  const index = state.shop[slot];
  if (index === undefined || index === null) throw new RunRefused("That shop slot is empty.", REFUSED);
  const card = state.pool[index];
  const price = priceOf(card.rarity);
  if (state.gold < price) throw new RunRefused("Not enough gold.", REFUSED);
  const cell = state.team.length < teamSizeAt(state.round) ? freeCell(state.team, card) : null;
  if (!cell) throw new RunRefused("The team is full this round.", REFUSED);
  return {
    ...state,
    gold: state.gold - price,
    shop: state.shop.map((other, i) => (i === slot ? null : other)),
    team: [...state.team, { card: index, ...cell }],
  };
}

function sell(state: RunState, card: number): RunState {
  const member = memberOf(state, card);
  return { ...state, gold: state.gold + priceOf(state.pool[card].rarity), team: state.team.filter((other) => other !== member) };
}

function reroll(state: RunState): RunState {
  if (state.gold < REROLL_COST) throw new RunRefused("Not enough gold.", REFUSED);
  const rerolls = state.rerolls + 1;
  return { ...state, gold: state.gold - REROLL_COST, rerolls, shop: shopAt(state, state.round, rerolls) };
}

// A card moved onto a taken cell trades places with the one standing there.
function place(state: RunState, card: number, col: number, row: number): RunState {
  if (!inHalf(col, row)) throw new RunRefused("That cell isn't on your half of the board.", REFUSED);
  const moved = memberOf(state, card);
  const team = state.team.map((member) => {
    if (member === moved) return { ...member, col, row };
    if (member.col === col && member.row === row) return { ...member, col: moved.col, row: moved.row };
    return member;
  });
  return { ...state, team };
}

// The opponent is picked from the accounts that haven't opted out, so an opted-out account is never read here.
async function playRound(state: RunState, deps: RunDeps, optedOut: readonly string[]): Promise<{ state: RunState; report: FightReport }> {
  const opponent = await deps.read(opponentLogin(state.login, state.round, state.day, optedOut));
  const theirs = opponentUnits(opponent, state.round, state.day);
  const mine: Snapshot = { login: state.login, round: state.round, units: state.team.map((member): Placed => ({ card: state.pool[member.card], col: member.col, row: member.row })), boosts: state.boosts };
  const against: Snapshot = { login: opponent.login, round: state.round, units: theirs.map((unit): Placed => ({ card: cardOf(unit.fighter), col: unit.col, row: unit.row })), boosts: [] };
  const seed = `${state.login}|${opponent.login}|${state.round}|${state.day}`;
  const events = fight(mine, against, seed);
  const winner = winnerOf(events);
  const report: FightReport = {
    round: state.round,
    seed,
    opponent: { login: opponent.login, avatarUrl: opponent.avatarUrl, character: opponent.character, fighters: theirs.map((unit) => unit.fighter) },
    teams: [mine, against],
    events,
    winner,
  };

  const played: RunState = { ...state, results: [...state.results, { round: state.round, opponent: opponent.login, winner }] };
  if (statusOf(played) !== "playing") return { state: { ...played, shop: [], offer: [] }, report };
  const round = state.round + 1;
  const next: RunState = {
    ...played,
    round,
    rerolls: 0,
    gold: state.gold + ROUND_GOLD + (winner === 0 ? WIN_GOLD : 0),
    shop: shopAt(played, round, 0),
    offer: (BOOST_ROUNDS as readonly number[]).includes(state.round) ? boostOffer(`${state.login}|${state.day}|${state.round}`, state.boosts) : [],
  };
  return { state: next, report };
}

function integer(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new RunRefused(`${what} has to be a whole number.`, BAD_REQUEST);
  return value;
}

function choiceIn(body: Record<string, unknown>): Choice {
  const given = CHOICES.filter((name) => body[name] !== undefined);
  if (given.length > 1) throw new RunRefused("One choice at a time.", BAD_REQUEST);
  const [name] = given;
  if (name === undefined) return { kind: "look" };
  if (name === "buy") return { kind: "buy", slot: integer(body.buy, "buy") };
  if (name === "sell") return { kind: "sell", card: integer(body.sell, "sell") };
  if (name === "reroll" || name === "fight") return { kind: name };
  const cell = typeof body.place === "object" && body.place !== null ? (body.place as Record<string, unknown>) : {};
  return { kind: "place", card: integer(cell.card, "place.card"), col: integer(cell.col, "place.col"), row: integer(cell.row, "place.row") };
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) throw new RunRefused("That request is too big.", BAD_REQUEST);
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body !== null && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // Answered below, the same as any other body that isn't an object.
  }
  throw new RunRefused("A run request is a JSON object.", BAD_REQUEST);
}

async function newRun(body: Record<string, unknown>, deps: RunDeps, key: string) {
  const login = typeof body.login === "string" ? body.login : "";
  if (!LOGIN.test(login)) throw new RunRefused("A run needs a GitHub username.", BAD_REQUEST);
  const [player, optedOut] = await Promise.all([deps.read(login), deps.optedOut(OPPONENTS)]);
  if (player.team.length === 0) throw new RunRefused(`${player.login} has no public repos to play with.`, NOT_FOUND);
  const pool = player.team.map(cardOf);
  const start: Omit<RunState, "shop"> = {
    v: TOKEN_VERSION,
    login: player.login,
    day: new Date(deps.now).toISOString().slice(0, 10),
    pool,
    round: 1,
    gold: START_GOLD,
    rerolls: 0,
    team: [{ card: 0, ...(freeCell([], pool[0]) ?? { col: 1, row: 0 }) }],
    boosts: [],
    offer: [],
    results: [],
  };
  const state: RunState = { ...start, shop: shopAt(start, 1, 0) };
  return {
    token: await seal(state, key),
    run: view(state, optedOut),
    player: { login: player.login, avatarUrl: player.avatarUrl, character: player.character },
    ace: player.team[0],
    /** Each pool card's repo, for drawing it: the same order as `run.pool`. */
    fighters: player.team,
  };
}

async function act(body: Record<string, unknown>, deps: RunDeps, key: string) {
  if (typeof body.token !== "string") throw new RunRefused("A choice needs the run's token.", BAD_REQUEST);
  const choice = choiceIn(body);
  let state = await unseal(body.token, key);
  if (body.boost !== undefined) {
    if (typeof body.boost !== "string") throw new RunRefused("A boost is its id.", BAD_REQUEST);
    state = pickBoost(state, body.boost);
  }
  const optedOut = await deps.optedOut(OPPONENTS);
  if (choice.kind === "look") return { token: await seal(state, key), run: view(state, optedOut) };
  if (statusOf(state) !== "playing") throw new RunRefused("This run is over. Start a new one.", REFUSED);
  if (state.offer.length > 0) throw new RunRefused("Pick a boost first.", REFUSED);

  if (choice.kind === "fight") {
    if (state.team.length === 0) throw new RunRefused("Put a card on the board to fight.", REFUSED);
    const played = await playRound(state, deps, optedOut);
    return { token: await seal(played.state, key), run: view(played.state, optedOut), fight: played.report };
  }
  const next =
    choice.kind === "buy" ? buy(state, choice.slot)
    : choice.kind === "sell" ? sell(state, choice.card)
    : choice.kind === "reroll" ? reroll(state)
    : place(state, choice.card, choice.col, choice.row);
  return { token: await seal(next, key), run: view(next, optedOut) };
}

export async function runResponse(kind: string, request: Request, deps: RunDeps): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
  if (request.method !== "POST") return json({ error: "A run is played with POST." }, 405);
  if (!deps.key) return json({ error: "Runs aren't set up on this server yet." }, 503);
  try {
    const body = await readBody(request);
    return json(kind === "new" ? await newRun(body, deps, deps.key) : await act(body, deps, deps.key), 200);
  } catch (error) {
    if (error instanceof RunRefused) return json({ error: error.message }, error.status);
    if (error instanceof NoOpponentLeft) return json({ error: error.message }, UNAVAILABLE);
    console.error(error);
    return json({ error: "GitHub didn't answer. Try again shortly." }, 502);
  }
}
