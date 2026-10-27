import { describe, expect, it } from "vitest";
import { buildQueries, findSimilar, readmeLead, specificTopics, type SearchItem } from "./similar.ts";

const NOW = Date.parse("2026-10-26T00:00:00Z");

function item(full_name: string, topics: string[], extra: Partial<SearchItem> = {}): SearchItem {
  return {
    full_name, html_url: `https://github.com/${full_name}`, description: null, language: null, topics,
    stargazers_count: 1000, pushed_at: "2026-10-01T00:00:00Z", archived: false, fork: false, ...extra,
  };
}

const turndown = {
  full_name: "mixmark-io/turndown",
  description: "🛏 An HTML to Markdown converter written in JavaScript",
  language: "JavaScript",
  topics: "browser,commonmark,gfm,html,html-to-markdown,javascript,markdown,node",
  stars: 11000,
};

describe("specificTopics", () => {
  it("puts topics the description uses first and drops languages and broad labels", () => {
    expect(specificTopics(turndown)[0]).toBe("html-to-markdown");
    expect(specificTopics(turndown)).not.toContain("javascript");
    expect(specificTopics(turndown)).not.toContain("browser");
  });

  it("leaves out the repo's own name, which only finds add-ons for it", () => {
    const ripgrep = { full_name: "BurntSushi/ripgrep", description: "ripgrep recursively searches directories for a regex pattern", language: "Rust", topics: "ripgrep,regex,grep", stars: 1 };
    expect(specificTopics(ripgrep)).not.toContain("ripgrep");
  });

  it("uses the owner when the repo name is generic", () => {
    const httpie = { full_name: "httpie/cli", description: "HTTPie CLI: human-friendly HTTP client", language: "Python", topics: "httpie,http-client", stars: 1 };
    expect(specificTopics(httpie)).toEqual(["http-client"]);
    expect(buildQueries(httpie).at(-1)?.q).toMatch(/^httpie in:readme/);
  });
});

describe("buildQueries", () => {
  it("never makes more than three searches", () => {
    expect(buildQueries(turndown).length).toBeLessThanOrEqual(3);
  });

  it("raises the star bar for popular repos", () => {
    expect(buildQueries(turndown)[0].q).toContain("stars:>=55");
    expect(buildQueries({ ...turndown, stars: 40 })[0].q).toContain("stars:>=10");
  });
});

describe("findSimilar", () => {
  it("ranks repos that share specific topics over popular ones that share broad topics", async () => {
    const results = await findSimilar(turndown, async (q) => !q.startsWith("topic:") ? [] : [
      item("big/popular", ["javascript", "browser"], { stargazers_count: 200_000, description: "A JavaScript framework" }),
      item("johannes/html-to-markdown", ["html-to-markdown", "markdown"], { description: "Convert HTML to Markdown" }),
    ], NOW);
    expect(results.map((r) => r.full_name)).toEqual(["johannes/html-to-markdown"]);
    expect(results[0].shared_topics[0]).toBe("html-to-markdown");
  });

  it("drops the repo itself, forks, archived repos, add-ons and link roundups", async () => {
    const results = await findSimilar(turndown, async () => [
      item("mixmark-io/turndown", ["html-to-markdown"]),
      item("someone/fork", ["html-to-markdown"], { fork: true }),
      item("someone/old", ["html-to-markdown"], { archived: true }),
      item("someone/turndown-plugin-gfm", ["html-to-markdown", "markdown"], { description: "Turndown plugin to add GFM" }),
      item("someone/awesome-markdown", ["html-to-markdown", "markdown"], { description: "A curated list of Markdown tools" }),
      item("good/converter", ["html-to-markdown", "markdown"], { description: "HTML to Markdown converter" }),
    ], NOW);
    expect(results.map((r) => r.full_name)).toEqual(["good/converter"]);
  });

  it("makes its searches one after another", async () => {
    let running = 0;
    let most = 0;
    await findSimilar(turndown, async () => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return [];
    }, NOW);
    expect(most).toBe(1);
  });
});

describe("readmeLead", () => {
  it("keeps the prose and drops badges, code and link targets", () => {
    const lead = readmeLead("[![CI](https://x/badge.svg)](https://x)\n# bat\nA [viewer](https://y) with syntax highlighting.\n```sh\nbrew install bat\n```");
    expect(lead).toContain("A viewer with syntax highlighting.");
    expect(lead).not.toContain("badge");
    expect(lead).not.toContain("brew");
  });
});
