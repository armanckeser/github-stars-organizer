import { describe, expect, test } from "vitest";
import recorded from "./creature.fixture.json";
import { CREATURE_REPOS, printOf, type CreaturePrint } from "./creature-fingerprint";

// A colour is kept as 8-bit hex; a recipe that rounds once more may land one step away.
const COLOR_STEP = 1;

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

function colorsClose(drawn: string | null, kept: string | null): boolean {
  if (drawn === null || kept === null) return drawn === kept;
  const [a, b] = [channels(drawn), channels(kept)];
  return a.every((value, i) => Math.abs(value - b[i]) <= COLOR_STEP);
}

describe("a repo's creature", () => {
  test.each(CREATURE_REPOS.map((fighter, i) => [fighter.fullName, fighter, (recorded as CreaturePrint[])[i]] as const))(
    "is built from the same parts, in the same places and colours, when %s is drawn",
    (_name, fighter, kept) => {
      // Regression guarded: the creature's choices moved to a shared recipe, and a random draw
      // out of order changes every creature in the game and every card's art.
      const drawn = printOf(fighter);
      expect(drawn.name).toBe(kept.name);
      expect(drawn.parts.map(({ shape, size, matrix, outlined }) => ({ shape, size, matrix, outlined }))).toEqual(
        kept.parts.map(({ shape, size, matrix, outlined }) => ({ shape, size, matrix, outlined })),
      );
      const colors = drawn.parts.map((part, i) => [part.color, kept.parts[i].color] as const);
      expect(colors.filter(([a, b]) => !colorsClose(a, b))).toEqual([]);
      expect({ height: drawn.height, floats: drawn.floats, shiny: drawn.shiny, phase: drawn.phase }).toEqual({ height: kept.height, floats: kept.floats, shiny: kept.shiny, phase: kept.phase });
    },
  );

  test("differs from another repo's creature, when two repos share a language", () => {
    const [annie, koosh] = [CREATURE_REPOS[0], CREATURE_REPOS[13]];
    expect(printOf(annie).parts).not.toEqual(printOf(koosh).parts);
  });
});
