import { describe, expect, it } from "vitest";
import type { FightEvent } from "../../../server/run/types";
import { momentAt } from "./fight-moment";

// Regression guarded: the creature panel shows HP, shield and condition at the tick the
// board has played to. Reading events past that tick shows a hit before it lands; dropping
// a kind (a heal, a shield worn down, a condition worn off) shows numbers the bar doesn't.

const FULL: [number[], number[]] = [[120, 90], [100]];

const EVENTS: FightEvent[] = [
  { t: 3, kind: "shield", side: 0, unit: 0, shield: 26 },
  { t: 5, kind: "hit", side: 1, unit: 0, target: 0, damage: 10, critical: false },
  { t: 5, kind: "shield", side: 0, unit: 0, shield: 16 },
  { t: 8, kind: "condition", side: 1, unit: 0, condition: "rate-limited", on: true },
  { t: 12, kind: "hit", side: 0, unit: 1, target: 0, damage: 40, critical: true },
  { t: 20, kind: "hp", side: 1, unit: 0, change: 15, cause: "hotfix" },
  { t: 38, kind: "condition", side: 1, unit: 0, condition: "rate-limited", on: false },
  { t: 40, kind: "hit", side: 1, unit: 0, target: 1, damage: 95, critical: false },
  { t: 40, kind: "faint", side: 0, unit: 1 },
];

describe("momentAt", () => {
  it("starts every creature at full HP, with nothing on it", () => {
    expect(momentAt(EVENTS, 0, FULL)).toEqual([
      [{ hp: 120, shield: 0, condition: null, fainted: false }, { hp: 90, shield: 0, condition: null, fainted: false }],
      [{ hp: 100, shield: 0, condition: null, fainted: false }],
    ]);
  });

  it("counts the events up to and including the tick, and none after", () => {
    const [[shielded], [limited]] = momentAt(EVENTS, 12, FULL);
    expect(shielded).toEqual({ hp: 110, shield: 16, condition: null, fainted: false });
    expect(limited).toEqual({ hp: 60, shield: 0, condition: { name: "rate-limited", ticksLeft: 26 }, fainted: false });
    expect(momentAt(EVENTS, 11, FULL)[1][0].hp).toBe(100);
  });

  it("heals, never above full HP", () => {
    expect(momentAt(EVENTS, 20, FULL)[1][0].hp).toBe(75);
    const overheal: FightEvent[] = [{ t: 1, kind: "hp", side: 1, unit: 0, change: 50, cause: "hotfix" }];
    expect(momentAt(overheal, 1, FULL)[1][0].hp).toBe(100);
  });

  it("wears a condition off at its off event", () => {
    expect(momentAt(EVENTS, 37, FULL)[1][0].condition).toEqual({ name: "rate-limited", ticksLeft: 1 });
    expect(momentAt(EVENTS, 38, FULL)[1][0].condition).toBeNull();
  });

  it("faints a creature at 0 HP, with no shield or condition left", () => {
    expect(momentAt(EVENTS, 40, FULL)[0][1]).toEqual({ hp: 0, shield: 0, condition: null, fainted: true });
  });

  it("ignores a condition id it doesn't know", () => {
    const unknown: FightEvent[] = [{ t: 1, kind: "condition", side: 0, unit: 0, condition: "paintball", on: true }];
    expect(momentAt(unknown, 1, FULL)[0][0].condition).toBeNull();
  });
});
