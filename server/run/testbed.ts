import { fight } from "./fight.ts";
import type { Effect } from "./hooks.ts";
import type { Card, FightEvent, Placed, Side, Snapshot } from "./types.ts";

// A fight set up for the ability, set and boost tests, so every trigger happens to
// side 0 within it. Side 1 opens with a hit on every enemy (the `opening-volley`
// boost), which knocks out side 0's fragile second card at once: the first card is
// hurt and has lost a teammate from the first tick. Two strong cards then wear the
// first card down past half its HP while it hits them many times.

export const card = (fullName: string, over: Partial<Card> = {}): Card => ({ fullName, type: "web", sets: [], rarity: 0, hp: 150, attack: 100, guard: 100, speed: 100, range: 1, ability: "none", shiny: false, ...over });

/** Side 0's cards: the first one up front, a fragile one beside it, one with reach behind. */
export function greendale(first: Partial<Card> = {}, sets: [string[], string[], string[]] = [[], [], []], boosts: string[] = []): Snapshot {
  const units: Placed[] = [
    { card: card("greendale/troy", { hp: 600, sets: sets[0], ...first }), col: 1, row: 0 },
    { card: card("greendale/pierce", { hp: 3, sets: sets[1] }), col: 2, row: 0 },
    { card: card("greendale/abed", { hp: 600, range: 3, sets: sets[2] }), col: 1, row: 1 },
  ];
  return { login: "greendale", round: 3, units, boosts };
}

export const cityCollege: Snapshot = {
  login: "city-college",
  round: 3,
  units: [
    { card: card("city-college/chang", { hp: 4000, attack: 160 }), col: 1, row: 0 },
    { card: card("city-college/dean", { hp: 4000, attack: 160 }), col: 2, row: 0 },
  ],
  boosts: ["opening-volley"],
};

export const trial = (team: Snapshot) => fight(team, cityCollege, "greendale");

type Fired = Extract<FightEvent, { kind: "ability" }> & { at: number };

export function firedBy(events: FightEvent[], source: string): Fired[] {
  return events.flatMap((event, at) => (event.kind === "ability" && event.ability === source ? [{ ...event, at }] : []));
}

/** The events right after `fired` that share its tick. */
const following = (events: FightEvent[], fired: Fired) => events.slice(fired.at + 1).filter((event) => event.t === fired.t);

/**
 * Why a test failed, or null when the events show what each effect does when its
 * hook fires: a hit by the card for damage, an `hp` event for a heal, a `condition`
 * event for a condition. Shields and stats change later numbers, so the fight must
 * differ from the same fight without the hook.
 */
export function missingEffect(events: FightEvent[], control: FightEvent[], source: string, effects: Effect[], side: Side = 0): string | null {
  const fired = firedBy(events, source).filter((event) => event.side === side);
  if (fired.length === 0) return `${source} never fired`;
  if (JSON.stringify(events) === JSON.stringify(control)) return `${source} changed nothing`;
  for (const effect of effects) {
    const shown = fired.some((event) => {
      const after = following(events, event);
      if (effect.kind === "damage") return after.some((next) => next.kind === "hit" && next.side === event.side && next.unit === event.unit && !next.critical);
      if (effect.kind === "heal") return events.some((next) => next.kind === "hp" && next.cause === source && next.change > 0);
      if (effect.kind === "condition") return after.some((next) => next.kind === "condition" && next.condition === effect.condition && next.on);
      return true;
    });
    if (!shown) return `${source}: no sign of its ${effect.kind}`;
  }
  return null;
}
