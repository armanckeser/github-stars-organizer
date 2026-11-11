import { describe, expect, it } from "vitest";
import {
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
  return { title: "", intro: "", sections: [], options: { ...DEFAULT_OPTIONS, credit: false }, keepQuiet: [], ...overrides };
}

const listSection = (id: string, listId: string, heading = "") => ({ id, kind: "list" as const, listId, heading });
const items = (listId: string, ...repoIds: string[]): ComposeListItem[] => repoIds.map((repo_id) => ({ list_id: listId, repo_id }));

describe("composeMarkdown", () => {
  it("writes the title, intro and sections in the order given", () => {
    const repos = [repo("a"), repo("b")];
    const out = composeMarkdown(
      compose({
        title: "My list",
        intro: "Things I use.",
        sections: [listSection("s1", "l2"), listSection("s2", "l1")],
      }),
      { repos, lists, listItems: [...items("l1", "a"), ...items("l2", "b")] },
      NOW,
    );
    expect(out.markdown).toBe(
      [
        "# My list",
        "Things I use.",
        "## Reading",
        "- [me/b](https://github.com/me/b) - About b",
        "## Tools",
        "- [me/a](https://github.com/me/a) - About a",
      ].join("\n\n") + "\n",
    );
  });

  it("uses a custom heading when one is typed", () => {
    const out = composeMarkdown(
      compose({ sections: [listSection("s1", "l1", "Start here")] }),
      { repos: [repo("a")], lists, listItems: items("l1", "a") },
      NOW,
    );
    expect(out.markdown).toContain("## Start here\n");
    expect(out.markdown).not.toContain("## Tools");
  });

  it("repeats a repo that sits in two sections, and keeps Highlights in the List's section too", () => {
    const repos = [repo("a", { stars: 5 }), repo("b", { stars: 50 })];
    const out = composeMarkdown(
      compose({
        sections: [{ id: "h", kind: "highlights", repoIds: ["a"], heading: "" }, listSection("s1", "l1"), listSection("s2", "l2")],
      }),
      { repos, lists, listItems: [...items("l1", "a", "b"), ...items("l2", "a")] },
      NOW,
    );
    expect(out.markdown.match(/\[me\/a\]/g)).toHaveLength(3);
    expect(out.counts).toEqual({ h: 1, s1: 2, s2: 1 });
    // A List's repos go most starred first.
    const tools = out.markdown.slice(out.markdown.indexOf("## Tools"), out.markdown.indexOf("## Reading"));
    expect(tools.indexOf("[me/b]")).toBeLessThan(tools.indexOf("[me/a]"));
  });

  it("keeps Highlights in the order they were picked", () => {
    const out = composeMarkdown(
      compose({ sections: [{ id: "h", kind: "highlights", repoIds: ["b", "a"], heading: "Favorites" }] }),
      { repos: [repo("a", { stars: 99 }), repo("b")], lists, listItems: [] },
      NOW,
    );
    expect(out.markdown.indexOf("[me/b]")).toBeLessThan(out.markdown.indexOf("[me/a]"));
  });

  it("writes just the link when a repo has no description", () => {
    const out = composeMarkdown(
      compose({ sections: [listSection("s1", "l1")] }),
      { repos: [repo("a", { description: null }), repo("b", { description: "   " })], lists, listItems: items("l1", "a", "b") },
      NOW,
    );
    expect(out.markdown).toContain("- [me/a](https://github.com/me/a)\n");
    expect(out.markdown).toContain("- [me/b](https://github.com/me/b)\n");
    expect(out.markdown).not.toContain(" - \n");
  });

  it("prefers the note to the description when notes are on, and ignores notes when off", () => {
    const repos = [repo("a", { notes: "My take" }), repo("b", { notes: null })];
    const data = { repos, lists, listItems: items("l1", "a", "b") };
    const sections = [listSection("s1", "l1")];
    const on = composeMarkdown(compose({ sections }), data, NOW).markdown;
    expect(on).toContain("[me/a](https://github.com/me/a) - My take");
    expect(on).toContain("[me/b](https://github.com/me/b) - About b");
    const off = composeMarkdown(compose({ sections, options: { ...DEFAULT_OPTIONS, notes: false, credit: false } }), data, NOW).markdown;
    expect(off).toContain("[me/a](https://github.com/me/a) - About a");
    expect(off).not.toContain("My take");
  });

  it("adds language and star count only when asked", () => {
    const data = { repos: [repo("a", { stars: 12345 })], lists, listItems: items("l1", "a") };
    const sections = [listSection("s1", "l1")];
    expect(composeMarkdown(compose({ sections }), data, NOW).markdown).not.toMatch(/TypeScript|stars/);
    const both = composeMarkdown(compose({ sections, options: { ...DEFAULT_OPTIONS, language: true, stars: true, credit: false } }), data, NOW);
    expect(both.markdown).toContain("- About a (TypeScript, 12,345 stars)");
    const noDescription = composeMarkdown(
      compose({ sections, options: { ...DEFAULT_OPTIONS, stars: true, credit: false } }),
      { ...data, repos: [repo("a", { description: null, stars: 1 })] },
      NOW,
    );
    expect(noDescription.markdown).toContain("[me/a](https://github.com/me/a) (1 star)");
  });

  it("keeps text from breaking the line or the Markdown", () => {
    const out = composeMarkdown(
      compose({ sections: [listSection("s1", "l1")] }),
      { repos: [repo("a", { description: "Fast *and* <b>small</b>\nsecond line [x](y)", notes: null })], lists, listItems: items("l1", "a") },
      NOW,
    );
    expect(out.markdown).toContain("- [me/a](https://github.com/me/a) - Fast \\*and\\* \\<b\\>small\\</b\\> second line \\[x\\](y)\n");
  });

  it("never includes archived repos, even when picked or named to keep", () => {
    const dead = repo("dead", { is_archived: true });
    const out = composeMarkdown(
      compose({
        sections: [{ id: "h", kind: "highlights", repoIds: ["dead"], heading: "" }, listSection("s1", "l1")],
        keepQuiet: ["dead"],
      }),
      { repos: [dead, repo("live")], lists, listItems: items("l1", "dead", "live") },
      NOW,
    );
    expect(out.markdown).not.toContain("me/dead");
    expect(out.leftOut.archived.map((r) => r.id)).toEqual(["dead"]);
    expect(out.leftOut.quiet).toEqual([]);
    expect(out.keptQuiet).toEqual([]);
    // The Highlights heading is dropped because nothing is under it.
    expect(out.markdown).not.toContain("## Highlights");
    expect(out.counts).toEqual({ h: 0, s1: 1 });
  });

  it("leaves quiet repos out by default, once each, and says why", () => {
    const sleepy = repo("sleepy", { pushed_at: daysAgo(400) });
    const never = repo("never", { pushed_at: null });
    const out = composeMarkdown(
      compose({ sections: [listSection("s1", "l1"), listSection("s2", "l2")] }),
      { repos: [sleepy, never, repo("live")], lists, listItems: [...items("l1", "sleepy", "never", "live"), ...items("l2", "sleepy")] },
      NOW,
    );
    expect(out.markdown).not.toMatch(/sleepy|never/);
    expect(out.leftOut.quiet.map((r) => r.id)).toEqual(["never", "sleepy"]);
    // Nothing is left of the second List, so its heading is gone too.
    expect(out.markdown).not.toContain("## Reading");
  });

  it("keeps a quiet repo that the composition names", () => {
    const sleepy = repo("sleepy", { pushed_at: daysAgo(400) });
    const out = composeMarkdown(
      compose({ sections: [listSection("s1", "l1")], keepQuiet: ["sleepy"] }),
      { repos: [sleepy], lists, listItems: items("l1", "sleepy") },
      NOW,
    );
    expect(out.markdown).toContain("[me/sleepy]");
    expect(out.leftOut.quiet).toEqual([]);
    expect(out.keptQuiet.map((r) => r.id)).toEqual(["sleepy"]);
  });

  it("does not count repos no section asks for", () => {
    const out = composeMarkdown(
      compose({ sections: [listSection("s1", "l1")] }),
      { repos: [repo("a"), repo("old", { pushed_at: daysAgo(900) }), repo("dead", { is_archived: true })], lists, listItems: items("l1", "a") },
      NOW,
    );
    expect(out.leftOut).toEqual({ archived: [], quiet: [] });
  });

  it("builds the rating section from every repo at or above the number, best first", () => {
    const repos = [
      repo("three", { usefulness_rating: 3, stars: 900 }),
      repo("four", { usefulness_rating: 4, stars: 1 }),
      repo("five", { usefulness_rating: 5, stars: 2 }),
      repo("unrated", { stars: 999 }),
    ];
    const out = composeMarkdown(
      compose({ sections: [{ id: "r", kind: "rating", min: 4, heading: "" }] }),
      { repos, lists, listItems: [] },
      NOW,
    );
    expect(out.markdown).toContain("## Rated 4 or higher");
    expect(out.markdown).not.toMatch(/three|unrated/);
    expect(out.markdown.indexOf("[me/five]")).toBeLessThan(out.markdown.indexOf("[me/four]"));
    expect(out.counts.r).toBe(2);
  });

  it("ends with the credit line unless it is turned off", () => {
    const base = { sections: [listSection("s1", "l1")] };
    const data = { repos: [repo("a")], lists, listItems: items("l1", "a") };
    const on = composeMarkdown(compose({ ...base, options: DEFAULT_OPTIONS }), data, NOW).markdown;
    expect(on.endsWith(`\n\n${CREDIT_LINE}\n`)).toBe(true);
    expect(CREDIT_LINE).toBe("Made with [Stars Organizer](https://github.com/armanckeser/github-stars-organizer)");
    const off = composeMarkdown(compose({ ...base, options: { ...DEFAULT_OPTIONS, credit: false } }), data, NOW).markdown;
    expect(off).not.toContain("Stars Organizer");
  });
});

describe("defaultComposition", () => {
  it("starts with one section per public List, in the given order", () => {
    const composition = defaultComposition([
      { id: "l2", name: "B" },
      { id: "l1", name: "A", is_private: false },
      { id: "l3", name: "Secret", is_private: true },
    ]);
    expect(composition.sections.map((s) => s.kind === "list" && s.listId)).toEqual(["l2", "l1"]);
    expect(new Set(composition.sections.map((s) => s.id)).size).toBe(2);
    expect(composition.options).toEqual({ notes: true, language: false, stars: false, credit: true });
  });
});
