import { CARD_TYPES, LANGUAGE_NAMES, typeOf, type CardType } from "../battle.ts";
import type { Effect, Hook, Trigger } from "./hooks.ts";
import type { Card, Snapshot } from "./types.ts";

// Cards that share a set give each other a bonus: at 2 cards, and a bigger one at 4.
// A card's sets are its family (from its language: Systems, Scripts, Web, Apps, Data,
// Docs, the card's type) and up to two of its repo's topics. Each family does one thing
// of its own; every topic does the same plain thing, so a topic is never a hidden
// rule. Nothing forbids a mix. The design and its numbers: docs/GAME-DESIGN.md,
// "The sets", held to a strength band by set-strength.test.ts.

/** Topics a card keeps first when its repo has more than two: the ones most often shared. */
export const COMMON_TOPICS = ["cli", "ai", "database", "security", "game"] as const;
/** Topics a card counts, after its family. */
const TOPICS_PER_CARD = 2;
/** The cards a set needs for its first bonus and for its second. */
export const TIERS = [2, 4] as const;

export type Tier = { at: (typeof TIERS)[number]; text: string; on: Trigger; effects: Effect[] };
/** What a set does: `does` names it in a word or two, `tiers` are its bonus at 2 cards and at 4. */
export type SetBonus = { kind: "family" | "topic"; does: string; tiers: readonly [Tier, Tier] };

const PERCENT = 100;
/** A share as a percent, to a tenth: 0.025 is "2.5%". */
const percent = (share: number) => `${Number((share * PERCENT).toFixed(1))}%`;
/** Critical odds as a whole percent: 0.1625 is "16%". */
const wholePercent = (share: number) => `${Math.round(share * PERCENT)}%`;
/** The odds every card has of a critical hit (fight.ts CRITICAL_ODDS), for the Data text. */
const BASE_CRITICAL_ODDS = 0.0625;

/** A bonus whose tiers differ only by an amount: `amounts` holds the amount at 2 cards and at 4. */
function bonus(kind: SetBonus["kind"], does: string, on: Trigger, amounts: readonly [number, number], text: (amount: number) => string, effects: (amount: number) => Effect[]): SetBonus {
  const tier = (at: Tier["at"], amount: number): Tier => ({ at, text: text(amount), on, effects: effects(amount) });
  return { kind, does, tiers: [tier(TIERS[0], amounts[0]), tier(TIERS[1], amounts[1])] };
}

/** Each family's bonus: one thing per family, nothing shared. */
export const FAMILIES: Record<CardType, SetBonus> = {
  web: bonus("family", "Shield", "start", [0.05, 0.08], (share) => `Starts each fight with a shield of ${percent(share)} of its HP.`, (share) => [{ kind: "shield", aim: "self", share }]),
  systems: bonus("family", "Extra hit", "third", [0.25, 0.3], (power) => `Every third hit adds another hit of ${percent(power)}.`, (power) => [{ kind: "damage", aim: "foe", power }]),
  apps: bonus("family", "Guard", "hurt", [0.04, 0.07], (by) => `Each hit it takes adds ${percent(by)} guard.`, (by) => [{ kind: "stat", aim: "self", stat: "guard", by }]),
  data: bonus("family", "Critical", "start", [0.1, 0.15], (by) => `Lands a critical hit on ${wholePercent(BASE_CRITICAL_ODDS + by)} of its hits, not ${wholePercent(BASE_CRITICAL_ODDS)}.`, (by) => [{ kind: "stat", aim: "self", stat: "luck", by }]),
  scripts: bonus("family", "Opening hit", "start", [0.25, 0.28], (power) => `As the fight starts, hits every enemy for ${percent(power)} of a hit.`, (power) => [{ kind: "damage", aim: "foes", power }]),
  docs: bonus("family", "Heal", "third", [0.025, 0.05], (share) => `Every third hit heals it ${percent(share)} of its HP.`, (share) => [{ kind: "heal", aim: "self", share }]),
};

