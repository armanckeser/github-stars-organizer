import { describe, expect, it } from "vitest";
import type { Fighter } from "../battle.ts";
import { defaultCharacter } from "../character.ts";
import type { RunFighter } from "./rules.ts";
import { savedSnapshotAt, savedUnitsAt, type SavedTeam } from "./saved-team.ts";

// A run started from a share link meets the saved team as it stood at each round.

const fighter = (fullName: string): RunFighter => {
  const base = { fullName, type: "web", hp: 100, attack: 40, defense: 30, speed: 20 } as Fighter;
  return { ...base, card: { fullName, type: "web", sets: [], rarity: 0, hp: 100, attack: 40, guard: 30, speed: 20, range: 1, ability: "none", shiny: false } };
};

const saved: SavedTeam = {
  v: 1,
  login: "greendale",
  avatarUrl: null,
  character: { ...defaultCharacter("greendale"), level: 1 },
  day: "2026-11-11",
  wins: 0,
  losses: 3,
  fighters: [fighter("greendale/troy"), fighter("greendale/abed"), fighter("greendale/annie")],
  rounds: [
    { units: [{ fighter: 0, col: 1, row: 0 }], boosts: [] },
    { units: [{ fighter: 0, col: 1, row: 0 }, { fighter: 1, col: 2, row: 1 }], boosts: [] },
    { units: [{ fighter: 2, col: 0, row: 0 }, { fighter: 1, col: 2, row: 1 }], boosts: ["head-start"] },
  ],
};

describe("saved team by round", () => {
  it.each([
    [1, ["greendale/troy"], []],
    [2, ["greendale/troy", "greendale/abed"], []],
    [3, ["greendale/annie", "greendale/abed"], ["head-start"]],
  ])("round %i meets the team as it stood that round", (round, names, boosts) => {
    const snapshot = savedSnapshotAt(saved, round);
    expect(snapshot.units.map((unit) => unit.card.fullName)).toEqual(names);
    expect(snapshot.boosts).toEqual(boosts);
    expect(snapshot.round).toBe(round);
  });

  it("keeps the team as it ended for rounds past the saved run's last", () => {
    // Regression guarded: a challenger's 7th round, past a 3-round saved run, meeting an empty team.
    expect(savedUnitsAt(saved, 7).map((unit) => [unit.fighter.fullName, unit.col, unit.row])).toEqual([["greendale/annie", 0, 0], ["greendale/abed", 2, 1]]);
  });
});
