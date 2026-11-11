// The async battle (issue #47): a match two people play over hours or days, with a
// GitHub Discussion as the only record. The opening post holds both teams; every move
// is a comment. This file is the referee: given the opening and the comments, it works
// out the whole match. Pure and deterministic, so the Worker, the app and anyone else
// replaying a thread arrive at the same state.
//
// How the game stays honest with nothing stored:
// - GitHub says who wrote each comment, so a move can't be forged.
// - Each turn's dice come from the thread's id and the turn number. They are public
//   and shown ahead of time, so nothing is gained by deleting a move and trying again.
// - Every move names the move before it. A move whose predecessor is gone shows a
//   comment was removed, and the match is void: nobody wins by deleting.
// - A move comment that was edited is a forfeit by whoever edited it.
// - The teams in the opening post are signed by the Worker (worker/src/game.ts), so
//   the host can't touch up the stats.
// - Since v2 the opening also holds the facts each team was worked out from, read once
//   from GitHub when the challenge was made, so the teams can be worked out again later
//   with GitHub out of the picture (teamsFromFacts).

import { fieldTeam, matchup, seededRandom, type Fighter, type RepoFacts, type Side } from "./battle.ts";
import { defaultCharacter, readLook, type Character, type ClassId, type LegacyLook, type Look } from "./character.ts";

export type Action = { kind: "attack" } | { kind: "special" } | { kind: "guard" } | { kind: "switch"; to: number };

export type GamePlayer = { login: string; name: string; klass: ClassId; look: Look; level: number; avatarUrl: string | null };

/** Where a team's ace came from: the top four in a Stard profile, a pinned repo, the stars, or the player's own repos. */
export type TeamSource = "profile" | "pinned" | "stars" | "repos";

/** A repo as GitHub described it when the match opened: everything its card's numbers come from. */
export type FrozenRepo = RepoFacts & {
  topics: string[];
  /** Drawn from the player's stars for the day, not chosen by them. */
  wildcard: boolean;
};

/** What one side's team was worked out from, read from GitHub once, at `readAt`. */
export type SideFacts = {
  /** When GitHub was read, as an ISO time. A card's freshness and age are measured from here. */
  readAt: string;
  /** The character as read from GitHub: a character file or the README's trainer card. Null when none had one. */
  character: Character | null;
  /** The ace's full name, and where it was found. */
  ace: string | null;
  source: TeamSource;
  /** Every card the side fielded, in order, before the two teams were cut to the same size. */
  repos: FrozenRepo[];
};

type OpeningV1 = { v: 1; players: Record<Side, GamePlayer>; teams: Record<Side, Fighter[]> };
type OpeningV2 = { v: 2; players: Record<Side, GamePlayer>; teams: Record<Side, Fighter[]>; facts: Record<Side, SideFacts> };

/**
 * What the opening post carries. `a` hosts the thread and made the challenge; `b` was
 * challenged. A v1 opening, from before the facts were stored, holds the teams only.
 */
export type Opening = OpeningV1 | OpeningV2;

/** An opening from before the facts were stored: its teams stand, but can't be worked out again. */
export class NoFactsError extends Error {}

export type GameComment = {
  id: string;
  author: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  /** Who last edited the comment, or null when nobody has. */
  editedBy: string | null;
  url: string;
};

export type Roll = { turn: number; variance: number; critical: boolean };

export type GameEvent = {
  turn: number;
  side: Side;
  action: Action["kind"];
  /** The acting side's active card when the action was taken. */
  card: number;
  /** For an attack or special: what was hit and how. */
  target?: number;
  move?: string;
  damage?: number;
  critical?: boolean;
  matchup?: -1 | 0 | 1;
  guarded?: boolean;
  targetHp?: number;
  knockedOut?: boolean;
  /** For a switch: the card that came in. */
  to?: number;
  commentId: string;
  at: string;
};

export type ChatLine = { author: string; avatarUrl: string | null; text: string; at: string; url: string };

