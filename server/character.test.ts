import { describe, expect, test } from "vitest";
import {
  CLASS_IDS, COLOR_PARTS, STYLE_PARTS, characterFrom, characterFromFile, characterIn, characterLevel, characterParams, chosenCharacter, decodeLook,
  defaultCharacter, defaultLook, encodeLook, figureImage, readCharacterFile, readLook, type Look, type StylePart,
} from "./character.ts";

// Skin tan, curly blue hair, a red hoodie, headphones: the old code "2.4.5.1.3.2".
const look: Look = {
  skin: "#d39a6c", hair: "curly", hairColor: "#3f6fd8", top: "hoodie", topColor: "#d9482b",
  beard: "none", glasses: "none", hat: "none", headphones: "yes",
};
const plain: Look = { ...look, headphones: "no" };

describe("look codes", () => {
  // Regression guarded: a code pasted into a README before the parts were separate
  // stopped drawing the figure its owner built.
  test.each([
    ["2.4.5.1.3.2", look],
    ["1.2.3.0.4.1", { skin: "#ecc09c", hair: "long", hairColor: "#b4472b", top: "tee", topColor: "#e07a1f", beard: "none", glasses: "round", hat: "none", headphones: "no" }],
    ["0.0.0.0.0.4", { skin: "#f6d7c0", hair: "short", hairColor: "#1d1b1a", top: "tee", topColor: "#1fa866", beard: "full", glasses: "none", hat: "none", headphones: "no" }],
    ["4.5.1.2.7.3", { skin: "#6b4429", hair: "buzz", hairColor: "#5a3a22", top: "jacket", topColor: "#eceae4", beard: "none", glasses: "none", hat: "cap", headphones: "no" }],
  ] satisfies [string, Look][])("decodeLook_reads_the_old_code_%s_when_it_was_pasted_before_the_parts_split", (code, expected) => {
    expect(decodeLook(code, defaultLook("octocat"))).toEqual(expected);
  });

  test("encodeLook_writes_the_old_six_numbers_when_the_old_code_can_say_the_look", () => {
    // A card address that doesn't change keeps its cached image and its place in a README.
    expect(encodeLook(look)).toBe("2.4.5.1.3.2");
    expect(encodeLook(plain)).toBe("2.4.5.1.3.0");
  });

  test("encodeLook_adds_the_four_extras_and_hex_colours_when_the_old_code_cant_say_the_look", () => {
    const both: Look = { ...plain, hair: "mohawk", topColor: "#1f1f1f", beard: "goatee", glasses: "shades", hat: "beanie" };
    expect(encodeLook(both)).toBe("2.8.5.1.1f1f1f.0.3.3.2.0");
    expect(decodeLook("2.8.5.1.1f1f1f.0.3.3.2.0", defaultLook("x"))).toEqual(both);
  });

  test("decodeLook_keeps_the_fallbacks_part_when_a_part_is_missing_or_out_of_range", () => {
    const fallback = defaultLook("octocat");
    expect(decodeLook(null, fallback)).toEqual(fallback);
    expect(decodeLook("99.x.-1", fallback)).toEqual(fallback);
    expect(decodeLook("1", fallback)).toEqual({ ...fallback, skin: "#ecc09c" });
    expect(decodeLook("0.0.0.0.0.0.9.zz", fallback)).toEqual({ ...fallback, skin: "#f6d7c0", hair: "short", hairColor: "#1d1b1a", top: "tee", topColor: "#1fa866", beard: "none", glasses: "none", hat: "none", headphones: "no" });
  });

  test("defaultLook_is_the_figure_it_was_before_the_parts_split_when_nobody_built_one", () => {
    // octocat's old default was 0.3.4.3.7.4: light, bun, grey, sweater, white, beard.
    expect(defaultLook("Octocat")).toEqual({ skin: "#f6d7c0", hair: "bun", hairColor: "#9aa0a6", top: "sweater", topColor: "#eceae4", beard: "full", glasses: "none", hat: "none", headphones: "no" });
    // study-group-annie's was 1.3.0.3.6.1: fair, bun, black, sweater, charcoal, glasses.
    expect(defaultLook("study-group-annie")).toEqual({ skin: "#ecc09c", hair: "bun", hairColor: "#1d1b1a", top: "sweater", topColor: "#3a4049", beard: "none", glasses: "round", hat: "none", headphones: "no" });
    // torvalds' was 3.2.0.1.6.4: brown, long, black, hoodie, charcoal, beard.
    expect(defaultLook("torvalds")).toEqual({ skin: "#a56c43", hair: "long", hairColor: "#1d1b1a", top: "hoodie", topColor: "#3a4049", beard: "full", glasses: "none", hat: "none", headphones: "no" });
  });

  test("readLook_turns_an_old_six_number_look_into_parts_when_a_signed_post_holds_one", () => {
    expect(readLook({ skin: 2, hair: 4, hairColor: 5, top: 1, topColor: 3, extra: 2 })).toEqual(look);
    expect(readLook(look)).toBe(look);
  });
});

