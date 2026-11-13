import { typeOf, type CardType, type RepoFacts } from "../battle.ts";
import { abilityFor } from "./abilities.ts";
import { setsFor } from "./sets.ts";
import type { Card } from "./types.ts";

// A card's numbers from its repo (docs/GAME-DESIGN.md, "Fair cards"). Stars set the
// rarity and the rarity sets the stat budget: a legendary has 15% more to spend than
// a common, and nothing else. The repo's shape splits the budget across HP, attack,
// guard and speed, each between 15% and 40% of it.

/** The stars each rarity starts at, from uncommon up. */
export const RARITY_STARS = [100, 1000, 10_000, 100_000] as const;
/** Stat points to share out, by rarity. */
export const BUDGET = [400, 415, 430, 445, 460] as const;
export const MIN_SHARE = 0.15;
export const MAX_SHARE = 0.4;
/** Repos owned by this account are shiny for every player. */
export const SHINY_OWNER = "armanckeser";
export const SHINY = 1.05;
/** An even split of a rare's budget: the card every number is measured against. */
export const EVEN = BUDGET[2] / 4;
/**
 * HP is a pool and the other stats are rates. Every card starts with HP_FLOOR and each
 * HP point adds HP_PER_POINT, so a rarer card's extra points move its HP only a little.
 */
export const HP_FLOOR = 130;
export const HP_PER_POINT = 0.25;

const DAY_MS = 86_400_000;
const YEAR_MS = 365.25 * DAY_MS;
const SIGNAL_FLOOR = 0.3;
/** Cards that work on text and numbers hit from behind; the rest fight up close. */
const REACH: CardType[] = ["data", "docs", "scripts"];

/** What the Worker reads for a repo, plus the facts the card needs that older replies lack. */
export type CardFacts = RepoFacts & {
  /** Lower-case, as GitHub gives them. */
  topics?: string[];
  /** Commits on the default branch in the last year. Estimated from `commits` and age when missing. */
  commitsYear?: number;
};

export type StatPoints = { hp: number; attack: number; guard: number; speed: number };

/** The repo facts the card is made from, worked out once. */
export type Signals = {
  /** The repo's name without the owner, lower-case. */
  name: string;
  type: CardType;
  stars: number;
  forks: number;
  contributors: number;
  /** Commits in the last year. */
  yearly: number;
  /** Years since the repo was created. */
  age: number;
  /** Days since the last push. */
  daysQuiet: number;
  openIssues: number;
  closedIssues: number;
  /** Share of issues closed, 0.5 when there are none. */
  closeRate: number;
  releases: number;
  archived: boolean;
};

export function signalsOf(repo: CardFacts, now: number): Signals {
  const age = repo.createdAt ? Math.max(0, (now - Date.parse(repo.createdAt)) / YEAR_MS) : 0;
  const issues = repo.openIssues + repo.closedIssues;
  return {
    name: (repo.fullName.split("/")[1] ?? repo.fullName).toLowerCase(),
    type: typeOf(repo.language),
    stars: repo.stars,
    forks: repo.forks,
    contributors: repo.contributors,
    yearly: repo.commitsYear ?? repo.commits / Math.max(1, age),
    age,
    daysQuiet: repo.pushedAt ? Math.max(0, (now - Date.parse(repo.pushedAt)) / DAY_MS) : 3650,
    openIssues: repo.openIssues,
    closedIssues: repo.closedIssues,
    closeRate: issues > 0 ? repo.closedIssues / issues : 0.5,
    releases: repo.releases,
    archived: repo.isArchived,
  };
}

export function rarityOf(stars: number): Card["rarity"] {
  return RARITY_STARS.filter((from) => stars >= from).length as Card["rarity"];
}

const LEGENDARY: Card["rarity"] = 4;

export const isShiny = (fullName: string) => fullName.split("/")[0].toLowerCase() === SHINY_OWNER;

/** A card's rarity: by its stars, except that every repo of the game's creator is a legendary, a reason to star them. */
export function rarityFor(repo: Pick<CardFacts, "fullName" | "stars">): Card["rarity"] {
  if (isShiny(repo.fullName)) return LEGENDARY;
  return rarityOf(repo.stars);
}

/** A value's place between 0 and 1 on a log scale that tops out at `full`. */
const logShare = (value: number, full: number) => Math.min(1, Math.log10(Math.max(0, value) + 1) / Math.log10(full + 1));

/**
 * Shares of a budget from signals between 0 and 1: each share grows with its signal,
 * stays between MIN_SHARE and MAX_SHARE, and the shares add up to 1.
 */
function split(signals: number[]): number[] {
  const weights = signals.map((signal) => SIGNAL_FLOOR + Math.max(0, Math.min(1, signal)));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const free = 1 - MIN_SHARE * signals.length;
  return weights.map((weight) => Math.min(MAX_SHARE, MIN_SHARE + (free * weight) / sum));
}

/**
 * The budget split by the repo's facts, before shiny:
 * - HP: contributors, on a log scale.
 * - Attack: commits in the last year.
 * - Guard: the share of issues closed, and age.
 * - Speed: how lately it was pushed, and releases.
 */
export function statPoints(repo: CardFacts, now: number): StatPoints {
  const { age, daysQuiet, closeRate, yearly } = signalsOf(repo, now);
  const budget = BUDGET[rarityFor(repo)];
  const [hp, attack, guard, speed] = split([
    logShare(repo.contributors, 500),
    logShare(yearly, 2000),
    closeRate * 0.6 + (Math.min(age, 10) / 10) * 0.4,
    Math.exp(-daysQuiet / 180) * 0.6 + (Math.min(repo.releases, 30) / 30) * 0.4,
  ]).map((share) => budget * share);
  return { hp, attack, guard, speed };
}

/** What a card does on the board, by its reach and, up close, by how its stats lean. */
export type Role = "tank" | "bruiser" | "assassin" | "ranged";

// Toughness (HP points and guard) over damage (attack and speed). Every card's stats are
// one budget split with floors and caps, so the ratio stays near 1: on real pools melee
// cards run 0.82 to 1.0, and these cuts give each role about a quarter, half and quarter.
const TANK_FROM = 0.92;
const ASSASSIN_BELOW = 0.85;

export function roleOf(card: Card): Role {
  if (card.range > 1) return "ranged";
  const toughness = (card.hp - HP_FLOOR) / HP_PER_POINT + card.guard;
  const lean = toughness / (card.attack + card.speed);
  if (lean >= TANK_FROM) return "tank";
  if (lean < ASSASSIN_BELOW) return "assassin";
  return "bruiser";
}

/** The card a repo becomes, the same for every player. */
export function cardFor(repo: CardFacts, now: number): Card {
  const points = statPoints(repo, now);
  const shiny = isShiny(repo.fullName);
  const lift = shiny ? SHINY : 1;
  const type = typeOf(repo.language);
  return {
    fullName: repo.fullName,
    type,
    sets: setsFor(repo.language, repo.topics ?? []),
    rarity: rarityFor(repo),
    hp: Math.round((HP_FLOOR + points.hp * HP_PER_POINT) * lift),
    attack: Math.round(points.attack * lift),
    guard: Math.round(points.guard * lift),
    speed: Math.round(points.speed * lift),
    range: REACH.includes(type) ? 3 : 1,
    ability: abilityFor(signalsOf(repo, now), repo.fullName),
    shiny,
  };
}
