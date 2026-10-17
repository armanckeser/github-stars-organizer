import { describe, expect, test } from "vitest";
import { captureLocalLayer, planLocalFill, type LocalRows } from "./local-layer";
import type { Repo } from "./collections";
import type { LocalLayer } from "./backup";

function repo(githubId: number, overrides: Partial<Repo> = {}): Repo {
  return {
    id: String(githubId), github_id: githubId, node_id: `R_${githubId}`, name: `project-${githubId}`,
    full_name: `greendale/project-${githubId}`, owner: "greendale", description: null, url: "", homepage: null,
    language: null, stars: 1, forks: 0, topics: null, starred_at: "2026-01-01T00:00:00Z", is_archived: false,
    pushed_at: null, created_at: null, notes: null, usefulness_rating: null, imported_at: "2026-10-01T00:00:00Z",
    health_score: null, health_data: null, health_refreshed_at: null,
    ...overrides,
  };
}

function rows(partial: Partial<LocalRows>): LocalRows {
  return { repos: [], tags: [], repo_tags: [], ...partial };
}

function counter() {
  let next = 0;
  return () => `new-${++next}`;
}

describe("captureLocalLayer", () => {
  test("captureLocalLayer_keys_tags_by_github_id_and_skips_repos_with_nothing_to_keep", () => {
    // Regression guarded: a backup keyed tags to this browser's row ids, which mean
    // nothing once the repo is re-imported, so restored tags attached to nothing.
    const layer = captureLocalLayer(rows({
      repos: [repo(1, { notes: "Six seasons and a movie", usefulness_rating: 5 }), repo(2)],
      tags: [{ id: "t-1", name: "Dreamatorium", color: "#aa00ff" }],
      repo_tags: [{ id: "rt-1", repo_id: "2", tag_id: "t-1" }],
    }));

    expect(layer).toEqual({
      repos: [{ githubId: 1, notes: "Six seasons and a movie", usefulnessRating: 5 }],
      tags: [{ id: "t-1", name: "Dreamatorium", color: "#aa00ff" }],
      repoTags: [{ githubId: 2, tagId: "t-1" }],
    });
  });
});

describe("planLocalFill", () => {
  const layer: LocalLayer = {
    repos: [{ githubId: 1, notes: "Old note", usefulnessRating: 2 }, { githubId: 2, notes: "Pop pop", usefulnessRating: 4 }],
    tags: [{ id: "t-old", name: "Dreamatorium", color: "#aa00ff" }, { id: "t-paint", name: "Paintball", color: "#ff0000" }],
    repoTags: [{ githubId: 1, tagId: "t-old" }, { githubId: 2, tagId: "t-paint" }, { githubId: 999, tagId: "t-paint" }],
  };

  test("planLocalFill_keeps_newer_notes_and_ratings_when_the_browser_already_has_them", () => {
    // Regression guarded: restoring an old file overwrote notes and ratings written
    // since, losing exactly the work the backup was meant to protect.
    const fill = planLocalFill(layer, rows({ repos: [repo(1, { notes: "New note", usefulness_rating: 5 }), repo(2)] }), counter());

    expect(fill.repos).toEqual([{ id: "2", notes: "Pop pop", usefulness_rating: 4 }]);
  });

  test("planLocalFill_reuses_a_tag_with_the_same_name_and_links_only_starred_repos", () => {
    const stored = rows({
      repos: [repo(1), repo(2)],
      tags: [{ id: "t-here", name: "DREAMATORIUM", color: "#000000" }],
      repo_tags: [{ id: "rt-1", repo_id: "1", tag_id: "t-here" }],
    });

    const fill = planLocalFill(layer, stored, counter());

    expect(fill.tags).toEqual([{ id: "new-1", name: "Paintball", color: "#ff0000" }]);
    expect(fill.repo_tags).toEqual([{ id: "new-2", repo_id: "2", tag_id: "new-1" }]);
  });

  test("planLocalFill_adds_nothing_when_the_browser_already_has_everything", () => {
    const stored = rows({
      repos: [repo(1, { notes: "Old note", usefulness_rating: 2 }), repo(2, { notes: "Pop pop", usefulness_rating: 4 })],
      tags: [{ id: "a", name: "Dreamatorium", color: "#aa00ff" }, { id: "b", name: "Paintball", color: "#ff0000" }],
      repo_tags: [{ id: "x", repo_id: "1", tag_id: "a" }, { id: "y", repo_id: "2", tag_id: "b" }],
    });

    expect(planLocalFill(layer, stored, counter())).toEqual({ repos: [], tags: [], repo_tags: [] });
  });
});
