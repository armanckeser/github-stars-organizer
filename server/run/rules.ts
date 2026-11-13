import { seededRandom, type Fighter } from "../battle.ts";
import { BUDGET, HP_FLOOR, roleOf } from "./stats.ts";
import { COLS, ROWS, type Card, type FightEvent, type Side, type Snapshot } from "./types.ts";

// A run's rules, shared by the Play screen and the Worker that referees a run
// (worker/src/run.ts): buy cards from a shop drawn from your stars, place them on
// your half of the board, and fight another account's team. Five wins or three
// losses ends the run. Pure: the run's seed is passed in, nothing is read from GitHub.

export const WINS_TO_FINISH = 5;
export const LOSSES_TO_END = 3;
export const TEAM_MAX = 5;
export const SHOP_SIZE = 5;
export const START_GOLD = 4;
export const ROUND_GOLD = 5;
export const WIN_GOLD = 1;
export const REROLL_COST = 1;

/**
 * Accounts whose teams a run is played against until players' own saved teams exist.
 * OPPONENTS.md lists the same accounts for people to read; a test keeps the two equal.
 */
export const OPPONENTS = ["sindresorhus", "t3dotgg", "antfu", "gaearon", "yyx990803", "kentcdodds", "tj", "mitchellh", "simonw", "rauchg", "addyosmani", "torvalds"];

/** Every account in OPPONENTS has opted out (worker/src/no-play.ts), or is the player. */
export class NoOpponentLeft extends Error {
  constructor() {
    super("No opponents are free to play right now. Try again later.");
  }
}

/** A repo as a run deals it: the fighter the board draws, and the card the fight reads (server/run/stats.ts). */
export type RunFighter = Fighter & { card: Card };
/** A card on a player's half of the board. Row 0 is the front. */
export type Unit = { fighter: RunFighter; col: number; row: number };
/** Whoever a shop is drawn for: an account and its cards, the ace first. */
export type Pool<T extends { fullName: string }> = { login: string; team: T[] };

/** Cards that work on text and numbers hit from behind; the rest fight up close. */
export const rangeOf = (card: { type: string }): Card["range"] => (card.type === "data" || card.type === "docs" || card.type === "scripts" ? 3 : 1);
/** Gold a card costs, and gives back when sold: 1 for a common up to 5 for a legendary. */
export const priceOf = (rarity: Card["rarity"]) => rarity + 1;
export const costOf = (fighter: RunFighter) => priceOf(fighter.card.rarity);

/** A team as the fight reads it. `boosts` are the ids picked so far in the run (server/run/boosts.ts). */
export const snapshot = (login: string, round: number, units: Unit[], boosts: string[] = []): Snapshot => ({ login, round, units: units.map((unit) => ({ card: unit.fighter.card, col: unit.col, row: unit.row })), boosts });

