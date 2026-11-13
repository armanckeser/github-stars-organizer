import { describe, expect, test } from "vitest";
import {
  CLASS_IDS, LOOK_PARTS, characterFrom, characterIn, characterLevel, characterParams, decodeLook, defaultCharacter, defaultLook,
  encodeLook, figureImage, type Look,
} from "./character.ts";

const look: Look = { skin: 2, hair: 4, hairColor: 5, top: 1, topColor: 3, extra: 2 };

describe("looks", () => {
  test("a default look is the same for the same username, whatever its case, and in range", () => {
    expect(defaultLook("Octocat")).toEqual(defaultLook("octocat"));
    for (const login of ["octocat", "hubot", "a", "some-long-user-name"]) {
      const made = defaultLook(login);
      for (const key of Object.keys(LOOK_PARTS) as (keyof Look)[]) {
        expect(made[key]).toBeGreaterThanOrEqual(0);
        expect(made[key]).toBeLessThan(LOOK_PARTS[key].length);
      }
    }
  });

  test("a look survives being written into an address and read back", () => {
    expect(encodeLook(look)).toBe("2.4.5.1.3.2");
    expect(decodeLook(encodeLook(look), defaultLook("x"))).toEqual(look);
  });

  test("a part that is missing or out of range keeps the fallback's", () => {
    const fallback = defaultLook("octocat");
    expect(decodeLook(null, fallback)).toEqual(fallback);
    expect(decodeLook("99.x.-1", fallback)).toEqual(fallback);
    expect(decodeLook("1", fallback)).toEqual({ ...fallback, skin: 1 });
  });

  test("every part draws without leaving a gap in the markup", () => {
    for (const key of Object.keys(LOOK_PARTS) as (keyof Look)[]) {
      for (let i = 0; i < LOOK_PARTS[key].length; i++) {
        const svg = figureImage({ ...look, [key]: i });
        expect(svg).not.toContain("undefined");
        expect(svg).not.toContain("NaN");
      }
    }
    expect(figureImage({ ...look, extra: 2 })).not.toBe(figureImage({ ...look, extra: 0 }));
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

  // READMEs written before the move embed the card from the old address and keep it.
  test.each(["https://stard.armanckeser.com", "https://stars-demo.armanckeser.com"])("is found in a README by its trainer card from %s, and is null without one", (origin) => {
    const readme = `Hi\n[![me](${origin}/api/card/trainer.svg?user=octocat&amp;class=veteran&look=2.4.5.1.3.2)](x)`;
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
