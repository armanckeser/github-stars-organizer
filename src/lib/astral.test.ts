import { describe, expect, test } from "vitest";
import {
  applyAstralImport, defaultListTags, GITHUB_LIST_LIMIT, InvalidAstralExportError, newListCount, parseAstralExport,
  planAstralImport, type AstralStar, type AstralWriter, type StoredLists,
} from "./astral";
import type { Repo, StarList } from "./collections";

function repo(githubId: number, overrides: Partial<Repo> = {}): Repo {
  return {
    id: `r-${githubId}`, github_id: githubId, node_id: `R_${githubId}`, name: `project-${githubId}`,
    full_name: `greendale/project-${githubId}`, owner: "greendale", description: null, url: "", homepage: null,
    language: null, stars: 1, forks: 0, topics: null, starred_at: "2026-01-01T00:00:00Z", is_archived: false,
    pushed_at: null, created_at: null, notes: null, usefulness_rating: null, imported_at: "2026-10-01T00:00:00Z",
    health_score: null, health_data: null, health_refreshed_at: null,
    ...overrides,
  };
}

function list(id: string, name: string): StarList {
  return { id, github_list_id: `UL_${id}`, name, description: null, is_private: false, created_at: "", updated_at: "" };
}

function star(repoId: number, tags: string[], notes: string | null = null): AstralStar {
  return { repo_id: repoId, notes, tags: tags.map((name) => ({ name })) };
}

function stored(partial: Partial<StoredLists>): StoredLists {
  return { repos: [], lists: [], list_items: [], ...partial };
}

describe("parseAstralExport", () => {
  test("parseAstralExport_reads_astrals_export_and_ignores_fields_it_does_not_use", () => {
    const exported = [{
      id: 7, user_id: 3, repo_id: 101, notes: "Six seasons", autotagged_by_topic: 0, created_at: "", updated_at: "",
      tags: [{ id: 5, user_id: 3, name: "Dreamatorium", sort_order: 0, pivot: { star_id: 7, tag_id: 5 } }],
    }];

    expect(parseAstralExport(exported)).toEqual([{ repo_id: 101, notes: "Six seasons", tags: [{ name: "Dreamatorium" }] }]);
  });

  test("parseAstralExport_explains_an_empty_export_instead_of_importing_nothing", () => {
    // Astral exports only tagged or annotated stars, so an untagged account gets `[]`
    // (astralapp/astral#258), which looked like a broken import.
    expect(() => parseAstralExport([])).toThrow(/only exports stars that have a tag or a note/);
  });

  test("parseAstralExport_rejects_a_file_that_is_not_an_astral_export", () => {
    expect(() => parseAstralExport({ format: "github-stars-organizer-backup" })).toThrow(InvalidAstralExportError);
  });
});

describe("planAstralImport", () => {
  test("planAstralImport_reuses_a_list_with_the_same_name_and_skips_repos_already_in_it", () => {
    // Regression guarded: importing made a second "Paintball" List next to the one
    // the user had, and re-added repos already in it.
    const paintball = list("l-1", "Paintball");
    const plan = planAstralImport(
      [star(1, ["paintball"]), star(2, ["Paintball"])],
      stored({ repos: [repo(1), repo(2)], lists: [paintball], list_items: [{ id: "i", list_id: "l-1", repo_id: "r-1", position: 0, added_at: "" }] }),
      new Set(["paintball"]),
    );

    expect(plan.tags).toEqual([{ name: "paintball", existingList: paintball, toAdd: [repo(2)], starred: 2 }]);
  });

  test("planAstralImport_counts_repos_no_longer_starred_instead_of_attaching_them", () => {
    const plan = planAstralImport([star(1, ["Paintball"]), star(99, ["Paintball"], "gone")], stored({ repos: [repo(1)] }), new Set(["Paintball"]));

    expect(plan.notStarred).toBe(1);
    expect(plan.tags[0].toAdd).toEqual([repo(1)]);
    expect(plan.notes).toEqual([]);
  });

  test("planAstralImport_appends_the_astral_note_below_the_repos_own_note", () => {
    const plan = planAstralImport([star(1, [], "From Astral")], stored({ repos: [repo(1, { notes: "Mine" })] }), new Set());

    expect(plan.notes).toEqual([{ repo: repo(1, { notes: "Mine" }), notes: "Mine\n\nFrom Astral" }]);
  });

  test("planAstralImport_changes_no_notes_when_the_same_file_is_imported_twice", () => {
    // Regression guarded: a second import appended the Astral note again.
    const plan = planAstralImport(
      [star(1, ["Pillow Fort"], "From Astral")],
      stored({ repos: [repo(1, { notes: "Mine\n\nFrom Astral\n\nAstral tags: Pillow Fort" })] }),
      new Set(),
    );

    expect(plan.notes).toEqual([]);
  });

  test("planAstralImport_keeps_tags_that_do_not_become_lists_as_a_line_in_the_notes", () => {
    // Regression guarded: tags past GitHub's List limit were silently dropped.
    const plan = planAstralImport([star(1, ["Paintball", "Pillow Fort", "Blanket Fort"])], stored({ repos: [repo(1)] }), new Set(["Paintball"]));

    expect(plan.notes).toEqual([{ repo: repo(1), notes: "Astral tags: Pillow Fort, Blanket Fort" }]);
  });
});