export type SideState = {
  hp: number[];
  /** Charge toward the special, per card: an attack adds one, the special spends two. */
  energy: number[];
  active: number;
  /** Guarding until this side's next turn: incoming damage is halved. */
  guarding: boolean;
};

export type GameStatus = "waiting" | "active" | "won" | "declined" | "void";

export type GameState = {
  status: GameStatus;
  /** Why the match ended the way it did, when the status alone doesn't say. */
  reason: string | null;
  players: Record<Side, GamePlayer>;
  teams: Record<Side, Fighter[]>;
  sides: Record<Side, SideState>;
  /** The number of the next turn; the first is 1. */
  turn: number;
  /** Who moves next. Null unless the match is active. */
  next: Side | null;
  winner: Side | null;
  events: GameEvent[];
  chat: ChatLine[];
  /** The id the next move must name as its predecessor. */
  last: string;
  lastAt: string | null;
  /** The dice for the next few turns, public by design. */
  forecast: Roll[];
};

export const ENERGY_FOR_SPECIAL = 2;
export const TURN_CLOCK_MS = 7 * 86_400_000;
const STRONG = 1.3;
const CRITICAL = 1.5;
const CRITICAL_ODDS = 1 / 8;
const SPECIAL_POWER = 1.6;
const GUARD = 0.5;
const QUICK = 1.08;
const MAX_TURNS = 300;
const CHAT_CHARS = 280;
const OPEN = "open";

const other = (side: Side): Side => (side === "a" ? "b" : "a");

// --- What goes in the thread ---

const MARK = /<!--\s*stard:(accept|decline|move)\s*(\{[^>]*\})?\s*-->/;
const OPENING = /<!--\s*stard:battle\s+([A-Za-z0-9_-]+)\s+([a-f0-9]{64})\s*-->/;

function toBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** The opening as the text that gets signed and embedded. */
export function encodeOpening(opening: Opening): string {
  return toBase64Url(JSON.stringify(opening));
}

// A post signed before glasses, beard, hat and headphones were separate parts holds
// looks in the old six-number shape. The signature covers the text, so reading the
// looks in today's shape changes nothing that was signed.
const todaysLook = (stored: Look | LegacyLook): Look => readLook(stored);

function withTodaysLooks<T extends Opening>(opening: T): T {
  const player = (side: Side): GamePlayer => ({ ...opening.players[side], look: todaysLook(opening.players[side].look) });
  const players = { a: player("a"), b: player("b") };
  if (opening.v === 1) return { ...opening, players };
  const facts = (side: Side): SideFacts => {
    const held = opening.facts[side];
    return { ...held, character: held.character && { ...held.character, look: todaysLook(held.character.look) } };
  };
  return { ...opening, players, facts: { a: facts("a"), b: facts("b") } };
}

export function decodeOpening(payload: string): Opening | null {
  try {
    const opening = JSON.parse(fromBase64Url(payload)) as Opening;
    const teamsHeld = opening?.players?.a && opening.players?.b && Array.isArray(opening.teams?.a) && Array.isArray(opening.teams?.b);
    if (!teamsHeld) return null;
    if (opening.v === 1) return withTodaysLooks(opening);
    const factsHeld = opening.v === 2 && Array.isArray(opening.facts?.a?.repos) && Array.isArray(opening.facts?.b?.repos);
    return factsHeld ? withTodaysLooks(opening) : null;
  } catch {
    return null;
  }
}

/**
 * Both teams worked out again from the facts frozen in the opening, with no call to
 * GitHub: today's rules applied to what GitHub said at the time. Throws NoFactsError
 * for a v1 opening, which has no facts to work from.
 */
