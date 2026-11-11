import { seededRandom } from "../battle.ts";
import { cellOf, type Card, type Fight, type FightEvent, type Side } from "./types.ts";

// The fight with nothing but walking and hits: every card heads for the nearest
// enemy and hits once in reach, all at the same time. Abilities, sets and boosts
// come with the full engine (Tasks 1 and 2 in docs/AGENT-TASKS.md), which takes
// this file's place.

const MAX_TICKS = 450;
const STEP_TICKS = 4;
const CRITICAL_ODDS = 0.0625;
const CRITICAL = 1.5;

type Unit = { side: Side; index: number; card: Card; x: number; y: number; hp: number; next: number };

/** Ticks between a card's hits: a faster card waits less. */
const period = (card: Card) => Math.max(5, Math.min(16, Math.round(1200 / (60 + card.speed))));
const apart = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export const plainFight: Fight = (a, b, seed) => {
  const random = seededRandom(seed);
  const units: Unit[] = ([a, b] as const).flatMap((snapshot, side) =>
    snapshot.units.map((placed, index) => ({ side: side as Side, index, card: placed.card, ...cellOf(side as Side, placed), hp: placed.card.hp, next: 3 + Math.floor(random() * 4) })),
  );
  // The faster card acts first within a tick.
  const order = [...units].sort((x, y) => y.card.speed - x.card.speed || x.side - y.side || x.index - y.index);
  const alive = (side: Side) => units.filter((unit) => unit.side === side && unit.hp > 0);
  const events: FightEvent[] = [];

  let t = 0;
  for (; t < MAX_TICKS && alive(0).length > 0 && alive(1).length > 0; t++) {
    for (const unit of order) {
      if (unit.hp <= 0 || t < unit.next) continue;
      const enemies = alive(unit.side === 0 ? 1 : 0);
      if (enemies.length === 0) break;
      const target = enemies.reduce((best, enemy) => (apart(unit, enemy) < apart(unit, best) || (apart(unit, enemy) === apart(unit, best) && enemy.hp < best.hp) ? enemy : best));
      if (apart(unit, target) <= unit.card.range) {
        const critical = random() < CRITICAL_ODDS;
        const base = (unit.card.attack * unit.card.attack) / (unit.card.attack + target.card.guard);
        const damage = Math.max(1, Math.round(base * (critical ? CRITICAL : 1) * (0.85 + random() * 0.3)));
        target.hp = Math.max(0, target.hp - damage);
        events.push({ t, kind: "hit", side: unit.side, unit: unit.index, target: target.index, damage, critical });
        if (target.hp === 0) events.push({ t, kind: "faint", side: target.side, unit: target.index });
        unit.next = t + period(unit.card);
        continue;
      }
      // One cell closer, into a free cell.
      let best: { x: number; y: number } | null = null;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = { x: unit.x + dx, y: unit.y + dy };
          if (cell.x < 0 || cell.x > 3 || cell.y < 0 || cell.y > 3) continue;
          if (units.some((other) => other.hp > 0 && other.x === cell.x && other.y === cell.y)) continue;
          const score = apart(cell, target) * 10 + Math.abs(cell.x - target.x) + Math.abs(cell.y - target.y);
          const bestScore = best ? apart(best, target) * 10 + Math.abs(best.x - target.x) + Math.abs(best.y - target.y) : apart(unit, target) * 10 + Math.abs(unit.x - target.x) + Math.abs(unit.y - target.y);
          if (score < bestScore) best = cell;
        }
      }
      if (best) {
        unit.x = best.x;
        unit.y = best.y;
        events.push({ t, kind: "move", side: unit.side, unit: unit.index, x: best.x, y: best.y });
        unit.next = t + STEP_TICKS;
      } else unit.next = t + 2;
    }
  }

  const left = (side: Side) => alive(side).reduce((sum, unit) => sum + unit.hp, 0);
  const standing = [alive(0).length > 0, alive(1).length > 0];
  const winner: Side | null = standing[0] !== standing[1] ? (standing[0] ? 0 : 1) : left(0) === left(1) ? null : left(0) > left(1) ? 0 : 1;
  events.push({ t, kind: "end", winner });
  return events;
};
