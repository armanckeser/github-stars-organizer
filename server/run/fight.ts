import { seededRandom } from "../battle.ts";
import { CONDITION_TICKS, DEPRECATED_EVERY, deprecatedLoss, FLAKY_ODDS, MERGE_CONFLICT_ODDS, RATE_LIMITED, type Aim, type Condition, type Effect, type Gate, type Hook, type Rules, type Trigger } from "./hooks.ts";
import { GAME_RULES } from "./game-rules.ts";
import { EVEN } from "./stats.ts";
import { cellOf, COLS, ROWS, type Card, type Fight, type FightEvent, type Side } from "./types.ts";

// The fight: every card heads for the nearest enemy and hits once in reach, all at the
// same time. Every card that is ready in a tick acts in that tick, in a seeded order,
// and a card knocked out earlier in the same tick still lands its hit, so neither side
// gains from going first. Abilities, set bonuses and boosts are hooks (hooks.ts) the
// engine fires at their moments.

/** A fight stops after 45 seconds. */
export const MAX_TICKS = 450;
export const CRITICAL_ODDS = 0.0625;
export const CRITICAL = 1.5;
/** A hit between two cards with the same attack and guard, before the dice. */
const DAMAGE = 12;
/** Ticks between an even card's hits. */
const PERIOD = 10;
const MIN_PERIOD = 4;
const MAX_PERIOD = 20;
/** How much speed shortens the wait between hits: the speed ratio to this power. */
const SPEED_EDGE = 0.25;
/** How much attack against guard changes a hit: their ratio to this power. */
const GUARD_EDGE = 0.4;
/**
 * Added to attack, guard and speed before two of them are compared, so a lead in one
 * counts for less. With the small edges above it keeps a rarer card only a little
 * stronger: the balance test (balance.test.ts) holds the team with more stars to 45%
 * to 60% of wins.
 */
const CUSHION = 120;
const STEP_TICKS = 4;
const BLOCKED_TICKS = 2;
const FIRST_ACTION = 3;
const FIRST_ACTION_SPREAD = 8;
/** A hit lands for 70% to 130% of its damage. */
const VARIANCE = 0.6;
const THIRD = 3;

type Scaled = "attack" | "guard" | "speed";

type Unit = {
  side: Side;
  index: number;
  card: Card;
  x: number;
  y: number;
  hp: number;
  /** Damage the card's shield takes before its HP does. */
  shield: number;
  /** The tick of the card's next action. */
  next: number;
  hits: number;
  boost: Record<Scaled, number>;
  critical: number;
  luck: number;
  hooks: Hook[];
  spent: Set<Hook>;
  /** The card's condition, who left it, when it wears off and when it next bites. */
  condition: { name: Condition; from: Unit; until: number; bite: number } | null;
};

type Arena = { units: Unit[]; events: FightEvent[]; random: () => number; t: number };

const DIRECTIONS = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ dx, dy }))).filter(({ dx, dy }) => dx !== 0 || dy !== 0);

const otherSide = (side: Side): Side => (side === 0 ? 1 : 0);
const apart = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const standing = (arena: Arena, side: Side) => arena.units.filter((unit) => unit.side === side && unit.hp > 0);
const scaled = (unit: Unit, stat: Scaled) => unit.card[stat] * Math.max(0.1, unit.boost[stat]);

/** Ticks between a card's hits: a faster card waits less. */
function periodOf(unit: Unit): number {
  const limited = unit.condition?.name === "rate-limited" ? RATE_LIMITED : 1;
  const wait = limited * PERIOD * ((EVEN + CUSHION) / (scaled(unit, "speed") + CUSHION)) ** SPEED_EDGE;
  return Math.max(MIN_PERIOD, Math.min(MAX_PERIOD, Math.round(wait)));
}

/** A hit's damage before the critical and the dice: attack against guard. */
const baseHit = (attacker: Unit, target: Unit) => DAMAGE * ((scaled(attacker, "attack") + CUSHION) / (scaled(target, "guard") + CUSHION)) ** GUARD_EDGE;

