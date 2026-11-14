import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { FactsNode } from "../worker/src/battle.ts";
import { fillOrder, keepFactsSql } from "./fill-repo-facts.ts";

const node = (nameWithOwner: string, description: string | null): FactsNode =>
  ({ nameWithOwner, description, stargazerCount: 4200 }) as FactsNode;

describe("the fill's SQL", () => {
  // Regression guarded: one description with an apostrophe broke the whole night's file.
  it("keeps facts whose text has quotes, and replaces a row kept before", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync("worker/migrations/0002_repo_facts.sql", "utf8"));
    db.exec(keepFactsSql([node("Greendale/Dreamatorium", "old")], 1));
    const facts = [node("Greendale/Dreamatorium", "Abed's 'Dreamatorium'; -- \"cool\""), node("troy-barnes/blanket-fort", null)];
    db.exec(keepFactsSql(facts, 2));

    const rows = db.prepare("SELECT name, facts, read_at FROM repo_facts ORDER BY name").all() as { name: string; facts: string; read_at: number }[];
    expect(rows.map((row) => [row.name, JSON.parse(row.facts), row.read_at])).toEqual([
      ["greendale/dreamatorium", facts[0], 2],
      ["troy-barnes/blanket-fort", facts[1], 2],
    ]);
  });
});

describe("what the fill reads", () => {
  // Regression guarded: the fill spent its points on repos kept a minute ago.
  it("is old rows, oldest first, then most-starred repos not kept in any case", () => {
    const kept = [
      { name: "greendale/new", read_at: 900 },
      { name: "greendale/older", read_at: 100 },
      { name: "greendale/old", read_at: 200 },
    ];
    expect(fillOrder(kept, ["Greendale/New", "Greendale/Old", "city-college/mascot"], 500)).toEqual(["greendale/older", "greendale/old", "city-college/mascot"]);
  });
});
