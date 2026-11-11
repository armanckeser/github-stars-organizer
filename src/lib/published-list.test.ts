import { describe, expect, it } from "vitest";
import {
  CARD_ORIGIN,
  CREDIT_LINE,
  DEFAULT_OPTIONS,
  composeMarkdown,
  defaultComposition,
  type ComposeList,
  type ComposeListItem,
  type ComposeRepo,
  type Composition,
} from "./published-list";

const NOW = Date.parse("2026-11-07T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function repo(id: string, extra: Partial<ComposeRepo> = {}): ComposeRepo {
  return {
    id,
    full_name: `me/${id}`,
    url: `https://github.com/me/${id}`,
    description: `About ${id}`,
    notes: null,
    language: "TypeScript",
    stars: 10,
    usefulness_rating: null,
    is_archived: false,
    pushed_at: daysAgo(5),
    ...extra,
  };
}

const lists: ComposeList[] = [
  { id: "l1", name: "Tools" },
  { id: "l2", name: "Reading" },
];

function compose(overrides: Partial<Composition>): Composition {
  return { login: "", title: "", intro: "", sections: [], options: { ...DEFAULT_OPTIONS, credit: false }, keepQuiet: [], ...overrides };
}

function run(composition: Composition, repos: ComposeRepo[], listItems: ComposeListItem[] = []) {
  return composeMarkdown(composition, { repos, lists, listItems }, NOW);
}

const inList = (listId: string, ...repoIds: string[]) => repoIds.map((repo_id) => ({ list_id: listId, repo_id }));
const listSection = (listId: string, heading = "") => ({ id: `s-${listId}`, kind: "list" as const, listId, heading });

/** The query of the nth card in the Markdown, as a URLSearchParams. */
function cardParams(markdown: string, kind: string, n = 0): URLSearchParams {
  const urls = [...markdown.matchAll(new RegExp(`\\]\\((${CARD_ORIGIN}/api/card/${kind}\\.svg\\?[^)]*)\\)`, "g"))].map((m) => m[1]);
  return new URL(urls[n]).searchParams;
}

describe("without a username: plain Markdown", () => {
  it("writes sections in order under the title and intro", () => {
    const { markdown } = run(
      compose({ title: "My stars", intro: "What I use.", sections: [listSection("l2"), listSection("l1", "Daily tools")] }),
      [repo("a"), repo("b")],
      [...inList("l1", "a"), ...inList("l2", "b")],
    );
    expect(markdown).toBe(
      "# My stars\n\nWhat I use.\n\n## Reading\n\n- [me/b](https://github.com/me/b) - About b\n\n## Daily tools\n\n- [me/a](https://github.com/me/a) - About a\n",
    );
  });

  it("lists a List's repos most starred first and shows a note over the description", () => {
    const { markdown } = run(
      compose({ sections: [listSection("l1")] }),
      [repo("small", { stars: 1 }), repo("big", { stars: 900, notes: "Use this daily" }), repo("bare", { stars: 5, description: null })],
      inList("l1", "small", "big", "bare"),
    );
    expect(markdown.split("\n").filter((l) => l.startsWith("- "))).toEqual([
      "- [me/big](https://github.com/me/big) - Use this daily",
      "- [me/bare](https://github.com/me/bare)",
      "- [me/small](https://github.com/me/small) - About small",
    ]);
  });

  it("uses the description when notes are off, and adds language and stars when asked", () => {
    const { markdown } = run(
      compose({ sections: [listSection("l1")], options: { ...DEFAULT_OPTIONS, credit: false, notes: false, language: true, stars: true } }),
      [repo("a", { notes: "mine", stars: 1234 })],
      inList("l1", "a"),
    );
    expect(markdown).toContain("- [me/a](https://github.com/me/a) - About a (TypeScript, 1,234 stars)");
  });

  it("keeps text from changing the Markdown around it", () => {
    const { markdown } = run(
      compose({ sections: [listSection("l1")] }),
      [repo("a", { description: "A *bold* [link](x) <b>\nsecond line" })],
      inList("l1", "a"),
    );
    expect(markdown).toContain("- [me/a](https://github.com/me/a) - A \\*bold\\* \\[link\\](x) \\<b\\> second line");
  });

  it("writes the top four and reviews as lines, with the rating as stars", () => {
    const { markdown } = run(
      compose({
        sections: [
          { id: "t", kind: "topFour", repoIds: ["a"], heading: "" },
          { id: "r", kind: "reviews", repoIds: ["b"], heading: "" },
        ],
      }),
      [repo("a"), repo("b", { usefulness_rating: 4, notes: "Solid" })],
    );
    expect(markdown).toBe("## Top four\n\n- [me/a](https://github.com/me/a) - About a\n\n## Reviews\n\n- [me/b](https://github.com/me/b) ★★★★☆ - Solid\n");
  });
});

