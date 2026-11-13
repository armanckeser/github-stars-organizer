import { afterEach, describe, expect, test, vi } from "vitest";
import { GUEST, HOST, LISTED, LISTED_LEFT_OUT, OWN_FILE, fakeGitHub } from "./fake-github.test-helper.ts";
import { poolResponse } from "./battle.ts";
import { callWorker, memoryCaches } from "./worker-host.test-helper.ts";

// The share picture's assets are bundled by wrangler and can't load in Node; nothing here draws a picture.
vi.mock("@resvg/resvg-wasm/index_bg.wasm", () => ({ default: new Uint8Array() }));
vi.mock("./SpaceGrotesk-Bold.ttf", () => ({ default: new ArrayBuffer(0) }));

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

describe("a character kept here for an account that opted out", () => {
  // The files in characters/ are drawn by someone else, so an account that asked not to
  // be played (OPPONENTS.md) must never show one.

  test("poolResponse_makes_the_look_from_the_username_when_the_account_has_a_no_play_file", async () => {
    // Regression guarded: the account's own run, which the no-play file leaves open,
    // drawing the figure kept here for it (bald, shades) over the username look.
    const { character } = await poolOf(LISTED_LEFT_OUT);
    expect([character.name, character.custom, character.look.hair, character.look.glasses]).toEqual([LISTED_LEFT_OUT, false, "bun", "none"]);
  });

  test("battle_is_refused_when_one_side_is_on_the_block_list", async () => {
    // Regression guarded: an instant battle reading a blocked account and showing the
    // figure kept here for it; the block list only guarded a run's pool.
    vi.stubGlobal("fetch", fakeGitHub);
    vi.stubGlobal("caches", memoryCaches());
    const { status, body } = await callWorker(`/api/battle?a=${HOST}&b=${LISTED}`, undefined, { NO_PLAY: "Study-Group-Troy" });
    expect(status).toBe(403);
    expect(body.error).toBe("study-group-troy has asked not to be played.");
  });

  test("battle_shows_the_file_kept_here_when_nobody_is_on_the_block_list", async () => {
    vi.stubGlobal("fetch", fakeGitHub);
    vi.stubGlobal("caches", memoryCaches());
    const { status, body } = await callWorker(`/api/battle?a=${HOST}&b=${LISTED}`, undefined, { NO_PLAY: "" });
    expect(status).toBe(200);
    expect((body.b as Pool).character.name).toBe("Troy");
  });

  test("run_picture_is_refused_when_its_player_is_on_the_block_list", async () => {
    vi.stubGlobal("fetch", fakeGitHub);
    vi.stubGlobal("caches", memoryCaches());
    const { status, body } = await callWorker(`/api/card/run.png?me=${LISTED}`, undefined, { NO_PLAY: `${GUEST},${LISTED}` });
    expect(status).toBe(403);
    expect(body.error).toBe("study-group-troy has asked not to be played.");
  });
});
