import { CONDITION_TICKS, CONDITIONS, type Condition } from "../../../server/run/hooks";
import type { FightEvent, Side } from "../../../server/run/types";

// A fight's creatures as they stand at one tick, read from the fight's events: what
// the panel beside the board (fight-inspect.tsx) shows while the fight plays on.

export type CreatureMoment = {
  hp: number;
  /** Damage the creature's shield takes before its HP does. 0 is no shield. */
  shield: number;
  /** The condition it wears and the ticks it has left, or null. */
  condition: { name: Condition; ticksLeft: number } | null;
  fainted: boolean;
};

type Tracked = Omit<CreatureMoment, "condition"> & { condition: { name: Condition; since: number } | null };

const otherSide = (side: Side): Side => (side === 0 ? 1 : 0);

function apply(sides: [Tracked[], Tracked[]], fullHp: [number[], number[]], event: FightEvent) {
  if (event.kind === "end" || event.kind === "move" || event.kind === "ability") return;
  if (event.kind === "hit") {
    const target = sides[otherSide(event.side)][event.target];
    if (target) target.hp = Math.max(0, target.hp - event.damage);
    return;
  }
  const creature = sides[event.side][event.unit];
  if (!creature) return;
  if (event.kind === "hp") creature.hp = Math.max(0, Math.min(fullHp[event.side][event.unit], creature.hp + event.change));
  else if (event.kind === "shield") creature.shield = event.shield;
  else if (event.kind === "faint") Object.assign(creature, { fainted: true, hp: 0, shield: 0, condition: null });
  else {
    const name = CONDITIONS.find((condition) => condition === event.condition);
    creature.condition = event.on && name ? { name, since: event.t } : null;
  }
}

/**
 * Every creature after the fight's events up to and including `tick`: the events the
 * board has played by then. `fullHp[side][unit]` is each card's HP at the start, in the
 * order of the fight's snapshots.
 */
export function momentAt(events: FightEvent[], tick: number, fullHp: [number[], number[]]): [CreatureMoment[], CreatureMoment[]] {
  const sides = fullHp.map((side) => side.map((hp): Tracked => ({ hp, shield: 0, condition: null, fainted: false }))) as [Tracked[], Tracked[]];
  for (const event of events) {
    if (event.t > tick) break;
    apply(sides, fullHp, event);
  }
  const moment = (creature: Tracked): CreatureMoment => ({
    ...creature,
    condition: creature.condition && { name: creature.condition.name, ticksLeft: creature.condition.since + CONDITION_TICKS - tick },
  });
  return [sides[0].map(moment), sides[1].map(moment)];
}
