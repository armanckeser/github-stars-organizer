import { describe, expect, it } from "vitest";
import { effectsOf, popOf, setName, sourceOf } from "./names.ts";

// Regression guarded: the board names whatever fired over a creature from the event's
// id; a raw id ("boost:head-start", "set:web") on screen means the lookup broke.
describe("sourceOf", () => {
  it.each([
    ["hotfix", { kind: "ability", name: "Hotfix" }],
    ["set:web", { kind: "set", name: "Web" }],
    ["set:cli", { kind: "set", name: "CLI" }],
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
  it.each([["systems", "Systems"], ["cli", "CLI"], ["game", "Game"], ["ai", "AI"]])("writes %s as %s", (set, name) => {
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
    ["set:web", { kind: "set", name: "Web", line: "Start → Shield" }],
    ["set:systems", { kind: "set", name: "Systems", line: "3rd hit → Extra hit" }],
    ["set:paintball", { kind: "set", name: "Paintball", line: "Start → Speed up" }],
    ["boost:tar-pit", { kind: "boost", name: "Tar pit", line: "3rd hit → Foe speed down" }],
    ["boost:last-stand", { kind: "boost", name: "Last stand", line: "Alone → Attack up" }],
    ["boost:throttle", { kind: "boost", name: "Throttle", line: "Start → Rate limited" }],
  ])("reads %s as its trigger and first effect", (id, pop) => {
    expect(popOf(id)).toEqual(pop);
  });

  it.each([
    ["merge-conflict", { kind: "condition", name: "Merge conflict", line: null }],
    ["paintball", { kind: "ability", name: "paintball", line: null }],
    ["boost:pop-pop", { kind: "boost", name: "pop-pop", line: null }],
  ])("has no line for %s, which has no hook of its own", (id, pop) => {
    expect(popOf(id)).toEqual(pop);
  });
});

// Regression guarded: the board picks each fired thing's animation from its effects; an
// id that finds no effects plays only the cast ring, so a heal or a shield shows nothing.
describe("effectsOf", () => {
  it.each([
    ["code-freeze", [{ kind: "shield", aim: "self", share: 0.22 }]],
    ["bus-factor", [{ kind: "stat", aim: "self", stat: "attack", by: 0.7 }, { kind: "stat", aim: "self", stat: "guard", by: -0.1 }]],
    ["boost:regroup", [{ kind: "heal", aim: "self", share: 0.1 }]],
  ])("gives the effects of %s", (id, effects) => {
    expect(effectsOf(id)).toEqual(effects);
  });

  it("gives a set its two-card bonus", () => {
    expect(effectsOf("set:web")).toEqual([{ kind: "shield", aim: "self", share: 0.05 }]);
  });

  it("gives nothing for an unknown id", () => {
    expect(effectsOf("paintball")).toEqual([]);
    expect(effectsOf("boost:pop-pop")).toEqual([]);
  });
});
