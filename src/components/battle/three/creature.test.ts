import { describe, expect, test } from "vitest";
import { assemble, type Vector } from "../../../../server/creature-parts";
import { creatureRecipe } from "../../../../server/creature-recipe";
import { creatureSticker } from "../../../../server/creature-sticker";
import recorded from "./creature.fixture.json";
import { CREATURE_REPOS, printOf, RUN_CREATURES, type CreaturePrint } from "./creature-fingerprint";

// A colour is kept as 8-bit hex; a recipe that rounds once more may land one step away.
const COLOR_STEP = 1;
// Places a recorded number must match to, within half a step: macOS and Linux sum a sash's
// 606 vertices about 0.001 apart, and a part moved or resized enough to see is 0.05 or more.
const PLACES_KEPT = 2;

const nearly = (values: number[]) => values.map((value) => expect.closeTo(value, PLACES_KEPT));

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
        kept.parts.map(({ shape, size, matrix, outlined, paints }) => ({ shape, size: nearly(size), matrix: nearly(matrix), outlined, paints })),
      );
      const colors = drawn.parts.map((part, i) => [part.color, kept.parts[i].color] as const);
      expect(colors.filter(([a, b]) => !colorsClose(a, b))).toEqual([]);
      expect({ height: drawn.height, floats: drawn.floats, shiny: drawn.shiny, phase: drawn.phase }).toEqual({ height: expect.closeTo(kept.height, PLACES_KEPT), floats: kept.floats, shiny: kept.shiny, phase: expect.closeTo(kept.phase, PLACES_KEPT) });
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

  // Where the board's camera is, seen from a creature on a wide screen, measured on the
  // dev page (creatures.html?view=board&shelf=0): how far above the ground it is, and how
  // far round from the creature's front, over every cell and Drafts slot of that side.
  const SIDES = [
    { side: "the other team's", above: [0.68, 0.75], round: [-0.21, 0.21] },
    { side: "your own", above: [0.81, 0.91], round: [Math.PI - 0.24, Math.PI + 0.29] },
    { side: "the Drafts shelf's", above: [0.99, 1.04], round: [0.11, -0.62] },
  ] as const;
  // A square turned more than about 72° from the camera is a sliver at the board's zoom.
  const MIN_FACING = 0.3;

  const towardCamera = (above: number, round: number): Vector => [Math.sin(round) * Math.cos(above), Math.sin(above), Math.cos(round) * Math.cos(above)];

  test.each(RUN_CREATURES.flatMap((fighter) => SIDES.map((where) => [fighter.fullName, where.side, where, fighter] as const)))(
    "turns a whole row of its sash's squares toward the board's camera, when %s stands on %s side",
    (_name, _side, where, fighter) => {
      // Regression guarded: a round body wore one row of squares on its front flank, so the
      // camera behind your own creatures saw a sliver of it or nothing, and your board's costs
      // read only on the block-shaped bodies. And the wisp wore its band round its neck, under
      // its head, turned away from the camera on both sides of the board. This test checks
      // which way the squares face, not whether the body hides them (see creatures.html).
      const recipe = creatureRecipe(fighter);
      const { lit, tier } = recipe.sash ?? { lit: 0, tier: "" };
      const squares = assemble(recipe).sash.filter(({ paint }) => paint === tier || paint === EMPTY);
      const rows = Array.from({ length: squares.length / SQUARES }, (_, row) => squares.slice(row * SQUARES, (row + 1) * SQUARES));
      for (const [above, round] of where.above.flatMap((height) => where.round.map((turn) => [height, turn] as const))) {
        const view = towardCamera(above, round);
        const facesCamera = ({ normal }: (typeof squares)[number]) => normal[0] * view[0] + normal[1] * view[1] + normal[2] * view[2] > MIN_FACING;
        const seenWhole = rows.filter((row) => row.every(facesCamera)).map((row) => row.map(({ paint }) => (paint === tier ? "lit" : "empty")));
        expect({ above, round, seenWhole: seenWhole.slice(0, 1) }).toEqual({ above, round, seenWhole: [Array.from({ length: SQUARES }, (_, i) => (i < lit ? "lit" : "empty"))] });
      }
    },
  );
});
