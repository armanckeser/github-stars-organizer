import { describe, expect, test } from "vitest";
import { CARD_WIDTH, listCard, messageCard, nameLines, reviewCard, runPreviewCard, topFourCard, wrap, type CardRepo, type ShareCard, type ShelfPlayer } from "./cards.ts";
import { defaultCharacter } from "./character.ts";

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

describe("the run's share picture", () => {
  const player = (cards: ShareCard[]): ShelfPlayer => ({
    login: "troybarnes",
    name: "Troy",
    klass: "Scout",
    look: defaultCharacter("troybarnes").look,
    avatar: null,
    cards,
  });
  const card = (name: string, cost = 1): ShareCard => ({ name, cost, sets: ["python"], avatar: null });

  test("names the player and their first four cards, at link-preview size, when a player is given", () => {
    // Regression guarded: a /run?me= link previewed someone else's run, or a fifth card ran off the picture.
    const svg = runPreviewCard(player([card("dreamatorium"), card("paintball"), card("blanketfort"), card("koosh"), card("chang")]), "Space Grotesk");
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain(`aria-label="Play a run with troybarnes&#39;s stars"`);
    expect(svg).toContain(">troybarnes</text>");
    expect(svg).toContain(">Scout · Troy</text>");
    for (const name of ["dreamatorium", "paintball", "blanketfort", "koosh"]) expect(svg).toContain(`>${name}</text>`);
    expect(svg).not.toContain(">chang</text>");
    expect(svg).toContain(">Fight other teams. 5 wins finishes a run, 3 losses ends one.</text>");
  });

  test("colours a card's border with its cost's tier and nothing else, when cards of two costs are shown", () => {
    // Regression guarded: the tier colour leaked onto the picture as decoration, or a card lost its tier.
    const svg = runPreviewCard(player([card("dreamatorium", 5), card("paintball", 2)]), "Space Grotesk");
    expect(svg.match(/#e3b341/g)).toHaveLength(1);
    expect(svg.match(/#3fb950/g)).toHaveLength(1);
    expect(svg).toContain('stroke="#e3b341" stroke-width="2"');
    expect(svg).not.toContain("Gradient");
  });

  test("shows the run for anyone, a blank card of each cost and no username, when no player is given", () => {
    const svg = runPreviewCard(null, "Space Grotesk");
    expect(svg).toContain('aria-label="Play a run with your GitHub stars"');
    expect(svg).toContain(">Build a team from your GitHub stars. No sign-in.</text>");
    for (const tier of ["#8b949e", "#3fb950", "#4a90d9", "#a371f7", "#e3b341"]) expect(svg).toContain(`stroke="${tier}"`);
    expect(svg).not.toContain("troybarnes");
  });

  test("a repo name can't add markup to the picture", () => {
    const svg = runPreviewCard(player([card("<script>x")]), "Space Grotesk");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;x");
  });
});
