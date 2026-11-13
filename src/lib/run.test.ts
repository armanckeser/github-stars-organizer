import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchPlayer } from "./run";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPlayer", () => {
  // Regression guarded: the browser kept the old Worker's pool reply (max-age=3600) at
  // the same address after a deploy, so the new Play screen read fighters with no run
  // card and crashed on `card.sets` until the stored reply expired.
  test("asks for a pool at an address that names the reply's shape", async () => {
    const asked: URL[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      asked.push(new URL(String(input)));
      return Response.json({ login: "study-group-abed", avatarUrl: null, character: {}, team: [] });
    });

    await fetchPlayer("study-group-abed", "study-group-annie");

    expect(asked).toHaveLength(1);
    expect(asked[0].pathname).toBe("/api/run/pool");
    expect(Object.fromEntries(asked[0].searchParams)).toEqual({ login: "study-group-abed", for: "study-group-annie", _shape: "6" });
  });

  test("raises the Worker's message when the pool can't be read", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "No GitHub user called study-group-chang." }, { status: 404 }));

    await expect(fetchPlayer("study-group-chang")).rejects.toThrow("No GitHub user called study-group-chang.");
  });
});
