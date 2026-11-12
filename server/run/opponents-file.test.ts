import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { OPPONENTS } from "./rules.ts";

// OPPONENTS.md is what an account reads to learn it is an opponent and how to be left out.

const listed = (text: string) => [...text.matchAll(/^- ([a-z\d-]+)$/gim)].map((found) => found[1]);

describe("OPPONENTS.md", () => {
  test("lists exactly the accounts a run is played against", () => {
    // Regression guarded: an account added to OPPONENTS in code but missing from the file, so nobody could find out.
    const file = readFileSync(new URL("../../OPPONENTS.md", import.meta.url), "utf8");
    expect(listed(file)).toEqual(OPPONENTS);
  });

  test("a list that drops one account doesn't match", () => {
    expect(listed("- sindresorhus\n- t3dotgg\n")).not.toEqual(OPPONENTS);
  });
});
