import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createGitHubClient } from "../../server/github.ts";
import { startFakeGitHub, type FakeGitHub } from "../../scripts/fake-github.ts";
import { createBackupStore } from "./backup-store.ts";
import { BackupFailedError, launch } from "./launch.ts";

let fake: FakeGitHub;
let home: string;

beforeEach(async () => {
  fake = await startFakeGitHub({
    repoCount: 230,
    lists: [
      { name: "Paintball", repoIndexes: Array.from({ length: 150 }, (_, index) => index) },
      { name: "Darkest Timeline", isPrivate: true, repoIndexes: [149] },
    ],
  });
  home = await mkdtemp(path.join(tmpdir(), "stars-launch-"));
});

afterEach(async () => {
  await fake.close();
  await rm(home, { recursive: true, force: true });
});

function options() {
  return { github: createGitHubClient("fake-token", fake.url), login: "abed-nadir", home, appDir: home, port: 5185 };
}

describe("launch", () => {
  test("launch_backs_up_every_star_and_every_list_item_before_the_server_exists", async () => {
    // Regression guarded: the app could change GitHub before any backup existed, or
    // the backup kept only the first page of stars or List items.
    const { store, launchBackup } = await launch(options());

    const saved = await store.read(launchBackup.id);
    expect(saved.reason).toBe("launch");
    expect(saved.stars).toHaveLength(230);
    expect(saved.lists.map((list) => [list.name, list.isPrivate, list.repos.length])).toEqual([
      ["Paintball", false, 150], ["Darkest Timeline", true, 1],
    ]);
    expect(saved.lists[0].repos[149]).toEqual({ githubId: 1149, nodeId: "R_1149", fullName: "dean/project-149" });
  });

  test("launch_starts_nothing_and_writes_no_backup_when_github_cannot_be_read", async () => {
    fake.failNext("starredRepositories");

    await expect(launch(options())).rejects.toBeInstanceOf(BackupFailedError);
    expect(await createBackupStore(home, "abed-nadir").list()).toEqual([]);
  });
});
