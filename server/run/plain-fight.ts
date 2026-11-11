import { seededRandom } from "../battle.ts";
import type { Fight, FightEvent, Side } from "./types.ts";

// The fight with nothing but hits: the front cards trade blows until one side has
// no card left. Abilities, sets and boosts come with the full engine (Task 1 and 2
// in docs/AGENT-TASKS.md), which takes this file's place.

const MAX_ACTIONS = 40;
const CRITICAL_ODDS = 0.0625;
const CRITICAL = 1.5;

export const plainFight: Fight = (a, b, seed) => {
  const random = seededRandom(seed);
  const teams = [a.cards, b.cards] as const;
  const hp = [a.cards.map((card) => card.hp), b.cards.map((card) => card.hp)];
  const front: [number, number] = [0, 0];
  const out = (side: Side) => front[side] >= teams[side].length;
  const events: FightEvent[] = [];
  for (const side of [0, 1] as Side[]) if (!out(side)) events.push({ kind: "enter", side, slot: 0 });

  let actions = 0;
  while (actions < MAX_ACTIONS && !out(0) && !out(1)) {
    const speeds = [teams[0][front[0]].speed, teams[1][front[1]].speed];
    const first: Side = speeds[0] === speeds[1] ? (random() < 0.5 ? 0 : 1) : speeds[0] > speeds[1] ? 0 : 1;
    for (const side of [first, first === 0 ? 1 : 0] as Side[]) {
      const other: Side = side === 0 ? 1 : 0;
      if (out(side) || out(other) || actions >= MAX_ACTIONS) break;
      actions++;
      const attacker = teams[side][front[side]];
      const target = front[other];
      const critical = random() < CRITICAL_ODDS;
      const base = (attacker.attack * attacker.attack) / (attacker.attack + teams[other][target].guard);
      const damage = Math.max(1, Math.round(base * (critical ? CRITICAL : 1) * (0.85 + random() * 0.3)));
      hp[other][target] = Math.max(0, hp[other][target] - damage);
      events.push({ kind: "hit", side, slot: front[side], target, damage, critical });
      if (hp[other][target] === 0) {
        events.push({ kind: "faint", side: other, slot: target });
        front[other]++;
        if (!out(other)) events.push({ kind: "enter", side: other, slot: front[other] });
        // The card that comes in waits for the next exchange.
        break;
      }
    }
  }

  const left = (side: Side) => hp[side].reduce((sum, value) => sum + value, 0);
  const winner: Side | null = out(0) !== out(1) ? (out(0) ? 1 : 0) : left(0) === left(1) ? null : left(0) > left(1) ? 0 : 1;
  events.push({ kind: "end", winner });
  return events;
};