describe("the flat figure", () => {
  // Regression guarded: a part listed in the builder that the drawing ignores, so
  // picking it changes nothing on the card.
  test.each(Object.keys(STYLE_PARTS) as StylePart[])("figureImage_draws_each_%s_differently_when_the_part_changes", (key) => {
    const drawn = STYLE_PARTS[key].map((id) => figureImage({ ...plain, [key]: id }));
    for (const svg of drawn) {
      expect(svg).not.toContain("undefined");
      expect(svg).not.toContain("NaN");
    }
    // Bald and a hat both hide the top of the hair; every value of a part still looks different on a bare head.
    expect(new Set(drawn).size).toBe(STYLE_PARTS[key].length);
  });

  test.each(Object.keys(COLOR_PARTS) as (keyof typeof COLOR_PARTS)[])("figureImage_uses_the_%s_colour_when_the_colour_changes", (key) => {
    expect(figureImage({ ...plain, [key]: "#123456" })).toContain("#123456");
    expect(figureImage(plain)).not.toContain("#123456");
  });
});

describe("a character file", () => {
  const theo = `name: Theo\nclass: scout\nmotto: Ship it.\nskin: light\nhair: short\nhair-color: brown\nbeard: stubble\nglasses: round\nhat: none\nheadphones: no\ntop: hoodie\ntop-color: #1f1f1f`;

  test("characterFromFile_reads_every_key_when_the_file_is_the_example_from_the_docs", () => {
    expect(characterFromFile(theo, "theo")).toEqual({
      name: "Theo", klass: "scout", motto: "Ship it.",
      look: { skin: "#f6d7c0", hair: "short", hairColor: "#5a3a22", beard: "stubble", glasses: "round", hat: "none", headphones: "no", top: "hoodie", topColor: "#1f1f1f" },
    });
  });

  test("readCharacterFile_skips_a_line_when_its_key_or_value_is_unknown", () => {
    const file = readCharacterFile("# Theo\nwings: two\nhair: dreadlocks\nclass: wizard\n- glasses: Shades\nbeard: mustache\nhair-color: gray\ntop-color: #XYZ123\n<script>");
    expect(file).toEqual({ look: { glasses: "shades", beard: "moustache", hairColor: "#9aa0a6" } });
  });

  test("characterFromFile_wears_no_extras_when_the_file_leaves_them_out", () => {
    // octocat's username look has a beard; a file that names only the hair means none.
    const read = characterFromFile("hair: bald", "octocat");
    expect(read.look).toEqual({ ...defaultLook("octocat"), hair: "bald", beard: "none" });
    expect(read.name).toBe("octocat");
    expect(read.klass).toBe("rookie");
  });
});

describe("where a character is read from", () => {
  const card = "![](https://cards.example/api/card/trainer.svg?user=octocat&class=veteran&look=2.4.5.1.3.2)";
  const own = "class: maintainer\nhair: bald";
  const listed = "class: collector\nhair: mohawk";

  test.each([
    ["the own character.md", { ownFile: own, readme: card, listedFile: listed }, "maintainer"],
    ["the trainer card", { ownFile: null, readme: card, listedFile: listed }, "veteran"],
    ["the file kept here", { ownFile: null, readme: "# Hi", listedFile: listed }, "collector"],
  ])("chosenCharacter_takes_%s_when_nothing_before_it_has_one", (_name, sources, klass) => {
    expect(chosenCharacter(sources, "octocat")?.klass).toBe(klass);
  });

  test("chosenCharacter_is_null_when_no_place_has_a_character", () => {
    expect(chosenCharacter({ ownFile: null, readme: "# Hi", listedFile: null }, "octocat")).toBeNull();
  });
});

describe("a character in an address", () => {
  test("reads the name, class, look and motto, trimmed to their limits", () => {
    const params = new URLSearchParams({ name: "  The   Octo  ", class: "scout", look: "2.4.5.1.3.2", motto: "x".repeat(200) });
    const character = characterFrom(params, "octocat");
    expect(character.name).toBe("The Octo");
    expect(character.klass).toBe("scout");
    expect(character.look).toEqual(look);
    expect(character.motto).toHaveLength(70);
  });

  test("falls back to the username, the rookie class and the default look", () => {
    expect(characterFrom(new URLSearchParams({ class: "wizard" }), "octocat")).toEqual(defaultCharacter("octocat"));
  });

  test("is found in a README by its trainer card, and is null without one", () => {
    const readme = `Hi\n[![me](https://stars-demo.armanckeser.com/api/card/trainer.svg?user=octocat&amp;class=veteran&look=2.4.5.1.3.2)](x)`;
    expect(characterIn(readme, "octocat")).toEqual({ name: "octocat", klass: "veteran", look, motto: "" });
    expect(characterIn("# Hello", "octocat")).toBeNull();
  });

  test("writes back only what differs from the defaults", () => {
    expect(characterParams("octocat", { name: "octocat", klass: "scout", look, motto: "" })).toEqual({ user: "octocat", class: "scout", look: "2.4.5.1.3.2" });
    const full = characterParams("octocat", { name: "Octo", klass: "scout", look, motto: "Ship small" });
    expect(characterFrom(new URLSearchParams(full), "octocat")).toEqual({ name: "Octo", klass: "scout", look, motto: "Ship small" });
  });
});

test("there is a class for every id, and a level between 1 and 100", () => {
  expect(CLASS_IDS).toContain("rookie");
  expect(characterLevel(0, 0)).toBe(1);
  expect(characterLevel(500, 499)).toBe(60);
  expect(characterLevel(5_000_000, 0)).toBe(100);
});
