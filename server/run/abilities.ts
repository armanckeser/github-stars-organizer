import { seededRandom, type CardType } from "../battle.ts";
import type { Effect, Gate, Hook, Trigger } from "./hooks.ts";
import type { Signals } from "./stats.ts";

// One ability per card, named for GitHub life. Each fires by a rule (hooks.ts) and does
// something plain: damage, heal, shield, a stat change, or one of the four conditions.
// A repo qualifies for an ability by its facts; among the ones it qualifies for, its
// name picks one, so the same repo always has the same ability.

export type Ability = {
  id: string;
  name: string;
  /** What the card shows. */
  text: string;
  on: Trigger;
  when?: Gate;
  once?: boolean;
  effects: Effect[];
  /** The repo facts that qualify a card for this ability. */
  fits: (repo: Signals) => boolean;
};

const DAY_7 = 7;
const QUIET_YEAR = 365;

export const ABILITIES: Ability[] = [
  // At the start of the fight.
  { id: "cache-hit", name: "Cache hit", text: "Starts the fight 60% faster.", on: "start", effects: [{ kind: "stat", aim: "self", stat: "speed", by: 0.6 }], fits: (repo) => /cache|fast|speed|perf|quick/.test(repo.name) || repo.type === "data" },
  { id: "fork-bomb", name: "Fork bomb", text: "Opens with a hit on every enemy.", on: "start", effects: [{ kind: "damage", aim: "foes", power: 0.6 }], fits: (repo) => repo.forks >= 500 },
  { id: "code-freeze", name: "Code freeze", text: "Starts behind a shield of 22% of its HP.", on: "start", effects: [{ kind: "shield", aim: "self", share: 0.22 }], fits: (repo) => repo.archived || repo.daysQuiet > QUIET_YEAR },
  { id: "bus-factor", name: "Bus factor", text: "One maintainer: 70% more attack, 10% less guard.", on: "start", effects: [{ kind: "stat", aim: "self", stat: "attack", by: 0.7 }, { kind: "stat", aim: "self", stat: "guard", by: -0.1 }], fits: (repo) => repo.contributors <= 1 },
  { id: "monorepo", name: "Monorepo", text: "Every teammate starts with a small shield.", on: "start", effects: [{ kind: "shield", aim: "allies", share: 0.05 }], fits: (repo) => repo.contributors >= 200 },

  // After each of the card's hits.
  { id: "review-swarm", name: "Review swarm", text: "Each hit is followed by a quick second one.", on: "hit", effects: [{ kind: "damage", aim: "foe", power: 0.2 }], fits: (repo) => repo.contributors >= 50 },
  { id: "cherry-pick", name: "Cherry pick", text: "Each hit also nicks the weakest enemy.", on: "hit", effects: [{ kind: "damage", aim: "weakest-foe", power: 0.3 }], fits: (repo) => repo.stars > 20 && repo.forks / repo.stars >= 0.3 },

  // After the card is hit and still standing.
  { id: "hotfix", name: "Hotfix", text: "Under half HP, heals 30% of it, once.", on: "hurt", when: "low", once: true, effects: [{ kind: "heal", aim: "self", share: 0.3 }], fits: (repo) => repo.daysQuiet <= DAY_7 },
  { id: "rate-limit", name: "Rate limit", text: "Whoever hits it is rate limited.", on: "hurt", effects: [{ kind: "condition", aim: "foe", condition: "rate-limited" }], fits: (repo) => /api|http|client|sdk|fetch|request|proxy|server/.test(repo.name) },
  { id: "add-tests", name: "Add tests", text: "Each hit taken adds 9% guard.", on: "hurt", effects: [{ kind: "stat", aim: "self", stat: "guard", by: 0.09 }], fits: (repo) => repo.closedIssues >= 20 && repo.closeRate >= 0.8 },
  { id: "rubber-duck", name: "Rubber duck", text: "Each hit taken adds a small shield.", on: "hurt", effects: [{ kind: "shield", aim: "self", share: 0.025 }], fits: (repo) => repo.type === "docs" },
  { id: "revert", name: "Revert", text: "Hits back whoever hits it.", on: "hurt", effects: [{ kind: "damage", aim: "foe", power: 0.3 }], fits: (repo) => repo.releases >= 20 },

  // When a teammate faints.
  { id: "on-call", name: "On call", text: "When a teammate faints, gains 60% attack and heals 10%.", on: "ally-faint", effects: [{ kind: "stat", aim: "self", stat: "attack", by: 0.6 }, { kind: "heal", aim: "self", share: 0.1 }], fits: (repo) => repo.contributors >= 2 && repo.contributors <= 10 },
  { id: "postmortem", name: "Postmortem", text: "When a teammate faints, the team heals 12%.", on: "ally-faint", effects: [{ kind: "heal", aim: "allies", share: 0.12 }], fits: (repo) => repo.closedIssues >= 500 },
  { id: "good-first-issue", name: "Good first issue", text: "When a teammate faints, the team gains 25% attack.", on: "ally-faint", effects: [{ kind: "stat", aim: "allies", stat: "attack", by: 0.25 }], fits: (repo) => repo.stars < 100 && repo.contributors >= 3 },
  { id: "hard-fork", name: "Hard fork", text: "When a teammate faints, raises a shield of 25% of its HP.", on: "ally-faint", effects: [{ kind: "shield", aim: "self", share: 0.25 }], fits: (repo) => repo.stars > 20 && repo.forks >= repo.stars / 2 },

  // On every third hit.
  { id: "force-push", name: "Force push", text: "Every third hit, a heavy extra hit.", on: "third", effects: [{ kind: "damage", aim: "foe", power: 1.2 }], fits: (repo) => repo.yearly >= 1000 },
  { id: "rebase", name: "Rebase", text: "Every third hit, heals 10%.", on: "third", effects: [{ kind: "heal", aim: "self", share: 0.1 }], fits: (repo) => repo.age < 1 },
  { id: "green-build", name: "Green build", text: "Every third hit, heals the weakest teammate 5%.", on: "third", effects: [{ kind: "heal", aim: "weakest-ally", share: 0.05 }], fits: (repo) => repo.releases >= 10 },
  { id: "star-storm", name: "Star storm", text: "Every third hit, hits every enemy.", on: "third", effects: [{ kind: "damage", aim: "foes", power: 0.25 }], fits: (repo) => repo.stars >= 10_000 },
  { id: "breaking-change", name: "Breaking change", text: "Every third hit leaves a merge conflict.", on: "third", effects: [{ kind: "condition", aim: "foe", condition: "merge-conflict" }], fits: (repo) => repo.releases >= 30 },
  { id: "stale-bot", name: "Stale bot", text: "Every third hit leaves the target flaky.", on: "third", effects: [{ kind: "condition", aim: "foe", condition: "flaky" }], fits: (repo) => repo.openIssues >= 200 },
  { id: "legacy-code", name: "Legacy code", text: "Every third hit leaves the target rate limited.", on: "third", effects: [{ kind: "condition", aim: "foe", condition: "rate-limited" }], fits: (repo) => repo.age >= 8 },
  { id: "dependabot", name: "Dependabot", text: "Every third hit leaves the target deprecated.", on: "third", effects: [{ kind: "condition", aim: "foe", condition: "deprecated" }], fits: (repo) => repo.yearly >= 300 },
];

/** The ability a repo gets when it qualifies for none. */
const BY_TYPE: Record<CardType, string> = {
  systems: "legacy-code",
  scripts: "rate-limit",
  web: "cache-hit",
  apps: "on-call",
  data: "green-build",
  docs: "rubber-duck",
};

const BY_ID = new Map(ABILITIES.map((ability) => [ability.id, ability]));

export const abilityById = (id: string): Ability | undefined => BY_ID.get(id);

/** One of the abilities the repo qualifies for, picked by its full name. */
export function abilityFor(repo: Signals, fullName: string): string {
  const fitting = ABILITIES.filter((ability) => ability.fits(repo));
  if (fitting.length === 0) return BY_TYPE[repo.type];
  return fitting[Math.floor(seededRandom(`ability|${fullName.toLowerCase()}`)() * fitting.length)].id;
}

/** The hooks a card carries for its ability. An unknown id carries none. */
export function abilityHooks(id: string): Hook[] {
  const ability = BY_ID.get(id);
  return ability ? [{ source: ability.id, on: ability.on, when: ability.when, once: ability.once, effects: ability.effects }] : [];
}
