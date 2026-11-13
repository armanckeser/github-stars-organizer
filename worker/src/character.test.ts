import { afterEach, describe, expect, test, vi } from "vitest";
import { GUEST, HOST, LISTED, OWN_FILE, fakeGitHub } from "./fake-github.test-helper.ts";
import { poolResponse } from "./battle.ts";

afterEach(() => vi.unstubAllGlobals());

type Pool = { character: { name: string; klass: string; custom: boolean; look: Record<string, string> } };

async function poolOf(login: string): Promise<Pool> {
  vi.stubGlobal("fetch", fakeGitHub);
  const response = await poolResponse(new URLSearchParams({ login }), "token");
  expect(response.status).toBe(200);
  return (await response.json()) as Pool;
}

describe("a player's character in a run", () => {
  // Regression guarded: the character file kept for a well-known account in
  // `characters/` is never read, so their figure is still made from the username.
  test("poolResponse_draws_the_file_kept_here_when_the_player_has_none_of_their_own", async () => {
    const { character } = await poolOf(LISTED);
    expect(character.name).toBe("Troy");
    expect(character.custom).toBe(true);
    expect(character.look).toMatchObject({ hair: "buzz", hairColor: "#1d1b1a", beard: "stubble", top: "tee", topColor: "#1f8fe0", glasses: "none", hat: "none", headphones: "no" });
  });

  test("poolResponse_draws_the_players_own_character_md_when_both_files_exist", async () => {
    const { character } = await poolOf(OWN_FILE);
    expect([character.name, character.look.hair, character.look.glasses, character.look.hat]).toEqual(["Shirley", "medium", "square", "beanie"]);
  });

  test("poolResponse_keeps_the_trainer_card_when_the_readme_has_one_and_no_file_exists", async () => {
    const { character } = await poolOf(HOST);
    expect([character.name, character.klass, character.custom]).toEqual(["Abed", "specialist", true]);
  });

  test("poolResponse_makes_the_look_from_the_username_when_no_place_has_a_character", async () => {
    const { character } = await poolOf(GUEST);
    expect([character.name, character.custom, character.look.glasses]).toEqual([GUEST, false, "round"]);
  });
});
