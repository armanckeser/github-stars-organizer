import { describe, expect, test } from "vitest";
import { CARD_WIDTH, listCard, messageCard, nameLines, reviewCard, topFourCard, wrap, type CardRepo } from "./cards.ts";

function repo(fullName: string, extra: Partial<CardRepo> = {}): CardRepo {
  return { fullName, stars: 1234, language: "TypeScript", color: "#3178c6", avatar: null, ...extra };
}

describe("nameLines", () => {
  test("keeps a short name on one line", () => {
    expect(nameLines("uv")).toEqual(["uv"]);
  });

  test("breaks a long name at its hyphens", () => {
    expect(nameLines("build-your-own-x")).toEqual(["build-", "your-own-x"]);
  });

  test("never makes more than four lines", () => {
    expect(nameLines("a-really-long-repository-name-that-keeps-going-on").length).toBeLessThanOrEqual(4);
    expect(nameLines("a-really-long-repository-name-that-keeps-going-on").join("")).toBe("a-really-long-repository-name-that-keeps-going-on");
  });
});

describe("wrap", () => {
  test("wraps at the width and ends a cut-off text with an ellipsis", () => {
    expect(wrap("one two three four five six", 9, 2)).toEqual(["one two", "three…"]);
    expect(wrap("short", 20, 3)).toEqual(["short"]);
  });
});

describe("the cards", () => {
  test("the top four names every repo, fills the stars given and leaves an outline for a missing poster", () => {
    const svg = topFourCard("octo", [repo("a/one"), repo("b/two"), repo("c/three")], [5, 4.5, null]);
    expect(svg).toContain(`width="${CARD_WIDTH}"`);
    expect(svg).toContain("OCTO’S TOP FOUR");
    expect(svg).toContain("octo’s top four repos on GitHub: a/one, b/two, c/three");
    for (const name of ["one", "two", "three"]) expect(svg).toContain(`>${name}</text>`);
    expect(svg).toContain("stroke-dasharray");
    // 5 and 4.5 stars: nine whole yellow stars, one half, and the watermark's star.
    expect(svg.match(/<polygon[^>]*fill="#f5c84b"/g)).toHaveLength(11);
    expect(svg).toContain(">stard</text>");
  });

  test("the top four has no row of stars when nothing is rated", () => {
    const rated = topFourCard("octo", [repo("a/one")], [4]);
    const unrated = topFourCard("octo", [repo("a/one")]);
    expect(unrated).not.toContain('fill="#30363d"');
    expect(Number(/height="(\d+)"/.exec(unrated)![1])).toBeLessThan(Number(/height="(\d+)"/.exec(rated)![1]));
  });

  test("text a person typed can't add markup", () => {
    const svg = reviewCard("octo", repo("a/one"), 4, `</text><script>alert("x")</script> & more`);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp; more");
  });

  test("a review holds at most four lines of text", () => {
    const svg = reviewCard("octo", repo("a/one"), null, "word ".repeat(300));
    expect(svg.match(/font-size="16"/g)).toHaveLength(4);
    expect(svg).toContain("Reviewed by octo");
  });

  test("a poster puts dark ink on a light colour and light ink on a dark one", () => {
    expect(topFourCard("octo", [repo("a/light", { color: "#f1e05a" })])).toContain('fill="#14171a">light</text>');
    expect(topFourCard("octo", [repo("a/dark", { color: "#083fa1" })])).toContain('fill="#ffffff">dark</text>');
    expect(topFourCard("octo", [repo("a/none", { color: null })])).toContain('fill="#3a4049"');
  });

  test("a List card shows the name, the count and at most six posters", () => {
    const svg = listCard("octo", "Run your server", 28, Array.from({ length: 8 }, (_, i) => repo(`o/r${i}`)));
    expect(svg).toContain(">Run your server</text>");
    expect(svg).toContain("A list by octo · 28 repos");
    expect(svg).toContain(">r5</text>");
    expect(svg).not.toContain(">r6</text>");
  });

  test("a card that can't be drawn says why", () => {
    expect(messageCard("This card has no repos to show.")).toContain("This card has no repos to show.");
  });
});
