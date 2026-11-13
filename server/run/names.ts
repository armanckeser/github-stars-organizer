import { abilityById } from "./abilities.ts";
import { boostById } from "./boosts.ts";
import { DEPRECATED_EVERY, deprecatedLoss, FLAKY_ODDS, MERGE_CONFLICT_ODDS, RATE_LIMITED, type Condition, type Effect, type Gate, type Stat, type Trigger } from "./hooks.ts";
import { SETS } from "./sets.ts";
import { TICK_MS, type Card } from "./types.ts";

// What the screen calls the things a fight's events name: an ability, a set bonus,
// a boost or a condition. Fight events carry ids (`ability` events' `ability`,
// `hp` events' `cause`); these turn them into words.

export const RARITY_NAMES: Record<Card["rarity"], string> = { 0: "Common", 1: "Uncommon", 2: "Rare", 3: "Epic", 4: "Legendary" };

export const CONDITION_NAMES: Record<Condition, string> = {
  "merge-conflict": "Merge conflict",
  "rate-limited": "Rate limited",
  deprecated: "Deprecated",
  flaky: "Flaky",
};

const MILLISECONDS_PER_SECOND = 1000;
const secondsOf = (ticks: number) => (ticks * TICK_MS) / MILLISECONDS_PER_SECOND;
/** "1 hit in 3" for odds of 1/3. */
const oneIn = (odds: number) => `1 hit in ${Math.round(1 / odds)}`;
const everySecond = secondsOf(DEPRECATED_EVERY) === 1 ? "each second" : `every ${secondsOf(DEPRECATED_EVERY)} s`;

/** What each condition does to the card wearing it, read from the numbers the fight uses (hooks.ts). */
const CONDITION_EFFECTS: Record<Condition, (fullHp: number) => string> = {
  "merge-conflict": () => `${oneIn(MERGE_CONFLICT_ODDS)} lands on itself`,
  "rate-limited": () => `acts ${RATE_LIMITED}× slower`,
  deprecated: (fullHp) => `loses ${deprecatedLoss(fullHp)} HP ${everySecond}`,
  flaky: () => `${oneIn(FLAKY_ODDS)} misses`,
};

/**
 * A condition as a sentence, for a card with `fullHp` and `ticksLeft` of it to go:
 * "Rate limited: acts 1.5× slower, 2 s left". The seconds round up, so a condition
 * still on never reads "0 s left".
 */
export function conditionLine(condition: Condition, ticksLeft: number, fullHp: number): string {
  const seconds = Math.max(1, Math.ceil(secondsOf(ticksLeft)));
  return `${CONDITION_NAMES[condition]}: ${CONDITION_EFFECTS[condition](fullHp)}, ${seconds} s left`;
}

/** Sets whose name is not the set written with a capital letter. */
const SET_NAMES: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  "c++": "C++",
  "c#": "C#",
  php: "PHP",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  ai: "AI",
  cli: "CLI",
  api: "API",
  ios: "iOS",
  macos: "macOS",
  llm: "LLM",
};

/** A set as written on a card: "typescript" is TypeScript, "game" is Game. */
export const setName = (set: string) => SET_NAMES[set] ?? set.charAt(0).toUpperCase() + set.slice(1);

export type Source = { kind: "ability" | "set" | "boost" | "condition"; name: string };

/** What an event's `ability` or `cause` is, in words. An unknown id comes back as written. */
export function sourceOf(id: string): Source {
  if (id.startsWith("set:")) {
    const set = id.slice("set:".length);
    return { kind: "set", name: SETS.find((bonus) => bonus.set === set)?.name ?? setName(set) };
  }
  if (id.startsWith("boost:")) {
    const boost = id.slice("boost:".length);
    return { kind: "boost", name: boostById(boost)?.name ?? boost };
  }
  if (id in CONDITION_NAMES) return { kind: "condition", name: CONDITION_NAMES[id as Condition] };
  return { kind: "ability", name: abilityById(id)?.name ?? id };
}

const TRIGGER_WORDS: Record<Trigger, string> = { start: "Start", hit: "Hit", hurt: "Hurt", "ally-faint": "Ally down", third: "3rd hit" };
const GATE_WORDS: Record<Gate, string> = { low: "Low HP", alone: "Alone" };
const STAT_WORDS: Record<Stat, string> = { attack: "attack", guard: "guard", speed: "speed", critical: "crit", luck: "luck" };

/** What one effect does, in two or three words: "hit all", "shield team", "foe speed down". */
function effectWords(effect: Effect): string {
  const many = effect.aim === "foes" || effect.aim === "allies";
  const weakest = effect.aim === "weakest-foe" || effect.aim === "weakest-ally";
  const reach = many ? " all" : weakest ? " weakest" : "";
  if (effect.kind === "damage") return effect.aim === "foe" ? "extra hit" : `hit${reach}`;
  if (effect.kind === "shield") return `shield${reach}`;
  if (effect.kind === "heal") return `heal${reach}`;
  if (effect.kind === "condition") return CONDITION_NAMES[effect.condition];
  const whose = effect.aim === "self" ? "" : effect.aim.endsWith("foe") || effect.aim === "foes" ? "foe " : "team ";
  return `${whose}${STAT_WORDS[effect.stat]} ${effect.by > 0 ? "up" : "down"}`;
}

/**
 * The card a fight shows over a creature when one of its abilities, set bonuses or
 * boosts fires (docs/GAME-UI.md §9): its name, and "Trigger → effect" in a few words.
 * A condition has no trigger of its own, so its line is null.
 */
export function popOf(id: string): Source & { line: string | null } {
  const source = sourceOf(id);
  const hook = hookOf(id);
  if (!hook) return { ...source, line: null };
  const trigger = hook.when ? GATE_WORDS[hook.when] : TRIGGER_WORDS[hook.on];
  const effect = effectWords(hook.effects[0]);
  return { ...source, line: `${trigger} → ${effect.charAt(0).toUpperCase()}${effect.slice(1)}` };
}

/** What the ability, set bonus or boost behind an event's id does, in order; a set's are its two-card bonus. An unknown id does nothing. */
export const effectsOf = (id: string): Effect[] => hookOf(id)?.effects ?? [];

/** When the thing behind an event's id fires and what it does first; a set's words are its two-card bonus. */
function hookOf(id: string): { on: Trigger; when?: Gate; effects: Effect[] } | null {
  if (id.startsWith("set:")) return SETS.find((bonus) => bonus.set === id.slice("set:".length))?.two ?? null;
  if (id.startsWith("boost:")) return boostById(id.slice("boost:".length)) ?? null;
  return abilityById(id) ?? null;
}