export function teamsFromFacts(opening: Opening): Record<Side, Fighter[]> {
  if (opening.v === 1) throw new NoFactsError("This match was opened before its facts were stored, so its teams can't be worked out again.");
  const side = (key: Side): Fighter[] => {
    const facts = opening.facts[key];
    const login = opening.players[key].login;
    const klass = (facts.character ?? defaultCharacter(login)).klass;
    const fielded = fieldTeam(facts.repos, login, klass, Date.parse(facts.readAt));
    // The teams were cut to the same size after each was fielded whole, so a perk that
    // looks at the whole team still counts the cards that were cut.
    return fielded
      .map((fighter, i) => (facts.repos[i].wildcard ? { ...fighter, wildcard: true } : fighter))
      .slice(0, opening.teams[key].length);
  };
  return { a: side("a"), b: side("b") };
}

/** The opening post: a few lines for people, then the signed teams where the page doesn't show them. */
export function openingBody(opening: Opening, payload: string, signature: string, appUrl: string): string {
  const { a, b } = opening.players;
  const line = (side: Side) => opening.teams[side].map((f) => `[${f.fullName}](https://github.com/${f.fullName})`).join(", ");
  return [
    `@${b.login}, ${a.name === a.login ? `@${a.login}` : `${a.name} (@${a.login})`} challenges you to a Stard battle.`,
    `**${a.name}** plays ${line("a")}.\n**${b.name}** plays ${line("b")}.`,
    `[Play or watch the match](${appUrl})`,
    "Every move is a comment in this thread. Other comments show up beside the match as chat. Editing or deleting a move ends the match.",
    `<!-- stard:battle ${payload} ${signature} -->`,
  ].join("\n\n");
}

export function readOpening(body: string): { payload: string; signature: string } | null {
  const found = OPENING.exec(body);
  return found ? { payload: found[1], signature: found[2] } : null;
}

/** A comment that accepts or declines a challenge. */
export function replyComment(kind: "accept" | "decline", line: string): string {
  return `${line}\n\n<!-- stard:${kind} -->`;
}

/** A comment that makes a move: a line for people, then the move itself. */
export function moveComment(turn: number, action: Action, prev: string, line: string): string {
  return `${line}\n\n<!-- stard:move ${JSON.stringify({ turn, action, prev })} -->`;
}

type Mark = { kind: "accept" } | { kind: "decline" } | { kind: "move"; turn: number; action: Action; prev: string };

function readMark(body: string): Mark | null {
  const found = MARK.exec(body);
  if (!found) return null;
  if (found[1] !== "move") return { kind: found[1] as "accept" | "decline" };
  try {
    const { turn, action, prev } = JSON.parse(found[2] ?? "") as { turn: unknown; action: { kind?: unknown; to?: unknown }; prev: unknown };
    if (!Number.isInteger(turn) || typeof prev !== "string" || !action) return null;
    if (action.kind === "attack" || action.kind === "special" || action.kind === "guard") return { kind: "move", turn: turn as number, action: { kind: action.kind }, prev };
    if (action.kind === "switch" && Number.isInteger(action.to)) return { kind: "move", turn: turn as number, action: { kind: "switch", to: action.to as number }, prev };
    return null;
  } catch {
    return null;
  }
}

// --- The rules ---

/** A turn's dice. They depend only on the thread and the turn, so everyone can see them coming. */
export function rollFor(seed: string, turn: number): Roll {
  const random = seededRandom(`${seed}|${turn}`);
  return { turn, variance: 0.85 + random() * 0.3, critical: random() < CRITICAL_ODDS };
}

function firstAlive(hp: number[]): number {
  return hp.findIndex((value) => value > 0);
}

/** What the side to move may do now. */
export function legalActions(state: GameState, side: Side): Action[] {
  if (state.status !== "active" || state.next !== side) return [];
  const mine = state.sides[side];
  const actions: Action[] = [{ kind: "attack" }];
  if (mine.energy[mine.active] >= ENERGY_FOR_SPECIAL) actions.push({ kind: "special" });
  // No guarding twice in a row: a guard still up from this side's last turn rules another out.
  if (!mine.guarding) actions.push({ kind: "guard" });
  mine.hp.forEach((hp, index) => {
    if (hp > 0 && index !== mine.active) actions.push({ kind: "switch", to: index });
  });
  return actions;
}

