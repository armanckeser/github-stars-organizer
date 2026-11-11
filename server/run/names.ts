import { abilityById } from "./abilities.ts";
import { boostById } from "./boosts.ts";
import type { Condition } from "./hooks.ts";
import { SETS } from "./sets.ts";
import type { Card } from "./types.ts";

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
