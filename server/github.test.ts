import { afterEach, describe, expect, test } from "vitest";
import { changeRepoList, createGitHubClient, GitHubError, type GitHubClient } from "./github.ts";
import { startFakeGitHub, type FakeGitHub } from "../scripts/fake-github.ts";

let fake: FakeGitHub;

// Repo 140 sits past the first page of Paintball's 150 items: the case a local
// copy cut at 100 items gets wrong.
const DEEP_REPO = { repoNodeId: "R_1140", repoGithubId: 1140 };

async function start(): Promise<GitHubClient> {
  fake = await startFakeGitHub({
    repoCount: 160,
    lists: [
      { name: "Paintball", repoIndexes: Array.from({ length: 150 }, (_, index) => index) },
      { name: "Darkest Timeline", isPrivate: true, repoIndexes: [140] },
      { name: "Troy and Abed in the Morning", repoIndexes: [1] },
      { name: "Pillow Fort", repoIndexes: [] },
    ],
  });
  return createGitHubClient("fake-token", fake.url);
}

function listsHolding(nodeId: string): string[] {
  return fake.lists.filter((list) => list.itemIds.includes(nodeId)).map((list) => list.name).sort();
}

afterEach(async () => {
  // A test that takes GitHub offline has closed it already.
  await fake.close().catch(() => {});
});

describe("changeRepoList", () => {
  test("changeRepoList_keeps_the_repos_other_lists_when_adding_it_to_one_more", async () => {
    // Regression guarded: the full set sent to updateUserListsForItem was built from
    // Postgres or the browser, which can lack List items past the first 100, so adding
    // a repo to a List silently removed it from its other GitHub Lists.
    const github = await start();

    const listIds = await changeRepoList(github, { ...DEEP_REPO, githubListId: fake.listNamed("Troy and Abed in the Morning").id, change: "add" });

    expect(listsHolding("R_1140")).toEqual(["Darkest Timeline", "Paintball", "Troy and Abed in the Morning"]);
    expect(listIds.sort()).toEqual(["UL_1", "UL_2", "UL_3"]);
  });

  test("changeRepoList_removes_only_that_list_when_removing", async () => {
    const github = await start();

    await changeRepoList(github, { ...DEEP_REPO, githubListId: fake.listNamed("Darkest Timeline").id, change: "remove" });

    expect(listsHolding("R_1140")).toEqual(["Paintball"]);
  });

  test("changeRepoList_lands_both_changes_when_two_run_at_once_for_one_repo", async () => {
    // Regression guarded: two changes to one repo both read the old set, and the
    // second write replaced the first, so one List change vanished.
    const github = await start();

    await Promise.all([
      changeRepoList(github, { ...DEEP_REPO, githubListId: fake.listNamed("Troy and Abed in the Morning").id, change: "add" }),
      changeRepoList(github, { ...DEEP_REPO, githubListId: fake.listNamed("Pillow Fort").id, change: "add" }),
    ]);

    expect(listsHolding("R_1140")).toEqual(["Darkest Timeline", "Paintball", "Pillow Fort", "Troy and Abed in the Morning"]);
  });

  test("changeRepoList_writes_nothing_when_the_repo_is_already_in_the_list", async () => {
    const github = await start();

    await changeRepoList(github, { ...DEEP_REPO, githubListId: fake.listNamed("Paintball").id, change: "add" });

    expect(fake.writes).toEqual([]);
  });

  test("changeRepoList_raises_404_and_changes_nothing_when_the_list_was_deleted_on_github", async () => {
    const github = await start();
    const change = changeRepoList(github, { ...DEEP_REPO, githubListId: "UL_gone", change: "add" });

    await expect(change).rejects.toSatisfy((error) => error instanceof GitHubError && error.status === 404);
    expect(listsHolding("R_1140")).toEqual(["Darkest Timeline", "Paintball"]);
  });

  test("changeRepoList_leaves_membership_unchanged_and_keeps_working_when_github_fails_a_write", async () => {
    const github = await start();
    fake.failNext("updateUserListsForItem");

    await expect(
      changeRepoList(github, { ...DEEP_REPO, githubListId: fake.listNamed("Pillow Fort").id, change: "add" }),
    ).rejects.toBeInstanceOf(GitHubError);
    expect(listsHolding("R_1140")).toEqual(["Darkest Timeline", "Paintball"]);

    await changeRepoList(github, { ...DEEP_REPO, githubListId: fake.listNamed("Pillow Fort").id, change: "add" });
    expect(listsHolding("R_1140")).toEqual(["Darkest Timeline", "Paintball", "Pillow Fort"]);
  });
});

describe("createGitHubClient", () => {
  test("createGitHubClient_says_github_cant_be_reached_instead_of_fetch_failed_when_offline", async () => {
    // Regression guarded: the error toast read "fetch failed" when GitHub was unreachable.
    const github = await start();
    await fake.close();

    const error = await github.graphql("query { viewer { login } }").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).message).toBe("GitHub can't be reached. Check your internet connection.");
  });
});
