import { describe, expect, it } from "vitest";
import { foldedCount } from "./checks-fold";

const rows = (live: number, waiting: number) => [...Array(live).fill({ live: true }), ...Array(waiting).fill({ live: false })];

describe("foldedCount", () => {
  it("shows two sets of a team with none live, so the other side's list is never blank", () => {
    // Regression guarded: the other side's list showed only live sets, so a team with 0 live read as empty.
    expect(foldedCount(rows(0, 6))).toBe(2);
  });

  it("shows every live set and the one closest to going live", () => {
    expect(foldedCount(rows(1, 4))).toBe(2);
    expect(foldedCount(rows(2, 4))).toBe(3);
  });

  it("never shows more than three rows, however many sets a full board makes", () => {
    // Regression guarded: 7 cards with 2 sets each made 14 rows that covered a phone's board.
    expect(foldedCount(rows(5, 9))).toBe(3);
  });

  it("shows a short list whole", () => {
    expect(foldedCount(rows(0, 1))).toBe(1);
    expect(foldedCount(rows(0, 0))).toBe(0);
  });
});