function isLegal(state: GameState, side: Side, action: Action): boolean {
  return legalActions(state, side).some((legal) => legal.kind === action.kind && (legal.kind !== "switch" || legal.to === (action as { to: number }).to));
}

/**
 * The state after `side` takes `action` on the current turn. Returns a new state; the
 * one passed in is left alone, so the app can show what each choice would do.
 */
export function applyAction(state: GameState, seed: string, side: Side, action: Action, commentId: string, at: string): GameState {
  const foe = other(side);
  const sides: Record<Side, SideState> = {
    a: { ...state.sides.a, hp: [...state.sides.a.hp], energy: [...state.sides.a.energy] },
    b: { ...state.sides.b, hp: [...state.sides.b.hp], energy: [...state.sides.b.energy] },
  };
  const mine = sides[side];
  const theirs = sides[foe];
  // A guard lasts until its owner's next turn, which is now.
  mine.guarding = false;
  const event: GameEvent = { turn: state.turn, side, action: action.kind, card: mine.active, commentId, at };

  if (action.kind === "guard") {
    mine.guarding = true;
  } else if (action.kind === "switch") {
    mine.active = action.to;
    event.to = action.to;
  } else {
    const special = action.kind === "special";
    const attacker = state.teams[side][mine.active];
    const target = state.teams[foe][theirs.active];
    const roll = rollFor(seed, state.turn);
    const edge = matchup(attacker.type, target.type);
    const base = (attacker.attack * attacker.attack) / (attacker.attack + target.defense);
    const damage = Math.max(
      1,
      Math.round(
        base * (special ? SPECIAL_POWER : 1) * (edge === 1 ? STRONG : edge === -1 ? 1 / STRONG : 1) * (roll.critical ? CRITICAL : 1) *
          roll.variance * (attacker.speed > target.speed ? QUICK : 1) * (theirs.guarding ? GUARD : 1),
      ),
    );
    mine.energy[mine.active] = special ? mine.energy[mine.active] - ENERGY_FOR_SPECIAL : Math.min(ENERGY_FOR_SPECIAL, mine.energy[mine.active] + 1);
    theirs.hp[theirs.active] = Math.max(0, theirs.hp[theirs.active] - damage);
    Object.assign(event, {
      target: theirs.active, move: attacker.moves[special ? 1 : 0].name, damage, critical: roll.critical, matchup: edge,
      guarded: theirs.guarding, targetHp: theirs.hp[theirs.active], knockedOut: theirs.hp[theirs.active] === 0,
    });
    // The next card in line steps in for one that was knocked out.
    if (event.knockedOut) {
      const next = firstAlive(theirs.hp);
      if (next !== -1) theirs.active = next;
    }
  }

  const beaten = firstAlive(theirs.hp) === -1;
  const turn = state.turn + 1;
  const drawn = !beaten && turn > MAX_TURNS;
  const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
  const winner: Side | null = beaten ? side : drawn ? (total(sides.a.hp) >= total(sides.b.hp) ? "a" : "b") : null;
  return {
    ...state,
    sides,
    turn,
    status: winner ? "won" : "active",
    reason: drawn ? `No knockout in ${MAX_TURNS} turns, so the side with more HP left wins.` : state.reason,
    next: winner ? null : foe,
    winner,
    events: [...state.events, event],
    last: commentId,
    lastAt: at,
    forecast: winner ? [] : [0, 1, 2].map((ahead) => rollFor(seed, turn + ahead)),
  };
}

function chatText(body: string): string {
  const text = body.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();
  return text.length > CHAT_CHARS ? `${text.slice(0, CHAT_CHARS - 1)}…` : text;
}

/**
 * The whole match, from the opening and the thread's comments in the order GitHub
 * gives them. `seed` is the thread's id. `now` decides whether the turn clock ran out.
 */