describe("dead repos", () => {
  const repos = [repo("live"), repo("old", { pushed_at: daysAgo(400) }), repo("gone", { is_archived: true })];
  const items = inList("l1", "live", "old", "gone");

  it("leaves archived and quiet repos out of a List and says which", () => {
    const { markdown, leftOut, counts } = run(compose({ sections: [listSection("l1")] }), repos, items);
    expect(markdown).not.toContain("me/old");
    expect(markdown).not.toContain("me/gone");
    expect(leftOut.quiet.map((r) => r.id)).toEqual(["old"]);
    expect(leftOut.archived.map((r) => r.id)).toEqual(["gone"]);
    expect(counts["s-l1"]).toBe(1);
  });

  it("keeps a quiet repo that is named, but never an archived one", () => {
    const { markdown, leftOut, keptQuiet } = run(compose({ sections: [listSection("l1")], keepQuiet: ["old", "gone"] }), repos, items);
    expect(markdown).toContain("me/old");
    expect(markdown).not.toContain("me/gone");
    expect(leftOut.quiet).toEqual([]);
    expect(keptQuiet.map((r) => r.id)).toEqual(["old"]);
  });

  it("shows a repo picked by hand even when the repo is quiet", () => {
    const { markdown, leftOut } = run(compose({ sections: [{ id: "t", kind: "topFour", repoIds: ["old"], heading: "" }] }), repos);
    expect(markdown).toContain("me/old");
    expect(leftOut.quiet).toEqual([]);
  });

  it("skips a section with nothing left in it", () => {
    const { markdown, counts } = run(compose({ sections: [listSection("l1"), listSection("l2")] }), repos, inList("l1", "gone"));
    expect(markdown).toBe("\n");
    expect(counts).toEqual({ "s-l1": 0, "s-l2": 0 });
  });
});

