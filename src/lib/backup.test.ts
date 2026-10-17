import { describe, expect, test } from "vitest";
import { BACKUP_FORMAT, BACKUP_VERSION, changeCount, planRestore, type Backup, type GitHubSnapshot } from "./backup";
import type { GitHubList, ListRepo } from "../../server/github-lists";

function repo(githubId: number, fullName: string): ListRepo {
  return { githubId, nodeId: `R_${githubId}`, fullName };
}

const STUDY_GROUP = repo(1, "greendale/study-group");
const INSPECTOR_SPACETIME = repo(2, "abed/inspector-spacetime");
const EL_TIGRE = repo(3, "chang/el-tigre");

function star(listRepo: ListRepo, starredAt = "2026-01-01T00:00:00Z") {
  return { ...listRepo, starredAt };
}

function list(id: string, name: string, repos: ListRepo[], isPrivate = false): GitHubList {
  return { id, name, description: null, isPrivate, createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", repos };
}

function backupOf(snapshot: GitHubSnapshot): Backup {
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: "2026-10-01T00:00:00.000Z", login: "abed-nadir", reason: "launch",
    stars: snapshot.stars,
    lists: snapshot.lists.map(({ id, name, description, isPrivate, repos }) => ({ id, name, description, isPrivate, repos })),
  };
}

describe("planRestore", () => {
  test("planRestore_changes_nothing_when_github_only_gained_stars_and_lists_since_the_backup", () => {
    // Regression guarded: restoring an old backup unstarred repos starred since, or
    // deleted Lists made since, wiping out newer work to match the file.
    const backup = backupOf({ stars: [star(STUDY_GROUP)], lists: [list("UL_1", "Paintball", [STUDY_GROUP])] });
    const now: GitHubSnapshot = {
      stars: [star(STUDY_GROUP), star(EL_TIGRE)],
      lists: [list("UL_1", "Paintball", [STUDY_GROUP, EL_TIGRE]), list("UL_9", "Pillow Fort", [EL_TIGRE])],
    };

    const plan = planRestore(backup, now);

    expect(plan).toEqual({ restar: [], recreateLists: [], addToLists: [] });
    expect(changeCount(plan)).toBe(0);
  });

  test("planRestore_restars_a_repo_and_readds_it_to_its_lists_when_it_was_unstarred", () => {
    // Regression guarded: unstarring also drops a repo from its Lists, and a restore
    // that only re-starred it left the Lists missing it.
    const backup = backupOf({
      stars: [star(STUDY_GROUP), star(INSPECTOR_SPACETIME, "2025-06-01T00:00:00Z")],
      lists: [list("UL_1", "Paintball", [STUDY_GROUP, INSPECTOR_SPACETIME])],
    });
    const now: GitHubSnapshot = { stars: [star(STUDY_GROUP)], lists: [list("UL_1", "Paintball", [STUDY_GROUP])] };

    const plan = planRestore(backup, now);

    expect(plan.restar).toEqual([star(INSPECTOR_SPACETIME, "2025-06-01T00:00:00Z")]);
    expect(plan.recreateLists).toEqual([]);
    expect(plan.addToLists).toEqual([{ repo: INSPECTOR_SPACETIME, listId: "UL_1", listName: "Paintball" }]);
  });

  test("planRestore_recreates_a_deleted_list_with_every_member_and_its_privacy", () => {
    const backup = backupOf({
      stars: [star(STUDY_GROUP), star(EL_TIGRE)],
      lists: [list("UL_2", "Darkest Timeline", [STUDY_GROUP, EL_TIGRE], true)],
    });
    const now: GitHubSnapshot = { stars: [star(STUDY_GROUP), star(EL_TIGRE)], lists: [] };

    const plan = planRestore(backup, now);

    expect(plan.recreateLists.map((recreated) => [recreated.name, recreated.isPrivate])).toEqual([["Darkest Timeline", true]]);
    expect(plan.addToLists).toEqual([
      { repo: STUDY_GROUP, listId: "UL_2", listName: "Darkest Timeline" },
      { repo: EL_TIGRE, listId: "UL_2", listName: "Darkest Timeline" },
    ]);
  });

  test("planRestore_matches_lists_by_id_not_name_when_a_list_was_renamed", () => {
    // Renamed on github.com since the backup: the same List, so nothing is recreated.
    const backup = backupOf({ stars: [star(STUDY_GROUP)], lists: [list("UL_1", "Paintball", [STUDY_GROUP])] });
    const now: GitHubSnapshot = { stars: [star(STUDY_GROUP)], lists: [list("UL_1", "Paintball Assassin", [STUDY_GROUP])] };

    expect(changeCount(planRestore(backup, now))).toBe(0);
  });
});
