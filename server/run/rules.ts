import { seededRandom, type Fighter } from "../battle.ts";
import { rarityOf as rarityForStars } from "./stats.ts";
import { COLS, ROWS, type Card, type FightEvent, type Side, type Snapshot } from "./types.ts";

// A run's rules, shared by the Play screen and the Worker that referees a run
// (worker/src/run.ts): buy cards from a shop drawn from your stars, place them on
// your half of the board, and fight another account's team. Five wins or three
// losses ends the run. Pure: the day is passed in, nothing is read from GitHub.

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

const rarityOf = (fighter: Fighter) => rarityForStars(fighter.stars);
/** Cards that work on text and numbers hit from behind; the rest fight up close. */
export const rangeOf = (card: { type: string }): Card["range"] => (card.type === "data" || card.type === "docs" || card.type === "scripts" ? 3 : 1);
/** Gold a card costs, and gives back when sold: 1 for a common up to 5 for a legendary. */
export const priceOf = (rarity: Card["rarity"]) => rarity + 1;
export const costOf = (fighter: Fighter) => priceOf(rarityOf(fighter));

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

export const today = () => new Date().toISOString().slice(0, 10);

/** Cards from the player's stars that are not on the team. The same day, round and reroll show the same cards. */
export function shopFor<T extends { fullName: string }>(player: Pool<T>, owned: T[], round: number, rerolls: number, size = SHOP_SIZE, day = today()): T[] {
  const onTeam = new Set(owned.map((card) => card.fullName));
  const rest = player.team.slice(1).filter((card) => !onTeam.has(card.fullName));
  return shuffled(rest, `${player.login}|${day}|shop|${round}|${rerolls}`).slice(0, size);
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
export function opponentLogin(login: string, round: number, day = today(), optedOut: readonly string[] = []): string {
  const others = OPPONENTS.filter((name) => name !== login.toLowerCase() && !optedOut.includes(name));
  if (others.length === 0) throw new NoOpponentLeft();
  return shuffled(others, `${login.toLowerCase()}|${day}|opponents`)[(round - 1) % others.length];
}

/** The other account's team at this round, built the way a player builds one: each round a shop from its stars, one card taken. */
export function opponentUnits(opponent: Pool<RunFighter>, round: number, day = today()): Unit[] {
  const team = opponent.team.slice(0, 1);
  for (let r = 1; team.length > 0 && team.length < teamSizeAt(round); r++) {
    const [pick] = shopFor(opponent, team, r, 0, 1, day);
    if (!pick) break;
    team.push(pick);
  }
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
