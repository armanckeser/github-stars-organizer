import { describe, expect, test } from "vitest";
import { creatureRecipe } from "../../../../server/creature-recipe";
import { creatureSticker } from "../../../../server/creature-sticker";
import recorded from "./creature.fixture.json";
import { CREATURE_REPOS, printOf, RUN_CREATURES, type CreaturePrint } from "./creature-fingerprint";

// A colour is kept as 8-bit hex; a recipe that rounds once more may land one step away.
const COLOR_STEP = 1;

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

function colorsClose(drawn: string | null, kept: string | null): boolean {
  if (drawn === null || kept === null) return drawn === kept;
  const [a, b] = [channels(drawn), channels(kept)];
  return a.every((value, i) => Math.abs(value - b[i]) <= COLOR_STEP);
}

describe("a repo's creature", () => {
  test.each([...CREATURE_REPOS, ...RUN_CREATURES].map((fighter, i) => [fighter.fullName, fighter, (recorded as CreaturePrint[])[i]] as const))(
    "is built from the same parts, in the same places and colours, when %s is drawn",
    (_name, fighter, kept) => {
      // Regression guarded: the creature's choices moved to a shared recipe, and a random draw
      // out of order changes every creature in the game and every card's art.
      const drawn = printOf(fighter);
      expect(drawn.name).toBe(kept.name);
      expect(drawn.parts.map(({ shape, size, matrix, outlined, paints }) => ({ shape, size, matrix, outlined, paints }))).toEqual(
        kept.parts.map(({ shape, size, matrix, outlined, paints }) => ({ shape, size, matrix, outlined, paints })),
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

  // The colours of the five squares a viewer sees: lit, then the contribution graph's empty square.
  const EMPTY = "#ebedf0";
  const SQUARES = 5;

  test.each(RUN_CREATURES.map((fighter) => [fighter.fullName, fighter] as const))(
    "shows its cost as lit squares on the 3D model and on the sticker alike, when %s is drawn",
    (_name, fighter) => {
      // Regression guarded: the sticker and the 3D model each listed their own parts, so a
      // change to one (the tome's bookmark) never reached the other; a share picture could
      // then show a different cost from the board.
      const { lit, tier } = creatureRecipe(fighter).sash ?? { lit: 0, tier: "" };
      const modelPaints = printOf(fighter).parts.flatMap((part) => part.paints ?? []);
      const modelLit = modelPaints.filter((paint) => paint === tier).length;
      // A flat-fronted body wears a row on its front and its back, a round one a row on its side.
      const rows = (modelLit + modelPaints.filter((paint) => paint === EMPTY).length) / SQUARES;
      const sticker = creatureSticker(creatureRecipe(fighter), { x: 0, y: 0, size: 200 });
      const stickerFills = (paint: string) => sticker.split(`fill="${paint}"`).length - 1;
      expect([1, 2]).toContain(rows);
      expect({ modelLit, sticker: { lit: stickerFills(tier), empty: stickerFills(EMPTY) } }).toEqual({ modelLit: lit * rows, sticker: { lit, empty: SQUARES - lit } });
    },
  );

  test("has a three-square sash in blue, when the card costs 3", () => {
    const deanVault = RUN_CREATURES.find((fighter) => fighter.fullName === "greendale/dean-vault");
    const sticker = creatureSticker(creatureRecipe(deanVault!), { x: 0, y: 0, size: 200 });
    expect(sticker.split('fill="#4a90d9"').length - 1).toBe(3);
  });

  test("has no sash on the model or the sticker, when the repo has no card", () => {
    const koosh = CREATURE_REPOS[13];
    expect(printOf(koosh).parts.filter((part) => part.paints)).toEqual([]);
    expect(creatureSticker(creatureRecipe(koosh), { x: 0, y: 0, size: 200 })).not.toContain(`fill="${EMPTY}"`);
  });
});