/** The closest of `units`, then the one with the least HP, then the first placed. */
function nearest(from: { x: number; y: number }, units: Unit[]): Unit | undefined {
  return units.reduce<Unit | undefined>((best, unit) => {
    if (!best) return unit;
    const closer = apart(from, unit) - apart(from, best) || unit.hp - best.hp || unit.index - best.index;
    return closer < 0 ? unit : best;
  }, undefined);
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function gateHolds(arena: Arena, unit: Unit, gate: Gate | undefined): boolean {
  switch (gate) {
    case undefined:
      return true;
    case "alone":
      return standing(arena, unit.side).length === 1;
    case "low":
      return unit.hp < unit.card.hp / 2;
  }
}

function reach(arena: Arena, unit: Unit, aim: Aim, foe: Unit | undefined): Unit[] {
  const enemies = standing(arena, otherSide(unit.side));
  const allies = standing(arena, unit.side);
  const least = (units: Unit[], by: (unit: Unit) => number) => units.reduce<Unit[]>((best, next) => (best.length === 0 || by(next) < by(best[0]) ? [next] : best), []);
  switch (aim) {
    case "self":
      return [unit];
    case "foe": {
      const fallback = nearest(unit, enemies);
      return foe && foe.hp > 0 ? [foe] : fallback ? [fallback] : [];
    }
    case "weakest-foe":
      return least(enemies, (enemy) => enemy.hp);
    case "foes":
      return enemies;
    case "weakest-ally":
      return least(allies, (ally) => ally.hp / ally.card.hp);
    case "allies":
      return allies;
  }
}


/** Takes `damage` off the target, shield first, and knocks it out at zero. */
function wound(arena: Arena, attacker: Unit, target: Unit, damage: number, critical: boolean) {
  const absorbed = Math.min(target.shield, damage);
  target.shield -= absorbed;
  if (absorbed > 0) arena.events.push({ t: arena.t, kind: "shield", side: target.side, unit: target.index, shield: target.shield });
  target.hp = Math.max(0, target.hp - (damage - absorbed));
  arena.events.push({ t: arena.t, kind: "hit", side: attacker.side, unit: attacker.index, target: target.index, damage: damage - absorbed, critical });
  if (target.hp === 0) faint(arena, target);
}

function faint(arena: Arena, unit: Unit) {
  arena.events.push({ t: arena.t, kind: "faint", side: unit.side, unit: unit.index });
  for (const mate of standing(arena, unit.side)) fire(arena, mate, "ally-faint", undefined);
}

function affect(arena: Arena, unit: Unit, effect: Effect, target: Unit, source: string) {
  switch (effect.kind) {
    case "damage":
      if (target.hp > 0) wound(arena, unit, target, Math.max(1, Math.round(baseHit(unit, target) * effect.power)), false);
      return;
    case "shield":
      target.shield += Math.round(target.card.hp * effect.share);
      arena.events.push({ t: arena.t, kind: "shield", side: target.side, unit: target.index, shield: target.shield });
      return;
    case "stat":
      if (effect.stat === "critical") target.critical += effect.by;
      else if (effect.stat === "luck") target.luck += effect.by;
      else target.boost[effect.stat] += effect.by;
      return;
    case "heal":
      changeHp(arena, target, Math.min(target.card.hp - target.hp, Math.round(target.card.hp * effect.share)), source);
      return;
    case "condition":
      if (target.hp <= 0 || target.condition) return;
      target.condition = { name: effect.condition, from: unit, until: arena.t + CONDITION_TICKS, bite: arena.t + DEPRECATED_EVERY };
      arena.events.push({ t: arena.t, kind: "condition", side: target.side, unit: target.index, condition: effect.condition, on: true });
      return;
  }
}

/** HP gained or lost without a hit. Nothing happens, and nothing is shown, for no change. */
function changeHp(arena: Arena, unit: Unit, change: number, cause: string) {
  if (change === 0 || unit.hp <= 0) return;
  unit.hp = Math.max(0, unit.hp + change);
  arena.events.push({ t: arena.t, kind: "hp", side: unit.side, unit: unit.index, change, cause });
  if (unit.hp === 0) faint(arena, unit);
}

/** Wears conditions off, and lets a deprecated card lose its HP. A deprecated card's loss is a hit by the card that left it. */
function wearConditions(arena: Arena) {
  for (const unit of arena.units) {
    const condition = unit.condition;
    if (!condition || unit.hp <= 0) continue;
    if (condition.name === "deprecated" && arena.t >= condition.bite) {
      condition.bite = arena.t + DEPRECATED_EVERY;
      wound(arena, condition.from, unit, deprecatedLoss(unit.card.hp), false);
    }
    if (unit.hp > 0 && arena.t >= condition.until) {
      unit.condition = null;
      arena.events.push({ t: arena.t, kind: "condition", side: unit.side, unit: unit.index, condition: condition.name, on: false });
    }
  }
}

/**
 * Runs the card's hooks for this moment. The `ability` event's targets are the units
 * the hook's first effect reaches: on the other side when that effect aims at foes,
 * else on the card's own side. Damage from a hook is a `hit` but does not fire `hit`,
 * `hurt` or `third` hooks, so two hooks can never answer each other forever.
 */
function fire(arena: Arena, unit: Unit, on: Trigger, foe: Unit | undefined) {
  if (unit.hp <= 0) return;
  for (const hook of unit.hooks) {
    if (hook.on !== on || unit.spent.has(hook) || !gateHolds(arena, unit, hook.when)) continue;
    if (hook.once) unit.spent.add(hook);
    const reached = hook.effects.map((effect) => reach(arena, unit, effect.aim, foe));
    arena.events.push({ t: arena.t, kind: "ability", side: unit.side, unit: unit.index, ability: hook.source, targets: (reached[0] ?? []).map((target) => target.index) });
    hook.effects.forEach((effect, i) => reached[i].forEach((target) => affect(arena, unit, effect, target, hook.source)));
  }
}

function strike(arena: Arena, unit: Unit, target: Unit) {
  const condition = unit.condition?.name;
  if (condition === "flaky" && arena.random() < FLAKY_ODDS) {
    unit.next = arena.t + periodOf(unit);
    return;
  }
  if (condition === "merge-conflict" && arena.random() < MERGE_CONFLICT_ODDS) {
    unit.next = arena.t + periodOf(unit);
    changeHp(arena, unit, -Math.max(1, Math.round(baseHit(unit, unit))), condition);
    return;
  }
  const critical = arena.random() < unit.luck;
  const damage = Math.max(1, Math.round(baseHit(unit, target) * (critical ? unit.critical : 1) * (1 - VARIANCE / 2 + arena.random() * VARIANCE)));
  wound(arena, unit, target, damage, critical);
  unit.hits++;
  unit.next = arena.t + periodOf(unit);
  fire(arena, unit, "hit", target);
  if (target.hp > 0) fire(arena, target, "hurt", unit);
  if (unit.hits % THIRD === 0) fire(arena, unit, "third", target);
}

/** One cell closer to the target, into a free cell. Side 1 looks the mirrored way, so ties break the same for both. */
function step(arena: Arena, unit: Unit, target: Unit) {
  const facing = unit.side === 0 ? 1 : -1;
  const score = (cell: { x: number; y: number }) => apart(cell, target) * 10 + Math.abs(cell.x - target.x) + Math.abs(cell.y - target.y);
  const taken = (cell: { x: number; y: number }) => arena.units.some((other) => other.hp > 0 && other.x === cell.x && other.y === cell.y);
  const cells = DIRECTIONS.map(({ dx, dy }) => ({ x: unit.x + dx * facing, y: unit.y + dy * facing })).filter((cell) => cell.x >= 0 && cell.x < COLS && cell.y >= 0 && cell.y < ROWS * 2 && !taken(cell));
  const best = cells.reduce<{ x: number; y: number } | null>((found, cell) => (score(cell) < (found ? score(found) : score(unit)) ? cell : found), null);
  if (!best) {
    unit.next = arena.t + BLOCKED_TICKS;
    return;
  }
  unit.x = best.x;
  unit.y = best.y;
  arena.events.push({ t: arena.t, kind: "move", side: unit.side, unit: unit.index, x: best.x, y: best.y });
  unit.next = arena.t + STEP_TICKS;
}

function act(arena: Arena, unit: Unit) {
  const target = nearest(unit, standing(arena, otherSide(unit.side)));
  if (!target) return;
  if (apart(unit, target) <= unit.card.range) strike(arena, unit, target);
  // A card knocked out this tick still lands its hit, but does not walk.
  else if (unit.hp > 0) step(arena, unit, target);
}

const over = (arena: Arena) => standing(arena, 0).length === 0 || standing(arena, 1).length === 0;

/** A fight under these rules. `fight` is the one the game plays. */
export function fightWith(rules: Rules): Fight {
  return (a, b, seed) => {
    const random = seededRandom(seed);
    const units = ([a, b] as const).flatMap((snapshot, s) => {
      const side = s as Side;
      const hooks = rules.hooks(snapshot, side);
      return snapshot.units.map<Unit>((placed, index) => ({
        side,
        index,
        card: placed.card,
        ...cellOf(side, placed),
        hp: placed.card.hp,
        shield: 0,
        next: FIRST_ACTION + Math.floor(random() * FIRST_ACTION_SPREAD),
        hits: 0,
        boost: { attack: 1, guard: 1, speed: 1 },
        critical: CRITICAL,
        luck: CRITICAL_ODDS,
        hooks: hooks[index] ?? [],
        spent: new Set(),
        condition: null,
      }));
    });
    const arena: Arena = { units, events: [], random, t: 0 };

    for (const unit of shuffled(units, random)) fire(arena, unit, "start", undefined);
    while (!over(arena) && arena.t < MAX_TICKS) {
      wearConditions(arena);
      if (over(arena)) break;
      const ready = units.filter((unit) => unit.hp > 0 && unit.next <= arena.t);
      for (const unit of shuffled(ready, random)) act(arena, unit);
      if (!over(arena)) arena.t++;
    }

    const left = (side: Side) => standing(arena, side).reduce((sum, unit) => sum + unit.hp, 0);
    const up = [standing(arena, 0).length > 0, standing(arena, 1).length > 0];
    const winner: Side | null = up[0] !== up[1] ? (up[0] ? 0 : 1) : left(0) === left(1) ? null : left(0) > left(1) ? 0 : 1;
    arena.events.push({ t: arena.t, kind: "end", winner });
    return arena.events;
  };
}

/** The fight the game plays: each card's ability, the team's set bonuses and its boosts. */
export const fight: Fight = fightWith(GAME_RULES);