describe("with a username: cards", () => {
  it("draws the top four as one card that links to the person's stars", () => {
    const { markdown } = run(
      compose({ login: "octo", sections: [{ id: "t", kind: "topFour", repoIds: ["a", "b", "c", "d", "e"], heading: "" }] }),
      [repo("a", { usefulness_rating: 5 }), repo("b"), repo("c", { usefulness_rating: 3 }), repo("d"), repo("e")],
    );
    expect(markdown).toMatch(/^\[!\[octo's top four repos on GitHub: me\/a, me\/b, me\/c, me\/d\]\(.*\)\]\(https:\/\/stars-demo\.armanckeser\.com\/\?user=octo\)\n$/);
    const params = cardParams(markdown, "top4");
    expect(params.get("user")).toBe("octo");
    expect(params.get("repos")).toBe("me/a,me/b,me/c,me/d");
    expect(params.get("ratings")).toBe("5,0,3,0");
  });

  it("leaves ratings off the top four when none of the four is rated", () => {
    const { markdown } = run(compose({ login: "octo", sections: [{ id: "t", kind: "topFour", repoIds: ["a"], heading: "" }] }), [repo("a")]);
    expect(cardParams(markdown, "top4").has("ratings")).toBe(false);
  });

  it("draws each review as a card that links to the repo", () => {
    const { markdown } = run(
      compose({ login: "octo", sections: [{ id: "r", kind: "reviews", repoIds: ["a", "b"], heading: "" }] }),
      [repo("a", { usefulness_rating: 4, notes: "Fast,\n[really] fast" }), repo("b")],
    );
    expect(markdown).toContain("## Reviews\n\n[![me/a, rated 4 of 5: Fast, really fast](");
    expect(markdown).toContain(")](https://github.com/me/a)\n\n[![me/b](");
    const first = cardParams(markdown, "review");
    expect(first.get("repo")).toBe("me/a");
    expect(first.get("rating")).toBe("4");
    expect(first.get("text")).toBe("Fast, [really] fast");
    expect(cardParams(markdown, "review", 1).has("text")).toBe(false);
  });

  it("draws a List as a card over its repos, folded shut", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const { markdown } = run(
      compose({ login: "octo", sections: [listSection("l1")] }),
      ids.map((id, i) => repo(id, { stars: 100 - i })),
      inList("l1", ...ids),
    );
    const params = cardParams(markdown, "list");
    expect(params.get("title")).toBe("Tools");
    expect(params.get("count")).toBe("7");
    expect(params.get("repos")).toBe("me/a,me/b,me/c,me/d,me/e,me/f");
    expect(markdown).toContain("<details>\n<summary>All 7 repos</summary>\n\n- [me/a]");
    expect(markdown).toContain("- [me/g](https://github.com/me/g) - About g\n\n</details>");
  });

  it("shows only the card when the repos are turned off", () => {
    const { markdown } = run(
      compose({ login: "octo", sections: [listSection("l1")], options: { ...DEFAULT_OPTIONS, credit: false, repos: false } }),
      [repo("a")],
      inList("l1", "a"),
    );
    expect(markdown).not.toContain("<details>");
    expect(markdown).not.toContain("- [me/a]");
  });

  it("falls back to plain text for something that isn't a username", () => {
    const { markdown } = run(compose({ login: "not a name", sections: [listSection("l1")] }), [repo("a")], inList("l1", "a"));
    expect(markdown).not.toContain("/api/card/");
  });
});

describe("the rating section", () => {
  it("lists repos rated at or above the number, best first", () => {
    const { markdown } = run(
      compose({ sections: [{ id: "r", kind: "rating", min: 4, heading: "" }] }),
      [repo("three", { usefulness_rating: 3 }), repo("four", { usefulness_rating: 4 }), repo("five", { usefulness_rating: 5 }), repo("none")],
    );
    expect(markdown).toBe("## Rated 4 or higher\n\n- [me/five](https://github.com/me/five) - About five\n- [me/four](https://github.com/me/four) - About four\n");
  });
});

describe("the credit line and the default profile", () => {
  it("ends with the credit line unless turned off", () => {
    const on = run(compose({ options: DEFAULT_OPTIONS, sections: [listSection("l1")] }), [repo("a")], inList("l1", "a")).markdown;
    expect(on.endsWith(`\n\n${CREDIT_LINE}\n`)).toBe(true);
    expect(run(compose({}), []).markdown).not.toContain("Stard");
  });

  it("starts from the best-rated four, the repos with a rating and a note, and the public Lists", () => {
    const repos = [
      repo("a", { stars: 5 }),
      repo("b", { stars: 50, usefulness_rating: 5, notes: "Great" }),
      repo("c", { stars: 500 }),
      repo("d", { stars: 1, usefulness_rating: 3 }),
      repo("e", { stars: 9000, is_archived: true }),
      repo("f", { stars: 2 }),
    ];
    const composition = defaultComposition([...lists, { id: "l3", name: "Secret", is_private: true }], repos, "octo");
    expect(composition.login).toBe("octo");
    expect(composition.sections).toEqual([
      { id: "topFour", kind: "topFour", repoIds: ["b", "d", "c", "a"], heading: "" },
      { id: "reviews", kind: "reviews", repoIds: ["b"], heading: "" },
      { id: "list:l1", kind: "list", listId: "l1", heading: "" },
      { id: "list:l2", kind: "list", listId: "l2", heading: "" },
    ]);
  });
});
