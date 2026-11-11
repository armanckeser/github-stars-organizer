import { seededRandom, type Fighter } from "../../server/battle";
import type { Character } from "../../server/character";
import type { Card, FightEvent, Side, Snapshot } from "../../server/run/types";
import { CARD_ORIGIN } from "./published-list";

// A run: start with an ace, take one card from a shop of three each round, put the
// team in order, and fight another account's team. Five wins or three losses ends
// the run. The fight needs no input; every choice is made before it.

export const WINS_TO_FINISH = 5;
export const LOSSES_TO_END = 3;
export const TEAM_MAX = 5;
export const SHOP_SIZE = 3;

/** Accounts whose teams a run is played against until players' own saved teams exist. */
const OPPONENTS = ["sindresorhus", "t3dotgg", "antfu", "gaearon", "yyx990803", "kentcdodds", "tj", "mitchellh", "simonw", "rauchg", "addyosmani", "torvalds"];

export type Player = { login: string; avatarUrl: string | null; character: Character & { level: number }; team: Fighter[] };

const RARITY_STARS = [100, 1000, 10000, 50000];

export function toCard(fighter: Fighter): Card {
  return {
    fullName: fighter.fullName,
    type: fighter.type,
    sets: [fighter.language?.toLowerCase(), fighter.type].filter((set): set is string => Boolean(set)),
    rarity: RARITY_STARS.filter((stars) => fighter.stars >= stars).length as Card["rarity"],
    hp: fighter.hp,
    attack: fighter.attack,
    guard: fighter.defense,
    speed: fighter.speed,
    ability: "none",
    shiny: fighter.shiny,
  };
}

export const snapshot = (login: string, round: number, team: Fighter[]): Snapshot => ({ login, round, cards: team.map(toCard), boosts: [] });

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

/** Three cards from the player's stars that are not on the team. The same round and reroll show the same three. */
export function shopFor(player: Player, team: Fighter[], round: number, rerolls: number): Fighter[] {
  const onTeam = new Set(team.map((fighter) => fighter.fullName));
  const rest = player.team.slice(1).filter((fighter) => !onTeam.has(fighter.fullName));
  return shuffled(rest, `${player.login}|${today()}|shop|${round}|${rerolls}`).slice(0, SHOP_SIZE);
}

/** How many cards a team holds going into a round: the ace and one pick per round. */
export const teamSizeAt = (round: number) => Math.min(TEAM_MAX, round + 1);

export function opponentLogin(login: string, round: number): string {
  const others = OPPONENTS.filter((name) => name !== login.toLowerCase());
  return shuffled(others, `${login.toLowerCase()}|${today()}|opponents`)[(round - 1) % others.length];
}

/**
 * The other account's team at this round, built the way a player builds one: each
 * round a shop of three from its stars, the strongest card taken. The sturdiest card stands in front.
 */
export function opponentTeam(opponent: Player, round: number): Fighter[] {
  const team = opponent.team.slice(0, 1);
  for (let r = 1; team.length > 0 && team.length < teamSizeAt(round); r++) {
    const [pick] = shopFor(opponent, team, r, 0).sort((x, y) => y.attack + y.hp - (x.attack + x.hp));
    if (!pick) break;
    team.push(pick);
  }
  return team.sort((x, y) => y.defense - x.defense);
}

export type Beat = { side: Side; slot: number; target: number; damage: number; critical: boolean; out: boolean };

/** A fight's hits, each knowing whether the hit took the card out. */
export function beatsOf(events: FightEvent[]): Beat[] {
  const beats: Beat[] = [];
  for (const event of events) {
    if (event.kind === "hit") beats.push({ side: event.side, slot: event.slot, target: event.target, damage: event.damage, critical: event.critical, out: false });
    else if (event.kind === "faint" && beats.length > 0) beats[beats.length - 1].out = true;
  }
  return beats;
}

export function winnerOf(events: FightEvent[]): Side | null {
  const end = events.find((event) => event.kind === "end");
  return end?.kind === "end" ? end.winner : null;
}
