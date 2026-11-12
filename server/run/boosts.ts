import { seededRandom } from "../battle.ts";
import type { Effect, Gate, Hook, Trigger } from "./hooks.ts";
import type { Placed, Snapshot } from "./types.ts";

// Boosts: one picked from three after rounds 2 and 4 of a run, kept for the rest of it.
// A boost names which of the team's cards it reaches and what they carry.

/**
 * Which cards a boost reaches:
 * - `first`: the team's first card (`units[0]`, the ace).
 * - `front` / `back`: the cards standing in row 0 / row 1 when the fight starts.
 * - `all`: every card.
 */
export type Who = "first" | "front" | "back" | "all";

export type Boost = { id: string; name: string; text: string; who: Who; on: Trigger; when?: Gate; once?: boolean; effects: Effect[] };

/** Rounds after which a run offers a boost. */
export const BOOST_ROUNDS = [2, 4] as const;
export const OFFER_SIZE = 3;

export const BOOSTS: Boost[] = [
  { id: "head-start", name: "Head start", text: "The first card starts with a shield of 30% of its HP.", who: "first", on: "start", effects: [{ kind: "shield", aim: "self", share: 0.3 }] },
  { id: "critical-mass", name: "Critical mass", text: "Critical hits deal 2x.", who: "all", on: "start", effects: [{ kind: "stat", aim: "self", stat: "critical", by: 0.5 }] },
  { id: "last-stand", name: "Last stand", text: "The last card standing gains 30% attack.", who: "all", on: "ally-faint", when: "alone", once: true, effects: [{ kind: "stat", aim: "self", stat: "attack", by: 0.3 }] },
  { id: "lucky-streak", name: "Lucky streak", text: "Critical hits land twice as often.", who: "all", on: "start", effects: [{ kind: "stat", aim: "self", stat: "luck", by: 0.0625 }] },
  { id: "front-line", name: "Front line", text: "The front row starts with a shield of 15% of its HP.", who: "front", on: "start", effects: [{ kind: "shield", aim: "self", share: 0.15 }] },
  { id: "back-line", name: "Back line", text: "The back row hits 15% harder.", who: "back", on: "start", effects: [{ kind: "stat", aim: "self", stat: "attack", by: 0.15 }] },
  { id: "warm-start", name: "Warm start", text: "Every card is 15% faster.", who: "all", on: "start", effects: [{ kind: "stat", aim: "self", stat: "speed", by: 0.15 }] },
  { id: "thick-skin", name: "Thick skin", text: "The front row has 15% more guard.", who: "front", on: "start", effects: [{ kind: "stat", aim: "self", stat: "guard", by: 0.15 }] },
  { id: "avenge", name: "Avenge", text: "When a card faints, its teammates gain 10% attack.", who: "all", on: "ally-faint", effects: [{ kind: "stat", aim: "self", stat: "attack", by: 0.1 }] },
  { id: "regroup", name: "Regroup", text: "When a card faints, its teammates heal 10%.", who: "all", on: "ally-faint", effects: [{ kind: "heal", aim: "self", share: 0.1 }] },
  { id: "lifesteal", name: "Lifesteal", text: "Each hit heals the hitter 2% of its HP.", who: "all", on: "hit", effects: [{ kind: "heal", aim: "self", share: 0.02 }] },
  { id: "thorns", name: "Thorns", text: "A card that is hit hits back for a little.", who: "all", on: "hurt", effects: [{ kind: "damage", aim: "foe", power: 0.15 }] },
  { id: "combo", name: "Combo", text: "Every third hit lands a second hit.", who: "all", on: "third", effects: [{ kind: "damage", aim: "foe", power: 0.6 }] },
  { id: "opening-volley", name: "Opening volley", text: "The first card opens with a hit on every enemy.", who: "first", on: "start", effects: [{ kind: "damage", aim: "foes", power: 0.4 }] },
  { id: "second-wind", name: "Second wind", text: "A card under half HP heals 25%, once.", who: "all", on: "hurt", when: "low", once: true, effects: [{ kind: "heal", aim: "self", share: 0.25 }] },
  { id: "tar-pit", name: "Tar pit", text: "Every third hit slows the target by 10%.", who: "all", on: "third", effects: [{ kind: "stat", aim: "foe", stat: "speed", by: -0.1 }] },
  { id: "throttle", name: "Throttle", text: "The first card starts by leaving the nearest enemy rate limited.", who: "first", on: "start", effects: [{ kind: "condition", aim: "foe", condition: "rate-limited" }] },
  { id: "deprecation-notice", name: "Deprecation notice", text: "The first card's hits leave the target deprecated.", who: "first", on: "hit", effects: [{ kind: "condition", aim: "foe", condition: "deprecated" }] },
];

const BY_ID = new Map(BOOSTS.map((boost) => [boost.id, boost]));

export const boostById = (id: string): Boost | undefined => BY_ID.get(id);

function reaches(who: Who, placed: Placed, index: number): boolean {
  switch (who) {
    case "first":
      return index === 0;
    case "front":
      return placed.row === 0;
    case "back":
      return placed.row === 1;
    case "all":
      return true;
  }
}

/** The boost hooks each unit carries: `boostHooks(team)[i]` belongs to `team.units[i]`. Unknown ids are skipped. */
export function boostHooks(team: Snapshot): Hook[][] {
  const boosts = team.boosts.map((id) => BY_ID.get(id)).filter((boost): boost is Boost => boost !== undefined);
  return team.units.map((placed, index) =>
    boosts.filter((boost) => reaches(boost.who, placed, index)).map((boost) => ({ source: `boost:${boost.id}`, on: boost.on, when: boost.when, once: boost.once, effects: boost.effects })),
  );
}

/** Three boosts the team does not have yet, the same three for the same seed. */
export function boostOffer(seed: string, taken: string[]): string[] {
  const random = seededRandom(`boosts|${seed}`);
  const pool = BOOSTS.map((boost) => boost.id).filter((id) => !taken.includes(id));
  const offer: string[] = [];
  while (offer.length < OFFER_SIZE && pool.length > 0) offer.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return offer;
}
