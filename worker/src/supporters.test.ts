import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GOLD } from "../../server/character.ts";
import type { Opening } from "../../server/game.ts";
import { battleResponse, poolResponse, trainerResponse } from "./battle.ts";
import { GUEST, HOST, fakeGitHub, stargazerCalls } from "./fake-github.test-helper.ts";
import { gameResponse } from "./game.ts";

// Each test starts a day after the last, so the hour-long list of stargazers from one
// test is never still held in the next.
let day = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 1 + day++, 12)));
  vi.stubGlobal("fetch", fakeGitHub);
  stargazerCalls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Pool = { login: string; supporter?: boolean };
const pool = async (login: string) => (await (await poolResponse(new URLSearchParams({ login }), "token")).json()) as Pool;

describe("the gold band for people who starred Stard", () => {
  // Regression guarded: someone who starred the repo gets no band because their login
  // is on the second page of stargazers, or GitHub spells it in another case.
  test("poolResponse_marks_the_player_a_supporter_when_their_login_is_among_the_stargazers", async () => {
    expect(await pool(HOST)).toMatchObject({ login: HOST, supporter: true });
    expect(stargazerCalls).toEqual(["?per_page=100&page=1", "?per_page=100&page=2"]);
  });

  test("poolResponse_leaves_the_flag_out_when_the_player_never_starred_stard", async () => {
    expect("supporter" in (await pool(GUEST))).toBe(false);
  });

  // Regression guarded: every battle and run reads every stargazer page again, and a
  // shared link eats the token's hourly limit.
  test("supporters_are_read_once_an_hour_when_many_players_ask", async () => {
    await pool(HOST);
    await pool(GUEST);
    vi.setSystemTime(Date.now() + 59 * 60_000);
    await pool(HOST);
    expect(stargazerCalls).toHaveLength(2);

    vi.setSystemTime(Date.now() + 2 * 60_000);
    await pool(HOST);
    expect(stargazerCalls).toHaveLength(4);
  });

  // Regression guarded: GitHub failing to list the stargazers fails every battle and
  // run, or drops every band until the next hour.
  test("poolResponse_keeps_the_last_list_when_github_wont_list_the_stargazers", async () => {
    await pool(HOST);
    vi.setSystemTime(Date.now() + 61 * 60_000);
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/stargazers") ? Promise.resolve(new Response("{}", { status: 500 })) : fakeGitHub(input, init));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await poolResponse(new URLSearchParams({ login: HOST }), "token");
    expect(response.status).toBe(200);
    expect(((await response.json()) as Pool).supporter).toBe(true);
  });

  test("battle_and_opening_post_carry_the_flag_when_one_side_starred_stard", async () => {
    const battle = (await (await battleResponse("battle", new URLSearchParams({ a: HOST, b: GUEST }), "token")).json()) as { a: Pool; b: Pool };
    expect([battle.a.supporter, "supporter" in battle.b]).toEqual([true, false]);

    const { opening } = (await (await gameResponse("game/new", new URLSearchParams({ a: HOST, b: GUEST }), "token", "test-key")).json()) as { opening: Opening };
    expect([opening.players.a.supporter, "supporter" in opening.players.b]).toEqual([true, false]);
  });

  test("trainer_card_draws_the_gold_band_only_when_the_player_starred_stard", async () => {
    const card = async (user: string) => (await trainerResponse(new URLSearchParams({ user }), "token")).text();
    expect(await card(HOST)).toContain(GOLD);
    expect(await card(GUEST)).not.toContain(GOLD);
  });
});
