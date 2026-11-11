import { seededRandom, type Fighter } from "../battle.ts";
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

/** Accounts whose teams a run is played against until players' own saved teams exist. */
export const OPPONENTS = ["sindresorhus", "t3dotgg", "antfu", "gaearon", "yyx990803", "kentcdodds", "tj", "mitchellh", "simonw", "rauchg", "addyosmani", "torvalds"];

/** A card on a player's half of the board. Row 0 is the front. */
export type Unit = { fighter: Fighter; col: number; row: number };
/** Whoever a shop is drawn for: an account and its cards, the ace first. */
export type Pool<T extends { fullName: string }> = { login: string; team: T[] };

const RARITY_STARS = [100, 1000, 10000, 50000];
const rarityOf = (fighter: Fighter) => RARITY_STARS.filter((stars) => fighter.stars >= stars).length as Card["rarity"];
/** Cards that work on text and numbers hit from behind; the rest fight up close. */
export const rangeOf = (card: { type: string }): Card["range"] => (card.type === "data" || card.type === "docs" || card.type === "scripts" ? 3 : 1);
/** Gold a card costs, and gives back when sold: 1 for a common up to 5 for a legendary. */
export const priceOf = (rarity: Card["rarity"]) => rarity + 1;
export const costOf = (fighter: Fighter) => priceOf(rarityOf(fighter));

export function toCard(fighter: Fighter): Card {
  return {
    fullName: fighter.fullName,
    type: fighter.type,
    sets: [fighter.language?.toLowerCase(), fighter.type].filter((set): set is string => Boolean(set)),
    rarity: rarityOf(fighter),
    hp: fighter.hp,
    attack: fighter.attack,
    guard: fighter.defense,
    speed: fighter.speed,
    range: rangeOf(fighter),
    ability: "none",
    shiny: fighter.shiny,
  };
}

export const snapshot = (login: string, round: number, units: Unit[]): Snapshot => ({ login, round, units: units.map((unit) => ({ card: toCard(unit.fighter), col: unit.col, row: unit.row })), boosts: [] });

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

/** The first free cell for a new card: up close in front, cards with reach behind. */
export function freeCell(units: { col: number; row: number }[], card: { type: string }): { col: number; row: number } | null {
  const rows = rangeOf(card) > 1 ? [1, 0] : [0, 1];
  for (const row of rows) {
    for (const col of [1, 2, 0, 3]) if (!units.some((unit) => unit.col === col && unit.row === row)) return { col, row };
  }
  return null;
}

export function opponentLogin(login: string, round: number, day = today()): string {
  const others = OPPONENTS.filter((name) => name !== login.toLowerCase());
  return shuffled(others, `${login.toLowerCase()}|${day}|opponents`)[(round - 1) % others.length];
}

/** The other account's team at this round, built the way a player builds one: each round a shop from its stars, one card taken. */
export function opponentUnits(opponent: Pool<Fighter>, round: number, day = today()): Unit[] {
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
