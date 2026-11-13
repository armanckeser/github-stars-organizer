import type { Aim, Effect } from "../../../../../server/run/hooks";
import { effectsOf } from "../../../../../server/run/names";
import { playCastRing } from "./cast";
import { playCondition } from "./condition";
import { playDamage } from "./damage";
import { playHeal } from "./heal";
import { playShield } from "./shield";
import { playStat } from "./stat";
import type { Cast, EffectActor, EffectPlayer, EffectStage } from "./stage";

export type { EffectActor, EffectStage } from "./stage";

/** One player per effect kind: every ability, set bonus and boost is drawn by these. */
const PLAYERS: { [Kind in Effect["kind"]]: EffectPlayer<Kind> } = {
  damage: playDamage,
  shield: playShield,
  heal: playHeal,
  stat: playStat,
  condition: playCondition,
};

const ON_FOES: Record<Aim, boolean> = { self: false, foe: true, "weakest-foe": true, foes: true, "weakest-ally": false, allies: false };

/**
 * Plays what the ability, set bonus or boost `source` just did. The fight's `ability`
 * event names who the first effect reached (`reached` turns those indexes into creatures
 * on the side asked for). A later effect aimed at the caster reaches the caster; one aimed
 * at the same side as the first reaches the same creatures; any other reaches no one.
 */
export function playFired(stage: EffectStage, source: string, caster: EffectActor, reached: (onFoes: boolean) => EffectActor[]) {
  playCastRing(stage, caster);
  const effects = effectsOf(source);
  const first = effects[0];
  if (!first) return;
  const firstOnFoes = ON_FOES[first.aim];
  const firstReached = reached(firstOnFoes);
  for (const effect of effects) {
    const targets = effect.aim === "self" ? [caster] : ON_FOES[effect.aim] === firstOnFoes ? firstReached : [];
    play(stage, { caster, targets: targets.filter((target) => !target.out), effect, source });
  }
}

function play(stage: EffectStage, cast: Cast) {
  // The registry is keyed by the effect's own kind, so the cast always matches its player.
  (PLAYERS[cast.effect.kind] as EffectPlayer)(stage, cast);
}

/** The key a shield's look is attached under: board.ts takes it off when the shield is gone. */
export const SHIELD_KEY = "shield";
