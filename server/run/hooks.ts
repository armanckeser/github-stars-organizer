import type { Side, Snapshot } from "./types.ts";

// What abilities, set bonuses and boosts are made of. Each one is data: the moment it
// fires, who it reaches and what it does. The fight engine (fight.ts) reads them
// through `Rules` and does the rest, so a new ability is a new row, not engine code.

/**
 * When a hook fires, for the card that carries it:
 * - `start`: once, as the fight begins.
 * - `hit`: after each of the card's own hits lands.
 * - `hurt`: after the card takes a hit and is still standing.
 * - `ally-faint`: when a teammate faints.
 * - `third`: after every third hit the card makes.
 */
export type Trigger = "start" | "hit" | "hurt" | "ally-faint" | "third";

/**
 * Who an effect reaches, seen from the card that carries the hook:
 * - `self`: the card.
 * - `foe`: the enemy of the moment: the one hit (`hit`, `third`), the attacker
 *   (`hurt`), else the nearest enemy.
 * - `weakest-foe`: the enemy with the least HP left.
 * - `foes`: every enemy standing.
 * - `weakest-ally`: the teammate (the card included) with the smallest share of HP left.
 * - `allies`: every teammate standing, the card included.
 */
export type Aim = "self" | "foe" | "weakest-foe" | "foes" | "weakest-ally" | "allies";

/**
 * A number a `stat` effect changes. `attack`, `guard` and `speed` change by a share
 * of the card's own number (0.3 is 30% more). `critical` is what a critical hit
 * multiplies damage by (1.5 to start) and `luck` the odds of one (0.0625 to start):
 * those two change by the amount itself. `haste` cuts the wait between actions
 * directly (0.1 acts 10% more often), where `speed` is softened like the card's own
 * speed, so a set's "acts 10% faster" is what it says.
 */
export type Stat = "attack" | "guard" | "speed" | "critical" | "luck" | "haste";

/**
 * One at a time per card, for CONDITION_TICKS (3 seconds):
 * - `merge-conflict`: one hit in three (MERGE_CONFLICT_ODDS) lands on the card itself.
 * - `rate-limited`: the card waits half as long again (RATE_LIMITED) between actions.
 * - `deprecated`: the card loses a thirtieth of its full HP each second (deprecatedLoss).
 * - `flaky`: one hit in four (FLAKY_ODDS) misses.
 *
 * The engine (fight.ts) and the words the screen shows (names.ts `conditionLine`) both
 * read the numbers below, so a change to one changes what the player is told.
 */
export const CONDITIONS = ["merge-conflict", "rate-limited", "deprecated", "flaky"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_TICKS = 30;
export const MERGE_CONFLICT_ODDS = 1 / 3;
/** A rate-limited card waits this many times as long between actions. */
export const RATE_LIMITED = 1.5;
/** A deprecated card loses this share of its full HP every DEPRECATED_EVERY ticks. */
export const DEPRECATED_SHARE = 1 / 30;
export const DEPRECATED_EVERY = 10;
export const FLAKY_ODDS = 1 / 4;

/** The HP a deprecated card with `fullHp` loses each time the condition bites. */
export const deprecatedLoss = (fullHp: number) => Math.max(1, Math.round(fullHp * DEPRECATED_SHARE));

export type Effect =
  /** A hit of `power` times the card's normal hit, never critical. */
  | { kind: "damage"; aim: Aim; power: number }
  /** Takes the next `share` of the target's full HP of damage instead of its HP. */
  | { kind: "shield"; aim: Aim; share: number }
  | { kind: "stat"; aim: Aim; stat: Stat; by: number }
  /** Gives back `share` of the target's full HP, never above full. */
  | { kind: "heal"; aim: Aim; share: number }
  /** Leaves a condition on the target, unless it already has one. */
  | { kind: "condition"; aim: Aim; condition: Condition };

/**
 * - `alone`: no teammate is standing.
 * - `low`: the card has under half its HP left.
 */
export type Gate = "alone" | "low";

export type Hook = {
  /** The ability, set or boost id, shown in the `ability` event. */
  source: string;
  on: Trigger;
  effects: Effect[];
  /** Fires only while this holds. */
  when?: Gate;
  /** Fires once a fight at most. */
  once?: boolean;
};

/**
 * Which hooks each card carries: `hooks(snapshot, side)[i]` belongs to
 * `snapshot.units[i]`. The engine asks once per side at the start of a fight.
 */
export type Rules = { hooks: (snapshot: Snapshot, side: Side) => Hook[][] };

export const NO_RULES: Rules = { hooks: (snapshot) => snapshot.units.map(() => []) };
