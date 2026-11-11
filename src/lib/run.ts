import { seededRandom, type Fighter } from "../../server/battle";
import type { Character } from "../../server/character";
import { COLS, ROWS, type Card, type FightEvent, type Side, type Snapshot } from "../../server/run/types";
import { CARD_ORIGIN } from "./published-list";

// A run: buy cards from a shop drawn from your stars, place them on your half of the
// board, and watch the team fight another account's team. Five wins or three losses
// ends the run. The fight needs no input; every choice is made before it.

export const WINS_TO_FINISH = 5;
export const LOSSES_TO_END = 3;
export const TEAM_MAX = 5;
export const SHOP_SIZE = 5;
export const START_GOLD = 4;
export const ROUND_GOLD = 5;
export const WIN_GOLD = 1;
export const REROLL_COST = 1;

/** Accounts whose teams a run is played against until players' own saved teams exist. */
const OPPONENTS = ["sindresorhus", "t3dotgg", "antfu", "gaearon", "yyx990803", "kentcdodds", "tj", "mitchellh", "simonw", "rauchg", "addyosmani", "torvalds"];

export type Player = { login: string; avatarUrl: string | null; character: Character & { level: number }; team: Fighter[] };
/** A card on a player's half of the board. Row 0 is the front. */
export type Unit = { fighter: Fighter; col: number; row: number };

const RARITY_STARS = [100, 1000, 10000, 50000];
const rarityOf = (fighter: Fighter) => RARITY_STARS.filter((stars) => fighter.stars >= stars).length as Card["rarity"];
/** Cards that work on text and numbers hit from behind; the rest fight up close. */
export const rangeOf = (fighter: Fighter): Card["range"] => (fighter.type === "data" || fighter.type === "docs" || fighter.type === "scripts" ? 3 : 1);
export const costOf = (fighter: Fighter) => rarityOf(fighter) + 1;

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

export async function fetchPlayer(login: string): Promise<Player> {
  const response = await fetch(`${CARD_ORIGIN}/api/run/pool?login=${encodeURIComponent(login)}`);
  const body = (await response.json()) as Player & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The cards couldn't be read.");
  return body;
}

function shuffled<T>(items: T[], seed: string): T[] {
  const random = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Cards from the player's stars that are not on the team. The same round and reroll show the same cards. */
export function shopFor(player: Player, owned: Fighter[], round: number, rerolls: number, size = SHOP_SIZE): Fighter[] {
  const onTeam = new Set(owned.map((fighter) => fighter.fullName));
  const rest = player.team.slice(1).filter((fighter) => !onTeam.has(fighter.fullName));
  return shuffled(rest, `${player.login}|${today()}|shop|${round}|${rerolls}`).slice(0, size);
}

/** How many cards a team may hold in a round. */
export const teamSizeAt = (round: number) => Math.min(TEAM_MAX, round + 1);

/** The first free cell for a new card: up close in front, cards with reach behind. */
export function freeCell(units: Unit[], fighter: Fighter): { col: number; row: number } | null {
  const rows = rangeOf(fighter) > 1 ? [1, 0] : [0, 1];
  for (const row of rows) {
    for (const col of [1, 2, 0, 3]) if (!units.some((unit) => unit.col === col && unit.row === row)) return { col, row };
  }
  return null;
}

export function opponentLogin(login: string, round: number): string {
  const others = OPPONENTS.filter((name) => name !== login.toLowerCase());
  return shuffled(others, `${login.toLowerCase()}|${today()}|opponents`)[(round - 1) % others.length];
}

/** The other account's team at this round, built the way a player builds one: each round a shop from its stars, one card taken. */
export function opponentUnits(opponent: Player, round: number): Unit[] {
  const team = opponent.team.slice(0, 1);
  for (let r = 1; team.length > 0 && team.length < teamSizeAt(round); r++) {
    const [pick] = shopFor(opponent, team, r, 0, 1);
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
