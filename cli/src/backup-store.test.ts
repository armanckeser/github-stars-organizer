import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createBackupStore, BackupNotFoundError } from "./backup-store.ts";
import { BACKUP_FORMAT, BACKUP_VERSION, InvalidBackupError, parseBackup, type Backup, type BackupReason } from "../../src/lib/backup.ts";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "stars-backups-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function backup(reason: BackupReason, createdAt: string, login = "abed-nadir"): Backup {
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, login, reason,
    stars: [{ githubId: 1000, nodeId: "R_1000", fullName: "greendale/project-0", starredAt: "2026-01-01T00:00:00Z" }],
    lists: [{ id: "UL_1", name: "Paintball", description: null, isPrivate: false, repos: [{ githubId: 1000, nodeId: "R_1000", fullName: "greendale/project-0" }] }],
  };
}

function day(index: number): string {
  return new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString();
}

describe("backup store", () => {
  test("store_reads_back_exactly_what_it_saved_when_round_tripped", async () => {
    const store = createBackupStore(home, "abed-nadir");
    const saved = backup("manual", "2026-10-17T19:00:00.000Z");

    const summary = await store.save(saved);

    expect(summary).toEqual({ id: "2026-10-17T19-00-00.000Z-manual", reason: "manual", createdAt: "2026-10-17T19:00:00.000Z", stars: 1, lists: 1 });
    expect(await store.read(summary.id)).toEqual(saved);
  });

  test("store_keeps_the_newest_30_launch_backups_and_every_other_kind_when_pruning", async () => {
    // Regression guarded: pruning old launch backups also deleted backups a person
    // took on purpose, or the one taken just before a restore.
    const store = createBackupStore(home, "abed-nadir");
    await store.save(backup("manual", day(0)));
    await store.save(backup("before-restore", day(1)));
    for (let index = 2; index < 34; index++) await store.save(backup("launch", day(index)));

    const kept = await store.list();

    expect(kept.filter((entry) => entry.reason === "launch")).toHaveLength(30);
    expect(kept.filter((entry) => entry.reason === "launch").at(-1)?.createdAt).toBe(day(4));
    expect(kept.map((entry) => entry.reason)).toContain("manual");
    expect(kept.map((entry) => entry.reason)).toContain("before-restore");
  });

  test("store_refuses_a_backup_from_another_account_when_saving", async () => {
    const store = createBackupStore(home, "abed-nadir");

    await expect(store.save(backup("uploaded", day(0), "troy-barnes"))).rejects.toThrow("This backup is for troy-barnes, not abed-nadir.");
    expect(await store.list()).toEqual([]);
  });

  test("store_raises_BackupNotFoundError_when_an_id_points_outside_the_backups_folder", async () => {
    // Regression guarded: the backup id comes from the browser, and "../.." in it
    // read (and would restore) a file from anywhere on disk.
    const store = createBackupStore(home, "abed-nadir");
    await writeFile(path.join(home, "planted.json"), JSON.stringify(backup("manual", day(0))));

    await expect(store.read("../../planted")).rejects.toBeInstanceOf(BackupNotFoundError);
  });

  test("store_skips_a_damaged_file_when_listing", async () => {
    const store = createBackupStore(home, "abed-nadir");
    await store.save(backup("manual", day(1)));
    await writeFile(path.join(store.directory, "2026-01-01T00-00-00.000Z-launch.json"), "{ not json");

    expect((await store.list()).map((entry) => entry.reason)).toEqual(["manual"]);
  });

  test("store_leaves_no_partial_file_when_a_save_finishes", async () => {
    const store = createBackupStore(home, "abed-nadir");
    await store.save(backup("manual", day(1)));

    expect(await readdir(store.directory)).toEqual(["2026-01-02T00-00-00.000Z-manual.json"]);
  });
});

describe("parseBackup", () => {
  test("parseBackup_raises_InvalidBackupError_when_the_file_is_not_a_backup", () => {
    expect(() => parseBackup({ format: "something-else" })).toThrow(InvalidBackupError);
  });

  test("parseBackup_raises_InvalidBackupError_when_a_rating_is_out_of_range", () => {
    const withLocal = { ...backup("uploaded", day(0)), local: { repos: [{ githubId: 1000, notes: null, usefulnessRating: 6 }], tags: [], repoTags: [] } };

    expect(() => parseBackup(withLocal)).toThrow(InvalidBackupError);
  });
});

describe("backup store under concurrent saves", () => {
  test("store_saves_both_when_two_backups_land_in_the_same_millisecond", async () => {
    // Regression guarded: a double-clicked "Back up now" wrote both saves through one
    // temp file, and the second rename failed with ENOENT.
    const store = createBackupStore(home, "abed-nadir");
    const createdAt = "2026-10-17T19:00:00.000Z";

    const saved = await Promise.all([store.save(backup("manual", createdAt)), store.save(backup("manual", createdAt))]);

    expect(saved.map((summary) => summary.id)).toEqual(["2026-10-17T19-00-00.000Z-manual", "2026-10-17T19-00-00.000Z-manual"]);
    expect(await readdir(path.join(home, "backups", "abed-nadir"))).toEqual(["2026-10-17T19-00-00.000Z-manual.json"]);
  });
});
