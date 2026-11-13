import { useSyncExternalStore } from "react";

/**
 * The tick a fight on the board has played to. The board sets it each frame; a panel
 * that follows the fight (fight-inspect.tsx) reads it, so only that panel draws again
 * as the fight plays, not the whole Play screen.
 */
export class FightClock {
  private tick = 0;
  private listeners = new Set<() => void>();

  read = (): number => this.tick;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(tick: number) {
    if (tick === this.tick) return;
    this.tick = tick;
    for (const listener of this.listeners) listener();
  }
}

export const useFightTick = (clock: FightClock): number => useSyncExternalStore(clock.subscribe, clock.read);