describe("defaultListTags", () => {
  test("defaultListTags_fills_githubs_free_list_slots_with_the_most_used_tags", () => {
    const fullAccount = Array.from({ length: GITHUB_LIST_LIMIT - 1 }, (_, index) => list(`l-${index}`, `List ${index}`));
    const plan = planAstralImport(
      [star(1, ["Paintball", "Pillow Fort", "List 3"]), star(2, ["Paintball"])],
      stored({ repos: [repo(1), repo(2)], lists: fullAccount }),
      new Set(),
    );

    const selected = defaultListTags(plan);

    expect([...selected].sort()).toEqual(["List 3", "Paintball"]);
    expect(newListCount(plan, selected)).toBe(1);
  });
});

describe("applyAstralImport", () => {
  function fakeWriter(failOn: number[] = []) {
    const writes: string[] = [];
    const writer: AstralWriter = {
      createList: async (name) => {
        writes.push(`create ${name}`);
        return list(`new-${name}`, name);
      },
      addToList: async (target, added) => {
        if (failOn.includes(added.github_id)) throw new Error("GitHub said no");
        writes.push(`add ${added.github_id} to ${target.id}`);
      },
      setNotes: async (target, notes) => {
        writes.push(`notes ${target.github_id}: ${notes}`);
      },
    };
    return { writer, writes };
  }

  test("applyAstralImport_creates_each_new_list_once_and_writes_only_the_chosen_tags", async () => {
    const paintball = list("l-1", "Paintball");
    const asLists = new Set(["Paintball", "Pillow Fort"]);
    const plan = planAstralImport(
      [star(1, ["Paintball", "Pillow Fort", "Blanket Fort"]), star(2, ["Pillow Fort"])],
      stored({ repos: [repo(1), repo(2)], lists: [paintball] }),
      asLists,
    );
    const { writer, writes } = fakeWriter();
    const progress: number[] = [];

    const result = await applyAstralImport(plan, asLists, writer, ({ done }) => progress.push(done));

    expect(writes).toEqual([
      "create Pillow Fort", "add 1 to new-Pillow Fort", "add 2 to new-Pillow Fort",
      "add 1 to l-1",
      "notes 1: Astral tags: Blanket Fort",
    ]);
    expect(result).toEqual({ listsCreated: 1, added: 3, notes: 1, failed: [] });
    expect(progress).toEqual([1, 2, 3, 4, 5]);
  });

  test("applyAstralImport_keeps_going_after_github_refuses_one_repo", async () => {
    const asLists = new Set(["Paintball"]);
    const plan = planAstralImport([star(1, ["Paintball"]), star(2, ["Paintball"])], stored({ repos: [repo(1), repo(2)] }), asLists);
    const { writer, writes } = fakeWriter([1]);

    const result = await applyAstralImport(plan, asLists, writer);

    expect(writes).toEqual(["create Paintball", "add 2 to new-Paintball"]);
    expect(result.failed).toEqual([{ what: 'greendale/project-1 in "Paintball"', reason: "GitHub said no" }]);
  });
});
