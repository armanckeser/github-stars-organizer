import { afterEach, describe, expect, test } from "vitest";
import { fetchPublicLists, fetchViewerLists, toPublicList, UserNotFoundError } from "./github-lists.ts";
import { createGitHubClient } from "./github.ts";
import { startFakeGitHub, fakeRepoName, UNKNOWN_LOGIN, type FakeGitHub, type FakeSeed } from "../scripts/fake-github.ts";

let fake: FakeGitHub | null = null;

async function githubWith(seed: FakeSeed) {
  fake = await startFakeGitHub(seed);
  return createGitHubClient("fake-token", fake.url);
}

afterEach(async () => {
  await fake?.close();
  fake = null;
});

const range = (length: number) => Array.from({ length }, (_, index) => index);

describe("fetchViewerLists", () => {
  test("fetchViewerLists_reads_items_one_list_at_a_time_when_an_account_has_dozens_of_lists", async () => {
    // Regression guarded: one query asking for every List's items timed out with a
    // 502 on accounts with a couple of dozen Lists, so the import failed outright.
    const github = await githubWith({
      repoCount: 30,
      lists: range(30).map((index) => ({ name: `Study Group ${index}`, repoIndexes: [index] })),
    });

    const lists = await fetchViewerLists(github.graphql);

    expect(lists).toHaveLength(30);
    expect(lists[29].repos.map((repo) => repo.githubId)).toEqual([1029]);
  });

  test("fetchViewerLists_reads_every_item_when_a_list_holds_more_than_one_page", async () => {
    // Regression guarded: the self-host import asked for items(first: 100) and never
    // the next page, so a 250-repo List arrived with 100 repos.
    const github = await githubWith({ repoCount: 250, lists: [{ name: "Paintball", repoIndexes: range(250) }] });

    const [paintball] = await fetchViewerLists(github.graphql);

    expect(paintball.repos).toHaveLength(250);
    expect(paintball.repos[0]).toEqual({ githubId: 1000, nodeId: "R_1000", fullName: fakeRepoName(0) });
    expect(paintball.repos[249]).toEqual({ githubId: 1249, nodeId: "R_1249", fullName: fakeRepoName(249) });
  });

  test("fetchViewerLists_reads_every_list_when_there_are_more_than_one_page", async () => {
    // Regression guarded: lists(first: 100) dropped every List after the 100th.
    const github = await githubWith({ repoCount: 1, lists: range(105).map((index) => ({ name: `Study group ${index}`, repoIndexes: [] })) });

    const lists = await fetchViewerLists(github.graphql);

    expect(lists).toHaveLength(105);
    expect(lists[104].name).toBe("Study group 104");
  });

  test("fetchViewerLists_includes_private_lists_when_reading_the_token_owner", async () => {
    const github = await githubWith({ repoCount: 3, lists: [{ name: "Darkest Timeline", isPrivate: true, repoIndexes: [2] }] });

    const lists = await fetchViewerLists(github.graphql);

    expect(lists.map((list) => [list.name, list.isPrivate])).toEqual([["Darkest Timeline", true]]);
  });
});

describe("fetchPublicLists", () => {
  test("fetchPublicLists_drops_private_lists_when_reading_another_user", async () => {
    const github = await githubWith({
      repoCount: 3,
      lists: [{ name: "Darkest Timeline", isPrivate: true, repoIndexes: [0] }, { name: "Paintball", repoIndexes: [1] }],
    });

    const lists = await fetchPublicLists(github.graphql, "abed-nadir");

    expect(lists.map((list) => list.name)).toEqual(["Paintball"]);
  });

  test("fetchPublicLists_raises_UserNotFoundError_when_the_login_does_not_exist", async () => {
    const github = await githubWith({ repoCount: 0, lists: [] });

    await expect(fetchPublicLists(github.graphql, UNKNOWN_LOGIN)).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe("toPublicList", () => {
  test("toPublicList_keeps_the_worker_response_shape_the_deployed_demo_reads", () => {
    // Regression guarded: changing GitHubList changed the Worker's JSON, and the
    // already-deployed demo (which reads repoGithubIds) lost every List.
    expect(toPublicList({
      id: "UL_1", name: "Paintball", description: null, isPrivate: false,
      createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
      repos: [{ githubId: 1000, nodeId: "R_1000", fullName: "greendale/project-0" }],
    })).toEqual({
      id: "UL_1", name: "Paintball", description: null,
      createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", repoGithubIds: [1000],
    });
  });
});