/** Every topic's bonus. */
export const TOPIC: SetBonus = bonus("topic", "Faster", "start", [0.07, 0.09], (by) => `Acts ${percent(by)} more often.`, (by) => [{ kind: "stat", aim: "self", stat: "haste", by }]);

const FAMILY_NAMES: ReadonlySet<string> = new Set(CARD_TYPES);

const BY_FAMILY = new Map<string, SetBonus>(Object.entries(FAMILIES));

/** The bonus a set gives: its family's, or the topic bonus. */
export const bonusOf = (set: string): SetBonus => BY_FAMILY.get(set) ?? TOPIC;

/** A topic is lower-case, once, and never a language or a family's name: languages count only through their family. */
function topicsOf(topics: string[], language: string | null): string[] {
  const own = language?.toLowerCase();
  const kept = [...new Set(topics.map((topic) => topic.toLowerCase()))].filter((topic) => topic !== own && !LANGUAGE_NAMES.has(topic) && !FAMILY_NAMES.has(topic));
  const common = kept.filter((topic) => (COMMON_TOPICS as readonly string[]).includes(topic));
  return [...common, ...kept.filter((topic) => !common.includes(topic))].slice(0, TOPICS_PER_CARD);
}

/** A repo's sets, as its card keeps them: its family, then up to two topics. */
export function setsFor(language: string | null, topics: string[]): string[] {
  return [typeOf(language), ...topicsOf(topics, language)];
}

/**
 * A card's sets: its family (its type), then its topics. A card made before families
 * (a saved team link, a run already going) listed its language first: it drops out
 * here, so an old card plays as a new one. A language GitHub knows but the game doesn't
 * stays a topic on such a card.
 */
export function setsOf(card: Pick<Card, "type" | "sets">): string[] {
  return [card.type, ...topicsOf(card.sets.filter((set) => set !== card.type), null)];
}

/** A set as it stands on a team: which units share it, the tier they reach (none below 2) and the count the next tier needs. */
export type TeamSet = { set: string; bonus: SetBonus; members: number[]; tier: Tier | undefined; next: Tier | undefined };

/** Every set on the team, the most shared first. */
export function teamSets(team: Pick<Snapshot, "units">): TeamSet[] {
  const members = new Map<string, number[]>();
  team.units.forEach((unit, index) => setsOf(unit.card).forEach((set) => members.set(set, [...(members.get(set) ?? []), index])));
  return [...members]
    .map(([set, indexes]): TeamSet => {
      const { tiers } = bonusOf(set);
      const reached = tiers.filter((tier) => indexes.length >= tier.at);
      return { set, bonus: bonusOf(set), members: indexes, tier: reached.at(-1), next: tiers.find((tier) => indexes.length < tier.at) };
    })
    .sort((a, b) => b.members.length - a.members.length);
}

/**
 * The sets the checks list shows: every family on the team (each is live or one card
 * from it), and the topics two or more cards share. A topic on one card is not a check.
 * Live sets first, then the fullest.
 */
export function checksOf(team: Pick<Snapshot, "units">): TeamSet[] {
  const shown = teamSets(team).filter((entry) => {
    switch (entry.bonus.kind) {
      case "family":
        return true;
      case "topic":
        return entry.members.length >= TIERS[0];
    }
  });
  return shown.sort((a, b) => Number(Boolean(b.tier)) - Number(Boolean(a.tier)) || b.members.length - a.members.length);
}

/** The set hooks each unit carries: `setHooks(team)[i]` belongs to `team.units[i]`. */
export function setHooks(team: Snapshot): Hook[][] {
  const hooks: Hook[][] = team.units.map(() => []);
  for (const { set, members, tier } of teamSets(team)) {
    if (!tier) continue;
    for (const index of members) hooks[index].push({ source: `set:${set}`, on: tier.on, effects: tier.effects });
  }
  return hooks;
}