export function shuffled<T>(items: T[], seed: string): T[] {
  const random = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const SEED_BYTES = 16;

/**
 * A new run's seed, which deals its shops, rerolls, opponents and boosts: every run is
 * dealt afresh, however many are played in a day. `getRandomValues` rather than
 * `randomUUID`, which a browser only has on HTTPS, and the Play screen is also opened
 * over plain HTTP on a home network (a phone against the dev server, a self-hosted copy).
 */
export function newRunSeed(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(SEED_BYTES)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Cards from the player's stars that are not on the team. The same run seed, round and reroll show the same cards. */
export function shopFor<T extends { fullName: string }>(player: Pool<T>, owned: T[], round: number, rerolls: number, seed: string, size = SHOP_SIZE): T[] {
  const onTeam = new Set(owned.map((card) => card.fullName));
  const rest = player.team.slice(1).filter((card) => !onTeam.has(card.fullName));
  return shuffled(rest, `${player.login}|${seed}|shop|${round}|${rerolls}`).slice(0, size);
}

/** How many cards a team may hold in a round. */
export const teamSizeAt = (round: number) => Math.min(TEAM_MAX, round + 1);

/** Cards bought wait on the bench until placed. Only cards on the board count toward the team limit. */
export const BENCH_SIZE = 5;
/** Gold for one more board slot than the round allows, and the most a board can hold with bought slots. */
export const SLOT_COST = 4;
export const BOARD_MAX = 7;
/** Cards the board may hold in a round, with `bought` extra slots. */
export const boardLimit = (round: number, bought: number) => Math.min(BOARD_MAX, teamSizeAt(round) + bought);

/** The first free cell for a new card: up close in front, cards with reach behind. */
export function freeCell(units: { col: number; row: number }[], card: { type: string }): { col: number; row: number } | null {
  const rows = rangeOf(card) > 1 ? [1, 0] : [0, 1];
  for (const row of rows) {
    for (const col of [1, 2, 0, 3]) if (!units.some((unit) => unit.col === col && unit.row === row)) return { col, row };
  }
  return null;
}

/** Who a round is played against. `optedOut` holds the accounts that asked not to be played (lower case). */
export function opponentLogin(login: string, round: number, seed: string, optedOut: readonly string[] = []): string {
  const others = OPPONENTS.filter((name) => name !== login.toLowerCase() && !optedOut.includes(name));
  if (others.length === 0) throw new NoOpponentLeft();
  return shuffled(others, `${login.toLowerCase()}|${seed}|opponents`)[(round - 1) % others.length];
}

const FIRST_ROUND = 1;
/**
 * The stat points each of the other account's cards fights with in round 1 (BUDGET gives a
 * common 400). armanckeser's ace and one card bought with the starting gold won round 1 in
 * 40% of 2,000 simulated runs against the full-strength ace and free pick, and in 73% at 350.
 */
export const OPENING_STAT_POINTS = 350;

// Rounding four stats moves the lean roleOf reads by about 0.01, which tips a card sitting on
// a role's cut into the next role (3 of 297 cards in the pools tried). Guard counts on the
// toughness side only, so moving it by up to this many points puts the card back.
const GUARD_NUDGE = 5;
const NUDGES = Array.from({ length: 2 * GUARD_NUDGE + 1 }, (_, i) => (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2));

/**
 * A card with its stat points shrunk to OPENING_STAT_POINTS. Its cost and everything else
 * stay. Only the HP above HP_FLOOR shrinks: that part is the points' share, and shrinking it
 * with the other three keeps the lean roleOf reads, so the card keeps its role and its body.
 */
export function atOpeningStrength(fighter: RunFighter): RunFighter {
  const scale = OPENING_STAT_POINTS / BUDGET[fighter.card.rarity];
  const shrunk = (stat: number) => Math.round(stat * scale);
  const hp = HP_FLOOR + shrunk(fighter.card.hp - HP_FLOOR);
  const rounded = { ...fighter.card, hp, attack: shrunk(fighter.card.attack), guard: shrunk(fighter.card.guard), speed: shrunk(fighter.card.speed) };
  const role = roleOf(fighter.card);
  const card = NUDGES.map((nudge) => ({ ...rounded, guard: rounded.guard + nudge })).find((candidate) => roleOf(candidate) === role) ?? rounded;
  return { ...fighter, hp: card.hp, attack: card.attack, defense: card.guard, speed: card.speed, card };
}

/**
 * The other account's team at this round, built the way a player builds one: each round
 * a shop from its stars, one card taken. In round 1 the two cards fight with
 * OPENING_STAT_POINTS each (atOpeningStrength); from round 2 on at their own.
 */
export function opponentUnits(opponent: Pool<RunFighter>, round: number, seed: string): Unit[] {
  const drafted = opponent.team.slice(0, 1);
  for (let r = 1; drafted.length > 0 && drafted.length < teamSizeAt(round); r++) {
    const [pick] = shopFor(opponent, drafted, r, 0, seed, 1);
    if (!pick) break;
    drafted.push(pick);
  }
  const team = round === FIRST_ROUND ? drafted.map(atOpeningStrength) : drafted;
  const units: Unit[] = [];
  for (const fighter of [...team].sort((x, y) => y.defense - x.defense)) {
    const cell = freeCell(units, fighter);
    if (cell) units.push({ fighter, ...cell });
  }
  return units;
}

export const inHalf = (col: number, row: number) => col >= 0 && col < COLS && row >= 0 && row < ROWS;

export function winnerOf(events: FightEvent[]): Side | null {
  const end = events.find((event) => event.kind === "end");
  return end?.kind === "end" ? end.winner : null;
}

/** A run's record on the Play screen: wins, losses, and the last round counted in them. */
export type Tally = { wins: number; losses: number; counted: number };
export const NEW_TALLY: Tally = { wins: 0, losses: 0, counted: 0 };

/**
 * The record once round `round`'s fight is counted, and the gold it earns toward the
 * next round. A round counts once: when the next round fails to open, Continue can be
 * pressed again, and that press must not count the same fight twice. A draw counts for
 * neither side, and the round that ends the run earns nothing.
 */
export function countRound(tally: Tally, round: number, winner: Side | null): { tally: Tally; earned: number } {
  if (round <= tally.counted) return { tally, earned: 0 };
  const wins = tally.wins + (winner === 0 ? 1 : 0);
  const losses = tally.losses + (winner === 1 ? 1 : 0);
  const over = wins >= WINS_TO_FINISH || losses >= LOSSES_TO_END;
  return { tally: { wins, losses, counted: round }, earned: over ? 0 : ROUND_GOLD + (winner === 0 ? WIN_GOLD : 0) };
}
