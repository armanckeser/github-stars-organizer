import { describe, expect, it } from "vitest";
import { popOf, setName, sourceOf } from "./names.ts";

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

// Regression guarded: the card that pops over a creature when something fires reads its
// trigger and first effect from the hook; a wrong word ("Start" for a hit, "Heal" for a
// shield) tells the player the ability does something it doesn't.
describe("popOf", () => {
  it.each([
    ["fork-bomb", { kind: "ability", name: "Fork bomb", line: "Start → Hit all" }],
    ["hotfix", { kind: "ability", name: "Hotfix", line: "Low HP → Heal" }],
    ["set:typescript", { kind: "set", name: "Type checked", line: "Start → Guard up" }],
    ["set:go", { kind: "set", name: "Goroutines", line: "Hit → Extra hit" }],
    ["boost:tar-pit", { kind: "boost", name: "Tar pit", line: "3rd hit → Foe speed down" }],
    ["boost:last-stand", { kind: "boost", name: "Last stand", line: "Alone → Attack up" }],
    ["boost:throttle", { kind: "boost", name: "Throttle", line: "Start → Rate limited" }],
  ])("reads %s as its trigger and first effect", (id, pop) => {
    expect(popOf(id)).toEqual(pop);
  });

  it.each([
    ["merge-conflict", { kind: "condition", name: "Merge conflict", line: null }],
    ["paintball", { kind: "ability", name: "paintball", line: null }],
    ["set:nope", { kind: "set", name: "Nope", line: null }],
    ["boost:pop-pop", { kind: "boost", name: "pop-pop", line: null }],
  ])("has no line for %s, which has no hook of its own", (id, pop) => {
    expect(popOf(id)).toEqual(pop);
  });
});
