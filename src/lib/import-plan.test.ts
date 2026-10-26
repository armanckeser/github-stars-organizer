import { describe, expect, test } from "vitest";
import { planImport, type StoredRows } from "./import-plan";
import type { Repo, StarList, ListItem, RepoTag } from "./collections";
import type { GitHubRepo, ImportResponse } from "./local-api";
import type { GitHubList } from "../../server/github-lists";

const IMPORTED_AT = "2026-10-17T12:00:00.000Z";

function githubRepo(githubId: number, fullName: string, overrides: Partial<GitHubRepo> = {}): GitHubRepo {
  const [owner, name] = fullName.split("/");
  return {
    github_id: githubId, node_id: `R_${githubId}`, name, full_name: fullName, owner,
    description: null, url: `https://github.com/${fullName}`, homepage: null, language: "TypeScript",
    stars: 100, forks: 5, topics: null, starred_at: "2026-01-01T00:00:00Z", is_archived: false,
    pushed_at: "2026-09-01T00:00:00Z", created_at: "2020-01-01T00:00:00Z",
    ...overrides,
  };
}

function storedRepo(github: GitHubRepo, overrides: Partial<Repo> = {}): Repo {
  return {
    ...github, id: String(github.github_id), notes: null, usefulness_rating: null,
    imported_at: "2026-10-01T00:00:00Z", health_score: null, health_data: null, health_refreshed_at: null,
    ...overrides,
  };
}

function githubList(id: string, name: string, repoGithubIds: number[]): GitHubList {
  return {
    id, name, description: null, isPrivate: false,
    createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    repos: repoGithubIds.map((githubId) => ({ githubId, nodeId: `R_${githubId}`, fullName: `greendale/repo-${githubId}` })),
  };
}

