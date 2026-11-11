import type { CardType } from "../battle.ts";
import type { Aim, Effect, Hook, Stat, Trigger } from "./hooks.ts";
import type { Card, Snapshot } from "./types.ts";

// Cards that share a set (a language or a topic) give each other a bonus: a small one
// with two, a bigger one with three or more. Nothing forbids a mix; a mixed team just
// has no bonus. A language with no bonus of its own gives its type's bonus.

export const COMMON_TOPICS = ["cli", "ai", "web", "database", "security", "game"] as const;

type Bonus = { text: string; on: Trigger; effects: Effect[] };
export type SetBonus = { set: string; name: string; two: Bonus; three: Bonus };

const PERCENT = 100;

/** A bonus whose numbers double from two cards to three. */
function tiered(set: string, name: string, on: Trigger, text: (amount: number) => string, effects: (scale: number) => Effect[], base: number): SetBonus {
  return { set, name, two: { text: text(base), on, effects: effects(1) }, three: { text: text(base * 2), on, effects: effects(2) } };
}
const raise = (set: string, name: string, stat: Stat, by: number) =>
  tiered(set, name, "start", (amount) => `${Math.round(amount * PERCENT)}% more ${stat}.`, (scale) => [{ kind: "stat", aim: "self", stat, by: by * scale }], by);
const luck = (set: string, name: string, by: number) =>
  tiered(set, name, "start", (amount) => `${Math.round(amount * PERCENT * 10) / 10} points more critical odds.`, (scale) => [{ kind: "stat", aim: "self", stat: "luck", by: by * scale }], by);
const shield = (set: string, name: string, on: Trigger, share: number, when: string) =>
  tiered(set, name, on, (amount) => `${when} a shield of ${Math.round(amount * PERCENT)}% of HP.`, (scale) => [{ kind: "shield", aim: "self", share: share * scale }], share);
const heal = (set: string, name: string, on: Trigger, share: number, when: string) =>
  tiered(set, name, on, (amount) => `${when} heals ${Math.round(amount * PERCENT)}%.`, (scale) => [{ kind: "heal", aim: "self", share: share * scale }], share);
const strike = (set: string, name: string, on: Trigger, aim: Aim, power: number, when: string) =>
  tiered(set, name, on, (amount) => `${when} an extra hit of ${Math.round(amount * PERCENT)}%.`, (scale) => [{ kind: "damage", aim, power: power * scale }], power);

export const SETS: SetBonus[] = [
  raise("typescript", "Type checked", "guard", 0.08),
  raise("javascript", "Event loop", "speed", 0.08),
  heal("python", "Batteries included", "third", 0.04, "Every third hit"),
  shield("rust", "Borrow checker", "start", 0.1, "Starts with"),
  strike("go", "Goroutines", "hit", "foe", 0.1, "Each hit adds"),
  raise("c", "Bare metal", "attack", 0.08),
  tiered("c++", "Templates", "start", (amount) => `Critical hits deal ${1.5 + amount} times the damage.`, (scale) => [{ kind: "stat", aim: "self", stat: "critical", by: 0.25 * scale }], 0.25),
  tiered("java", "Enterprise", "hurt", (amount) => `Each hit taken adds ${Math.round(amount * PERCENT)}% guard.`, (scale) => [{ kind: "stat", aim: "self", stat: "guard", by: 0.02 * scale }], 0.02),
  luck("kotlin", "Coroutines", 0.03),
  tiered("swift", "Swift", "start", (amount) => `${Math.round(amount * PERCENT)}% more attack and speed.`, (scale) => [{ kind: "stat", aim: "self", stat: "attack", by: 0.05 * scale }, { kind: "stat", aim: "self", stat: "speed", by: 0.05 * scale }], 0.05),
  heal("c#", "Garbage collector", "ally-faint", 0.1, "When a teammate faints,"),
  strike("ruby", "Convention", "third", "foe", 0.3, "Every third hit adds"),
  shield("php", "Everywhere", "hurt", 0.02, "Each hit taken adds"),
  strike("shell", "Pipes", "hit", "weakest-foe", 0.1, "Each hit adds, on the weakest enemy,"),
  raise("cli", "Flags", "speed", 0.1),
  strike("ai", "Inference", "third", "foes", 0.15, "Every third hit, on every enemy,"),
  shield("web", "Edge cache", "start", 0.08, "Starts with"),
  raise("database", "Indexes", "guard", 0.1),
  tiered("security", "Least privilege", "start", (amount) => `${Math.round(amount * PERCENT)}% more guard and a shield of the same share of HP.`, (scale) => [{ kind: "stat", aim: "self", stat: "guard", by: 0.05 * scale }, { kind: "shield", aim: "self", share: 0.05 * scale }], 0.05),
  luck("game", "Speedrun", 0.04),
];

/** The bonus of a language that has none of its own, by the language's type. */
export const FAMILY_SETS: Record<CardType, SetBonus> = {
  systems: raise("systems", "Low level", "attack", 0.06),
  scripts: raise("scripts", "Glue code", "speed", 0.06),
  web: raise("web-family", "Full stack", "guard", 0.06),
  apps: shield("apps", "App store", "start", 0.06, "Starts with"),
  data: heal("data", "Notebook", "third", 0.03, "Every third hit"),
  docs: shield("docs", "Footnotes", "hurt", 0.02, "Each hit taken adds"),
};

const BY_SET = new Map(SETS.map((bonus) => [bonus.set, bonus]));

/** A card's sets: its language, then up to two topics, the common ones first. Lower-case. */
export function setsFor(language: string | null, topics: string[]): string[] {
  const lower = topics.map((topic) => topic.toLowerCase());
  const common = lower.filter((topic) => (COMMON_TOPICS as readonly string[]).includes(topic));
  const rest = lower.filter((topic) => !common.includes(topic));
  return [...(language ? [language.toLowerCase()] : []), ...[...common, ...rest].slice(0, 2)];
}

/** The bonus a set gives the cards that share it: its own, else their type's when they all share one. */
function bonusOf(set: string, members: Card[]): SetBonus | undefined {
  const own = BY_SET.get(set);
  if (own) return own;
  const types = new Set(members.map((card) => card.type as CardType));
  const [type] = types;
  return types.size === 1 && type in FAMILY_SETS ? FAMILY_SETS[type] : undefined;
}

/** The set hooks each unit carries: `setHooks(team)[i]` belongs to `team.units[i]`. */
export function setHooks(team: Snapshot): Hook[][] {
  const hooks: Hook[][] = team.units.map(() => []);
  const members = new Map<string, number[]>();
  team.units.forEach((unit, index) => new Set(unit.card.sets).forEach((set) => members.set(set, [...(members.get(set) ?? []), index])));
  for (const [set, indexes] of members) {
    const bonus = indexes.length >= 2 ? bonusOf(set, indexes.map((index) => team.units[index].card)) : undefined;
    if (!bonus) continue;
    const tier = indexes.length >= 3 ? bonus.three : bonus.two;
    for (const index of indexes) hooks[index].push({ source: `set:${set}`, on: tier.on, effects: tier.effects });
  }
  return hooks;
}
