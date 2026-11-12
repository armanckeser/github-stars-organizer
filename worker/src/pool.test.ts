import { afterEach, describe, expect, test, vi } from "vitest";
import type { RunPool } from "./battle.ts";
import { poolResponse } from "./battle.ts";
import { HOST, fakeGitHub } from "./fake-github.test-helper.ts";

// Run card HP is 130 plus a quarter of the HP share, and a share is at most 40% of the
// biggest budget (460), so no run card passes 176 HP, or 185 when shiny. Battle cards
// for the same repos run near 300 HP.
const RUN_HP_FLOOR = 130;
const RUN_HP_CEILING = 185;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/run/pool", () => {
  // Regression guarded: the Play screen fought with battle numbers (about 300 HP), so a
  // third of fights ran out the clock, and the board's HP bars disagreed with the fight.
  test("deals each card with its run card, and the fighter shows the run card's numbers", async () => {
    vi.stubGlobal("fetch", fakeGitHub);
    const response = await poolResponse(new URLSearchParams({ login: HOST }), "a-token");
    const pool = (await response.json()) as RunPool;

    expect(response.status).toBe(200);
    expect(pool.team.length).toBeGreaterThan(0);
    for (const fighter of pool.team) {
      expect(fighter.card.fullName).toBe(fighter.fullName);
      expect(fighter.card.hp).toBeGreaterThanOrEqual(RUN_HP_FLOOR);
      expect(fighter.card.hp).toBeLessThanOrEqual(RUN_HP_CEILING);
      expect([fighter.hp, fighter.attack, fighter.defense, fighter.speed]).toEqual([fighter.card.hp, fighter.card.attack, fighter.card.guard, fighter.card.speed]);
    }
  });

  test("refuses a username GitHub can't have", async () => {
    vi.stubGlobal("fetch", fakeGitHub);
    const response = await poolResponse(new URLSearchParams({ login: "not a login" }), "a-token");

    expect(response.status).toBe(400);
  });
});
