// The battle game's rules (issue #45): how a repo becomes a card, which card types
// beat which, and how two teams fight. Pure and deterministic: the same teams and
// the same seed give the same fight on any machine, so anyone can check a result.

import type { ClassId } from "./character.ts";

export type RepoFacts = {
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  /** The language's colour on GitHub, as #rrggbb. */
  color: string | null;
  avatarUrl: string | null;
  isArchived: boolean;
  createdAt: string | null;
  pushedAt: string | null;
  openIssues: number;
  closedIssues: number;
  releases: number;
  /** People who can be mentioned in the repo: GitHub's closest count to contributors. */
  contributors: number;
  /** Commits on the default branch. */
  commits: number;
  /** Commits on the default branch in the last year. Missing from older replies: then estimated from `commits` and age. */
  commitsYear?: number;
};

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

export const CARD_TYPES = ["systems", "scripts", "web", "apps", "data", "docs"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export type Move = {
  name: string;
  /** What the damage is multiplied by. */
  power: number;
  /** Shown on the card: the damage against an evenly matched defender. */
  damage: number;
};

export type Fighter = {
  fullName: string;
  description: string | null;
  language: string | null;
  color: string | null;
  avatarUrl: string | null;
  stars: number;
  contributors: number;
  commits: number;
  /** Whole years since the repo was created. */
  age: number;
  /** 0 to 10: pushed lately, closes its issues, cuts releases, has people. */
  health: number;
  type: CardType;
  /** The type that hits this card harder, and the one this card shrugs off. Null for docs. */
  weakness: CardType | null;
  resistance: CardType | null;
  /** Shown on cards; no longer changes the stats. */
  level: number;
  /** From the stars: sets the card's stat budget. */
  rarity: Rarity;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  /** The everyday move, and the special the card uses on every third hit. */
  moves: [Move, Move];
  /** Owned by armanckeser: a foil card and 5% more of every stat, for every player. */
  shiny: boolean;
  /** The repo belongs to the player fielding it. No stat bonus. */
  home: boolean;
  /** The repo is archived. */
  retired: boolean;
  /** The player's class makes this card stronger. */
  perk: boolean;
  /** Drawn from the player's stars for the day, not chosen by them. */
  wildcard?: boolean;
};

export type Side = "a" | "b";

export type BattleEvent = {
  round: number;
  side: Side;
  /** Index of the attacking card in its team. */
  attacker: number;
  /** Index of the card that was hit, in the other team. */
  target: number;
  move: string;
  special: boolean;
  damage: number;
  critical: boolean;
  /** 1 when the attacker's type beats the target's, -1 the other way round, 0 otherwise. */
  matchup: -1 | 0 | 1;
  /** The target's HP after the hit. */
  targetHp: number;
  knockedOut: boolean;
};

export type BattleResult = {
  /** Null only when both teams are empty. */
  winner: Side | null;
  events: BattleEvent[];
  /** Cards still standing on each side. */
  standing: Record<Side, number>;
};

const LANGUAGE_TYPE: Record<string, CardType> = {
  Rust: "systems", C: "systems", "C++": "systems", Go: "systems", Zig: "systems", Assembly: "systems", Nim: "systems", Haskell: "systems", OCaml: "systems", Elixir: "systems", Erlang: "systems",
  Shell: "scripts", Ruby: "scripts", PHP: "scripts", Lua: "scripts", Perl: "scripts", PowerShell: "scripts", Nix: "scripts", "Vim Script": "scripts", "Emacs Lisp": "scripts", Makefile: "scripts", Dockerfile: "scripts", HCL: "scripts",
  TypeScript: "web", JavaScript: "web", HTML: "web", CSS: "web", SCSS: "web", Svelte: "web", Vue: "web", Astro: "web", MDX: "web",
  Swift: "apps", Kotlin: "apps", Dart: "apps", Java: "apps", "C#": "apps", "Objective-C": "apps", Scala: "apps",
  Python: "data", "Jupyter Notebook": "data", R: "data", Julia: "data", MATLAB: "data", Cuda: "data",
};

// Each type beats the next one round the ring. Docs sits outside: no edge either way.
const RING: CardType[] = ["systems", "scripts", "web", "apps", "data"];

// Every type's everyday move.
const BASIC_MOVE: Record<CardType, string> = {
  systems: "Bare Metal",
  scripts: "Pipe Chain",
  web: "Hot Reload",
  apps: "Push Alert",
  data: "Batch Job",
  docs: "Read the Docs",
};

const STRONG = 1.5;
const WEAK = 1 / STRONG;
const CRITICAL_ODDS = 1 / 12;
const CRITICAL = 1.5;
const SHINY = 1.05;
/** Repos from this account are shiny for every player: the game asks for stars. */
export const SHINY_OWNER = "armanckeser";
// The stat budget per rarity, and the stars each rarity starts at.
const RARITY_STARS: [Rarity, number, number][] = [["legendary", 100_000, 460], ["epic", 10_000, 445], ["rare", 1000, 430], ["uncommon", 100, 415], ["common", 0, 400]];
// Each stat's share of the budget stays between these.
const MIN_SHARE = 0.15;
const MAX_SHARE = 0.4;
// HP is a pool and the other stats are rates. One budget point buys this much HP,
// so an even card (about 107 HP points) has about 160 HP and falls to four everyday
// hits from an even card, and a 4-card match lasts about 50 turns.
const HP_PER_POINT = 1.5;
// A hit between two cards with the same attack, defense and speed, before the move,
// the type edge and the dice.
const DAMAGE = 40;
// How much a speed lead adds to a hit: the speed ratio to this power.
const SPEED_EDGE = 0.4;
// Speed is shared out of the common budget whatever the rarity. Speed also decides who
// moves first, so a rarer card that was faster too would win the opening as well.
const SPEED_BUDGET = 400;
// The card a move's shown damage is measured against: an even split of a rare's budget.
const EVEN = 430 / 4;
const SPECIAL_POWER = 1.6;
const SPECIAL_EVERY = 3;
const MAX_ROUNDS = 400;
const DAY_MS = 86_400_000;

export function typeOf(language: string | null): CardType {
  return (language && LANGUAGE_TYPE[language]) || "docs";
}

export function matchup(attacker: CardType, target: CardType): -1 | 0 | 1 {
  const a = RING.indexOf(attacker);
  const t = RING.indexOf(target);
  if (a === -1 || t === -1) return 0;
  if ((a + 1) % RING.length === t) return 1;
  if ((t + 1) % RING.length === a) return -1;
  return 0;
}

/**
 * A hit's damage before the move, the type edge and the dice: attack against defense,
 * and more for the faster card. Only ratios count, so a card with every stat 15%
 * higher is 15% stronger (its HP), not more.
 */
export function baseDamage(attacker: { attack: number; speed: number }, target: { defense: number; speed: number }): number {
  return DAMAGE * (attacker.attack / Math.max(1, target.defense)) * (Math.max(1, attacker.speed) / Math.max(1, target.speed)) ** SPEED_EDGE;
}

function movesFor(names: [string, string], attack: number, speed: number): [Move, Move] {
  const shown = (power: number) => Math.round(baseDamage({ attack, speed }, { defense: EVEN, speed: EVEN }) * power);
  return [
    { name: names[0], power: 1, damage: shown(1) },
    { name: names[1], power: SPECIAL_POWER, damage: shown(SPECIAL_POWER) },
  ];
}

/** A value's place between 0 and 1 on a log scale that tops out at `full`. */
function logShare(value: number, full: number): number {
  return Math.min(1, Math.log10(value + 1) / Math.log10(full + 1));
}

export function rarityOf(stars: number): Rarity {
  return RARITY_STARS.find(([, from]) => stars >= from)?.[0] ?? "common";
}

/** The stat points a card of this rarity shares out across HP, attack, defense and speed. */
export function budgetOf(rarity: Rarity): number {
  return RARITY_STARS.find(([name]) => name === rarity)?.[2] ?? 400;
}

/**
 * Shares of a budget from four signals between 0 and 1: each share grows with its
 * signal and stays between MIN_SHARE and MAX_SHARE, and the shares add up to 1.
 */
function split(signals: number[]): number[] {
  const weights = signals.map((signal) => 0.3 + Math.max(0, Math.min(1, signal)));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const free = 1 - MIN_SHARE * signals.length;
  return weights.map((weight) => Math.min(MAX_SHARE, MIN_SHARE + (free * weight) / sum));
}

/**
 * A repo's card. Stars set the rarity, and the rarity sets the stat budget: a
 * legendary has 15% more to spend on HP, attack and defense than a common. How the budget is split comes from
 * the repo's shape: contributors are HP, commits in the last year are attack, closed
 * issues and age are defense, a recent push and releases are speed. The special move
 * is named for whatever the repo is best at. Level still follows the stars, for show.
 */
export function fighterFor(repo: RepoFacts, playerLogin: string, now: number, klass: ClassId = "rookie"): Fighter {
  const level = Math.max(1, Math.min(100, Math.round(Math.log10(repo.stars + 1) * 20)));
  const rarity = rarityOf(repo.stars);
  const daysQuiet = repo.pushedAt ? Math.max(0, (now - Date.parse(repo.pushedAt)) / DAY_MS) : 3650;
  const fresh = Math.exp(-daysQuiet / 180);
  const age = repo.createdAt ? Math.max(0, Math.floor((now - Date.parse(repo.createdAt)) / (365.25 * DAY_MS))) : 0;
  const issues = repo.openIssues + repo.closedIssues;
  const closeRate = issues > 0 ? repo.closedIssues / issues : 0.5;
  const people = logShare(repo.contributors, 1000);
  const work = logShare(repo.commits, 20_000);
  const yearly = repo.commitsYear ?? repo.commits / Math.max(1, age);
  const shipped = Math.min(repo.releases, 30) / 30;
  const owner = repo.fullName.split("/")[0].toLowerCase();
  const shiny = owner === SHINY_OWNER;
  const home = owner === playerLogin.toLowerCase();
  // The classes that favour single cards (server/character.ts says what each one does).
  const sturdy = klass === "veteran" && age >= 8;
  const perk = (klass === "maintainer" && home) || (klass === "scout" && repo.stars < 1000) || sturdy || (klass === "archivist" && repo.isArchived);
  const boost = (shiny ? SHINY : 1) * (klass === "maintainer" && home ? 1.08 : 1) * (klass === "scout" && repo.stars < 1000 ? 1.15 : 1);
  const tough = sturdy ? 1.12 : 1;
  const tired = repo.isArchived && klass !== "archivist" ? 0.5 : 1;
  const type = typeOf(repo.language);
  const ring = RING.indexOf(type);

  const budget = budgetOf(rarity);
  const [hpShare, attackShare, defenseShare, speedShare] = split([
    logShare(repo.contributors, 500),
    logShare(yearly, 2000),
    closeRate * 0.6 + (Math.min(age, 10) / 10) * 0.4,
    fresh * 0.6 + shipped * 0.4,
  ]);
  const attack = Math.round(budget * attackShare * boost * tired);
  const speed = Math.round(SPEED_BUDGET * speedShare * boost * tired);

  // The special is named for the repo's strongest trait; ties go to the first listed.
  const traits: [string, number][] = [
    ["Star Storm", logShare(repo.stars, 100_000)],
    ["Fork Bomb", logShare(repo.forks, 20_000)],
    ["Commit Barrage", work],
    ["Swarm Review", people],
    ["Ship It", shipped],
    ["Issue Sweep", issues >= 20 ? closeRate * 0.9 : 0],
    ["Hotfix", fresh * 0.8],
  ];
  const special = traits.reduce((best, trait) => (trait[1] > best[1] ? trait : best))[0];

  return {
    fullName: repo.fullName,
    description: repo.description,
    language: repo.language,
    color: repo.color,
    avatarUrl: repo.avatarUrl,
    stars: repo.stars,
    contributors: repo.contributors,
    commits: repo.commits,
    age,
    health: repo.isArchived ? 0 : Math.round((fresh * 4 + closeRate * 3 + shipped * 1.5 + people * 1.5) * 10) / 10,
    type,
    weakness: ring === -1 ? null : RING[(ring + RING.length - 1) % RING.length],
    resistance: ring === -1 ? null : RING[(ring + 1) % RING.length],
    level,
    rarity,
    hp: Math.round(budget * hpShare * HP_PER_POINT * boost * tough),
    attack,
    defense: Math.round(budget * defenseShare * boost * tough),
    speed,
    moves: movesFor([BASIC_MOVE[type], special], attack, speed),
    shiny,
    home,
    retired: repo.isArchived,
    perk,
  };
}

function strengthen(fighter: Fighter, by: { all?: number; attack?: number }): Fighter {
  const all = by.all ?? 1;
  const attack = Math.round(fighter.attack * all * (by.attack ?? 1));
  const speed = Math.round(fighter.speed * all);
  return {
    ...fighter,
    hp: Math.round(fighter.hp * all),
    attack,
    defense: Math.round(fighter.defense * all),
    speed,
    moves: movesFor([fighter.moves[0].name, fighter.moves[1].name], attack, speed),
    perk: true,
  };
}

/**
 * A player's team: each repo's card, with the class's perk applied. The classes that
 * look at the whole team (collector, specialist) are settled here; the rest per card.
 */
export function fieldTeam(repos: RepoFacts[], playerLogin: string, klass: ClassId, now: number): Fighter[] {
  const team = repos.map((repo) => fighterFor(repo, playerLogin, now, klass));
  if (klass === "collector" && team.length >= 3 && new Set(team.map((f) => f.type)).size === team.length) {
    return team.map((fighter) => strengthen(fighter, { all: 1.06 }));
  }
  if (klass === "specialist") {
    const counts = new Map<CardType, number>();
    for (const fighter of team) counts.set(fighter.type, (counts.get(fighter.type) ?? 0) + 1);
    return team.map((fighter) => ((counts.get(fighter.type) ?? 0) >= 3 ? strengthen(fighter, { attack: 1.1 }) : fighter));
  }
  return team;
}

/** A random number generator that gives the same numbers for the same seed text. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Two teams fight card against card, in team order. Each round both active cards
 * hit once, the faster one first; a card at zero HP is out and the next steps in.
 * A card's every third hit is its special move.
 */
export function battle(a: Fighter[], b: Fighter[], seed: string): BattleResult {
  const random = seededRandom(seed);
  const teams: Record<Side, Fighter[]> = { a, b };
  const hp: Record<Side, number[]> = { a: a.map((f) => f.hp), b: b.map((f) => f.hp) };
  const hits: Record<Side, number[]> = { a: a.map(() => 0), b: b.map(() => 0) };
  const active: Record<Side, number> = { a: 0, b: 0 };
  const events: BattleEvent[] = [];
  const out = (side: Side) => active[side] >= teams[side].length;

  for (let round = 1; round <= MAX_ROUNDS && !out("a") && !out("b"); round++) {
    const speedA = teams.a[active.a].speed;
    const speedB = teams.b[active.b].speed;
    const first: Side = speedA === speedB ? (random() < 0.5 ? "a" : "b") : speedA > speedB ? "a" : "b";
    for (const side of [first, first === "a" ? "b" : "a"] as Side[]) {
      const other: Side = side === "a" ? "b" : "a";
      if (out(side) || out(other)) break;
      const attacker = teams[side][active[side]];
      const targetIndex = active[other];
      const target = teams[other][targetIndex];
      const special = ++hits[side][active[side]] % SPECIAL_EVERY === 0;
      const move = attacker.moves[special ? 1 : 0];
      const edge = matchup(attacker.type, target.type);
      const critical = random() < CRITICAL_ODDS;
      const base = baseDamage(attacker, target);
      const damage = Math.max(
        1,
        Math.round(base * move.power * (edge === 1 ? STRONG : edge === -1 ? WEAK : 1) * (critical ? CRITICAL : 1) * (0.85 + random() * 0.3)),
      );
      hp[other][targetIndex] = Math.max(0, hp[other][targetIndex] - damage);
      const knockedOut = hp[other][targetIndex] === 0;
      events.push({
        round, side, attacker: active[side], target: targetIndex, move: move.name, special,
        damage, critical, matchup: edge, targetHp: hp[other][targetIndex], knockedOut,
      });
      // The knocked-out card doesn't hit back; its replacement waits for the next round.
      if (knockedOut) {
        active[other]++;
        break;
      }
    }
  }

  const standing = { a: Math.max(0, a.length - active.a), b: Math.max(0, b.length - active.b) };
  const winner: Side | null = standing.a === standing.b ? (a.length || b.length ? (hpLeft(hp.a) >= hpLeft(hp.b) ? "a" : "b") : null) : standing.a > standing.b ? "a" : "b";
  return { winner, events, standing };
}

function hpLeft(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * Repos drawn from someone's stars: `count` of them, none from `exclude`, the same
 * draw for the same seed. The seed is the username and the date, so a player's
 * wildcard changes every day and everyone sees the same one.
 */
export function drawFromStars(starred: string[], exclude: string[], count: number, seed: string): string[] {
  const taken = new Set(exclude.map((name) => name.toLowerCase()));
  const pool = starred.filter((name) => !taken.has(name.toLowerCase()));
  const random = seededRandom(seed);
  const drawn: string[] = [];
  while (drawn.length < count && pool.length > 0) drawn.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return drawn;
}

/** The seed for an instant battle: the same matchup gives the same fight all day (UTC). */
export function instantSeed(a: { login: string; team: Fighter[] }, b: { login: string; team: Fighter[] }, now: number): string {
  const names = (side: { login: string; team: Fighter[] }) => `${side.login.toLowerCase()}:${side.team.map((f) => f.fullName.toLowerCase()).join(",")}`;
  return `${names(a)}|${names(b)}|${new Date(now).toISOString().slice(0, 10)}`;
}
