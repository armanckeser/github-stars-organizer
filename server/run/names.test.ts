import { describe, expect, it } from "vitest";
import { setName, sourceOf } from "./names.ts";

// Regression guarded: the board names whatever fired over a creature from the event's
// id; a raw id ("boost:head-start", "set:typescript") on screen means the lookup broke.
describe("sourceOf", () => {
  it.each([
    ["hotfix", { kind: "ability", name: "Hotfix" }],
    ["set:typescript", { kind: "set", name: "Type checked" }],
    ["set:html", { kind: "set", name: "HTML" }],
    ["boost:head-start", { kind: "boost", name: "Head start" }],
    ["merge-conflict", { kind: "condition", name: "Merge conflict" }],
  ])("names %s", (id, source) => {
    expect(sourceOf(id)).toEqual(source);
  });

  it("gives back an unknown id as written", () => {
    expect(sourceOf("boost:pop-pop")).toEqual({ kind: "boost", name: "pop-pop" });
    expect(sourceOf("paintball")).toEqual({ kind: "ability", name: "paintball" });
  });
});

describe("setName", () => {
  it.each([["typescript", "TypeScript"], ["c++", "C++"], ["game", "Game"], ["rust", "Rust"]])("writes %s as %s", (set, name) => {
    expect(setName(set)).toBe(name);
  });
});