function storedList(id: string, githubListId: string | null, name: string): StarList {
  return {
    id, github_list_id: githubListId, name, description: null, is_private: false,
    created_at: "2026-02-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  };
}

function item(id: string, listId: string, repoId: string): ListItem {
  return { id, list_id: listId, repo_id: repoId, position: 0, added_at: "2026-10-01T00:00:00Z" };
}

const STUDY_GROUP = githubRepo(1, "greendale/study-group");
const INSPECTOR_SPACETIME = githubRepo(2, "abed/inspector-spacetime");
const EL_TIGRE = githubRepo(3, "chang/el-tigre");

function stored(rows: Partial<StoredRows>): StoredRows {
  return { repos: [], lists: [], list_items: [], repo_tags: [], ...rows };
}

function incoming(repos: GitHubRepo[], lists: GitHubList[] = []): ImportResponse {
  return { repos, lists };
}

describe("planImport", () => {
  test("planImport_keeps_notes_rating_and_health_when_github_fields_change", () => {
    // Regression guarded: a launch-time import overwrote the user's notes, rating and
    // health score with blanks, losing everything the npx build is meant to keep.
    const before = storedRepo(STUDY_GROUP, {
      notes: "Six seasons and a movie", usefulness_rating: 5, health_score: 82,
      health_data: { commits: 40 }, health_refreshed_at: "2026-10-10T00:00:00Z",
    });

    const plan = planImport(stored({ repos: [before] }), incoming([{ ...STUDY_GROUP, stars: 250 }]), IMPORTED_AT);

    expect(plan.insert.repos).toEqual([]);
    expect(plan.update.repos).toEqual([{ ...before, stars: 250 }]);
  });

  test("planImport_changes_nothing_when_github_is_unchanged", () => {
    // Regression guarded: every launch re-inserted or rewrote every repo, duplicating
    // rows or churning the whole browser database.
    const list = storedList("L_paintball", "L_paintball", "Paintball");
    const plan = planImport(
      stored({
        repos: [storedRepo(STUDY_GROUP)],
        lists: [list],
        list_items: [item("L_paintball:1", "L_paintball", "1")],
      }),
      incoming([STUDY_GROUP], [githubList("L_paintball", "Paintball", [1])]),
      IMPORTED_AT,
    );

    expect(plan).toEqual({
      insert: { repos: [], lists: [], list_items: [] },
      update: { repos: [], lists: [] },
      remove: { repos: [], lists: [], list_items: [], repo_tags: [] },
    });
  });

  test("planImport_inserts_new_stars_with_empty_user_fields_when_first_seen", () => {
    const plan = planImport(stored({}), incoming([EL_TIGRE]), IMPORTED_AT);

    expect(plan.insert.repos).toEqual([{
      ...EL_TIGRE, id: "3", notes: null, usefulness_rating: null, imported_at: IMPORTED_AT,
      health_score: null, health_data: null, health_refreshed_at: null,
    }]);
  });

  test("planImport_removes_repo_with_its_tags_and_memberships_when_unstarred_on_github", () => {
    // Regression guarded: a repo unstarred on github.com stayed in the app forever,
    // or went but left its tag and List rows pointing at nothing.
    const tags: RepoTag[] = [
      { id: "rt-1", repo_id: "2", tag_id: "t-dreamatorium" },
      { id: "rt-2", repo_id: "1", tag_id: "t-dreamatorium" },
    ];
    const plan = planImport(
      stored({
        repos: [storedRepo(STUDY_GROUP), storedRepo(INSPECTOR_SPACETIME)],
        lists: [storedList("L_morning", "L_morning", "Troy and Abed in the Morning")],
        list_items: [item("L_morning:2", "L_morning", "2")],
        repo_tags: tags,
      }),
      incoming([STUDY_GROUP], [githubList("L_morning", "Troy and Abed in the Morning", [])]),
      IMPORTED_AT,
    );

    expect(plan.remove).toEqual({ repos: ["2"], lists: [], list_items: ["L_morning:2"], repo_tags: ["rt-1"] });
  });

  test("planImport_follows_github_membership_when_a_repo_moved_between_lists", () => {
    // Regression guarded: Lists edited on github.com never reached the browser, so the
    // next membership write sent a stale set back and undid the edit.
    const plan = planImport(
      stored({
        repos: [storedRepo(STUDY_GROUP)],
        lists: [storedList("L_paintball", "L_paintball", "Paintball"), storedList("local-uuid", "L_morning", "Morning")],
        list_items: [item("ui-uuid", "L_paintball", "1")],
      }),
      incoming([STUDY_GROUP], [githubList("L_paintball", "Paintball", []), githubList("L_morning", "Morning", [1])]),
      IMPORTED_AT,
    );

    expect(plan.remove.list_items).toEqual(["ui-uuid"]);
    expect(plan.insert.list_items).toEqual([
      { id: "local-uuid:1", list_id: "local-uuid", repo_id: "1", position: 0, added_at: "2026-10-01T00:00:00Z" },
    ]);
  });

  test("planImport_removes_list_and_its_items_when_deleted_on_github", () => {
    const plan = planImport(
      stored({
        repos: [storedRepo(STUDY_GROUP)],
        lists: [storedList("L_paintball", "L_paintball", "Paintball")],
        list_items: [item("L_paintball:1", "L_paintball", "1")],
      }),
      incoming([STUDY_GROUP], []),
      IMPORTED_AT,
    );

    expect(plan.remove.lists).toEqual(["L_paintball"]);
    expect(plan.remove.list_items).toEqual(["L_paintball:1"]);
  });

  test("planImport_keeps_a_list_whose_github_id_is_still_being_written_back", () => {
    // Regression guarded: a List created a moment before the launch import finished
    // has no GitHub id yet, and was deleted as if it were gone from GitHub.
    const pending = storedList("fresh-uuid", null, "Pillow Fort");
    const plan = planImport(stored({ lists: [pending] }), incoming([], []), IMPORTED_AT);

    expect(plan.remove.lists).toEqual([]);
  });

  test("planImport_skips_membership_when_the_repo_is_not_starred", () => {
    const plan = planImport(stored({}), incoming([], [githubList("L_paintball", "Paintball", [999])]), IMPORTED_AT);

    expect(plan.insert.lists.map((list) => list.id)).toEqual(["L_paintball"]);
    expect(plan.insert.list_items).toEqual([]);
  });

  test("planImport_marks_private_lists_private_when_github_says_so", () => {
    const plan = planImport(
      stored({}),
      incoming([], [{ ...githubList("L_darkest", "Darkest Timeline", []), isPrivate: true }]),
      IMPORTED_AT,
    );

    expect(plan.insert.lists[0].is_private).toBe(true);
  });
});
