// The battle game's rules (issue #45): how a repo becomes a card, which card types
// beat which, and how two teams fight. Pure and deterministic: the same teams and
// the same seed give the same fight on any machine, so anyone can check a result.

export type RepoFacts = {
  fullName: string;
  stars: number;
  forks: number;
  language: string | null;
  /** The language's colour on GitHub, as #rrggbb. */
  color: string | null;
  avatarUrl: string | null;
  isArchived: boolean;
  pushedAt: string | null;
  openIssues: number;
  closedIssues: number;
  releases: number;
};

export const CARD_TYPES = ["systems", "scripts", "web", "apps", "data", "docs"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export type Fighter = {
  fullName: string;
  language: string | null;
  color: string | null;
  avatarUrl: string | null;
  stars: number;
  type: CardType;
  level: number;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  /** The repo belongs to the player fielding it. */
  shiny: boolean;
  /** The repo is archived. */
  retired: boolean;
};

export type Side = "a" | "b";

export type BattleEvent = {
  round: number;
  side: Side;
  /** Index of the attacking card in its team. */
  attacker: number;
  /** Index of the card that was hit, in the other team. */
  target: number;
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
const STRONG = 1.3;
const WEAK = 1 / STRONG;
const CRITICAL_ODDS = 1 / 12;
const CRITICAL = 1.5;
const SHINY = 1.15;
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
 * A repo's card. Level grows with the log of its stars, so a 1,000-star repo can
 * still hurt a 100,000-star one; the other stats reward a repo that is alive:
 * pushed recently, closing its issues, cutting releases.
 */
export function fighterFor(repo: RepoFacts, playerLogin: string, now: number): Fighter {
  const level = Math.max(1, Math.min(100, Math.round(Math.log10(repo.stars + 1) * 20)));
  const daysQuiet = repo.pushedAt ? Math.max(0, (now - Date.parse(repo.pushedAt)) / DAY_MS) : 3650;
  const fresh = Math.exp(-daysQuiet / 180);
  const issues = repo.openIssues + repo.closedIssues;
  const closeRate = issues > 0 ? repo.closedIssues / issues : 0.5;
  const shiny = repo.fullName.split("/")[0].toLowerCase() === playerLogin.toLowerCase();
  const boost = shiny ? SHINY : 1;
  const tired = repo.isArchived ? 0.5 : 1;
  return {
    fullName: repo.fullName,
    language: repo.language,
    color: repo.color,
    avatarUrl: repo.avatarUrl,
    stars: repo.stars,
    type: typeOf(repo.language),
    level,
    hp: Math.round((150 + level * 2.5 + Math.min(Math.log10(repo.forks + 1) * 10, 40)) * boost),
    attack: Math.round((20 + level * 0.6 + fresh * 30) * boost * tired),
    defense: Math.round((20 + level * 0.5 + closeRate * 30) * boost),
    speed: Math.round((10 + fresh * 60 + Math.min(repo.releases, 30)) * boost * tired),
    shiny,
    retired: repo.isArchived,
  };
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
 */
export function battle(a: Fighter[], b: Fighter[], seed: string): BattleResult {
  const random = seededRandom(seed);
  const teams: Record<Side, Fighter[]> = { a, b };
  const hp: Record<Side, number[]> = { a: a.map((f) => f.hp), b: b.map((f) => f.hp) };
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
      const edge = matchup(attacker.type, target.type);
      const critical = random() < CRITICAL_ODDS;
      const base = (attacker.attack * attacker.attack) / (attacker.attack + target.defense);
      const damage = Math.max(1, Math.round(base * (edge === 1 ? STRONG : edge === -1 ? WEAK : 1) * (critical ? CRITICAL : 1) * (0.85 + random() * 0.3)));
      hp[other][targetIndex] = Math.max(0, hp[other][targetIndex] - damage);
      const knockedOut = hp[other][targetIndex] === 0;
      events.push({ round, side, attacker: active[side], target: targetIndex, damage, critical, matchup: edge, targetHp: hp[other][targetIndex], knockedOut });
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

/** The seed for an instant battle: the same matchup gives the same fight all day (UTC). */
export function instantSeed(a: { login: string; team: Fighter[] }, b: { login: string; team: Fighter[] }, now: number): string {
  const names = (side: { login: string; team: Fighter[] }) => `${side.login.toLowerCase()}:${side.team.map((f) => f.fullName.toLowerCase()).join(",")}`;
  return `${names(a)}|${names(b)}|${new Date(now).toISOString().slice(0, 10)}`;
}