export function replay(opening: Opening, seed: string, comments: GameComment[], now: number): GameState {
  const fresh = (side: Side): SideState => ({ hp: opening.teams[side].map((f) => f.hp), energy: opening.teams[side].map(() => 0), active: 0, guarding: false });
  let state: GameState = {
    status: "waiting", reason: null, players: opening.players, teams: opening.teams, sides: { a: fresh("a"), b: fresh("b") },
    turn: 1, next: null, winner: null, events: [], chat: [], last: OPEN, lastAt: null, forecast: [],
  };
  const sideOf = (login: string): Side | null =>
    login.toLowerCase() === opening.players.a.login.toLowerCase() ? "a" : login.toLowerCase() === opening.players.b.login.toLowerCase() ? "b" : null;
  const ids = new Set(comments.map((comment) => comment.id));
  // Every comment some move names as the one before it. An edit can strip the move out
  // of a comment, but not out of the comment that answered it.
  const answered = new Set(comments.flatMap((comment) => {
    const mark = readMark(comment.body);
    return mark?.kind === "move" ? [mark.prev] : [];
  }));
  const chat: ChatLine[] = [];
  const say = (comment: GameComment) => {
    const text = chatText(comment.body);
    if (text) chat.push({ author: comment.author, avatarUrl: comment.avatarUrl, text, at: comment.createdAt, url: comment.url });
  };

  for (const comment of comments) {
    const side = sideOf(comment.author);
    const mark = side ? readMark(comment.body) : null;
    // A player's comment that had its move edited out is still a move as far as the
    // match goes, when a later move answered it.
    const stripped = side !== null && !mark && comment.editedBy !== null && answered.has(comment.id);
    // Anything else that isn't a player's move is talk: spectators, and players between moves.
    if (!side || (!mark && !stripped)) {
      say(comment);
      continue;
    }
    if (state.status !== "waiting" && state.status !== "active") continue;
    // The app never edits a move. Whoever did gives up the match.
    if (comment.editedBy) {
      const editor = sideOf(comment.editedBy) ?? side;
      state = { ...state, status: "won", next: null, winner: other(editor), reason: `${opening.players[editor].name} edited a move, which forfeits the match.` };
      continue;
    }

    if (state.status === "waiting") {
      // Only the challenged player can answer the challenge.
      if (side !== "b" || !mark || mark.kind === "move") continue;
      if (mark.kind === "decline") {
        state = { ...state, status: "declined", last: comment.id, lastAt: comment.createdAt };
        continue;
      }
      // The faster lead card moves first; the challenged player takes a tie.
      const first: Side = opening.teams.a[0].speed > opening.teams.b[0].speed ? "a" : "b";
      state = { ...state, status: "active", next: first, last: comment.id, lastAt: comment.createdAt, forecast: [0, 1, 2].map((ahead) => rollFor(seed, 1 + ahead)) };
      continue;
    }

    if (!mark || mark.kind !== "move") continue;
    if (mark.prev !== state.last) {
      // Naming a comment that still exists is only a stale or repeated move. Naming one
      // that is gone means a move was removed after it was answered.
      if (mark.prev !== OPEN && !ids.has(mark.prev)) {
        state = { ...state, status: "void", next: null, reason: "A move in this thread was removed after it was answered, so the match doesn't count." };
      }
      continue;
    }
    if (side !== state.next || mark.turn !== state.turn || !isLegal(state, side, mark.action)) continue;
    state = applyAction(state, seed, side, mark.action, comment.id, comment.createdAt);
  }

  if (state.status === "active" && state.next && state.lastAt && now - Date.parse(state.lastAt) > TURN_CLOCK_MS) {
    const late = state.next;
    state = { ...state, status: "won", next: null, winner: other(late), reason: `${opening.players[late].name} didn't move for 7 days.` };
  }
  return { ...state, chat };
}
