import { describe, expect, it } from "vitest";
import { benchToBoard, boardToBench, cardsOf, emptyBench, swapBench, toBench, without, type Roster } from "./roster.ts";
import type { RunFighter } from "./rules.ts";
import { card } from "./testbed.ts";

const fighter = (name: string) => ({ fullName: `greendale/${name}`, card: card(`greendale/${name}`) }) as RunFighter;
const [troy, abed, annie, britta] = ["troy", "abed", "annie", "britta"].map(fighter);
const names = (roster: Roster | null) => roster && { board: roster.board.map((unit) => `${unit.fighter.fullName.slice(10)}@${unit.col},${unit.row}`), bench: roster.bench.map((one) => one?.fullName.slice(10) ?? null) };
const study = (): Roster => ({ board: [{ fighter: troy, col: 1, row: 0 }], bench: [abed, null, annie, null, null] });

describe("toBench", () => {
  // Regression guarded: a bought card must wait on the bench, never land on the board past the limit.
  it("puts a bought card in the first free slot", () => {
    expect(names(toBench(study(), britta))).toEqual({ board: ["troy@1,0"], bench: ["abed", "britta", "annie", null, null] });
  });

  it("refuses a card when the bench is full", () => {
    expect(toBench({ board: [], bench: [troy, abed, annie, britta, fighter("pierce")] }, fighter("shirley"))).toBeNull();
  });
});

describe("benchToBoard", () => {
  // Regression guarded: the team limit counts the board only, and a swap must not grow the board.
  it("places a bench card on a free cell while the board has room", () => {
    expect(names(benchToBoard(study(), 0, 2, 1, 2))).toEqual({ board: ["troy@1,0", "abed@2,1"], bench: [null, null, "annie", null, null] });
  });

  it("refuses a free cell when the board is at its limit", () => {
    expect(benchToBoard(study(), 0, 2, 1, 1)).toBeNull();
  });

  it("trades places with the card on a taken cell, even at the limit", () => {
    expect(names(benchToBoard(study(), 2, 1, 0, 1))).toEqual({ board: ["annie@1,0"], bench: ["abed", null, "troy", null, null] });
  });

  it.each([[1, 0, 0], [0, 4, 0], [0, 0, 2]])("refuses bench slot %i to cell %i,%i", (slot, col, row) => {
    expect(benchToBoard(study(), slot, col, row, 5)).toBeNull();
  });
});

describe("boardToBench", () => {
  it("moves a board card to an empty slot", () => {
    expect(names(boardToBench(study(), troy.fullName, 1))).toEqual({ board: [], bench: ["abed", "troy", "annie", null, null] });
  });

  it("swaps with the card waiting in the slot, which takes the cell", () => {
    expect(names(boardToBench(study(), troy.fullName, 0))).toEqual({ board: ["abed@1,0"], bench: ["troy", null, "annie", null, null] });
  });

  it("refuses a card that is not on the board", () => {
    expect(boardToBench(study(), abed.fullName, 1)).toBeNull();
  });
});

describe("swapBench and without", () => {
  it("swaps two bench slots", () => {
    expect(names(swapBench(study(), 0, 2))?.bench).toEqual(["annie", null, "abed", null, null]);
  });

  it("refuses to move an empty slot", () => {
    expect(swapBench(study(), 1, 3)).toBeNull();
  });

  it("takes a sold card off the board or the bench", () => {
    expect(names(without(study(), troy.fullName))).toEqual({ board: [], bench: ["abed", null, "annie", null, null] });
    expect(names(without(study(), annie.fullName))).toEqual({ board: ["troy@1,0"], bench: ["abed", null, null, null, null] });
  });

  it("refuses a card the player does not hold", () => {
    expect(without(study(), britta.fullName)).toBeNull();
  });

  it("lists every card held, the board first", () => {
    expect(cardsOf(study()).map((one) => one.fullName)).toEqual([troy.fullName, abed.fullName, annie.fullName]);
    expect(emptyBench()).toEqual([null, null, null, null, null]);
  });
});
