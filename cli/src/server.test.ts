import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createGitHubClient } from "../../server/github.ts";
import { startFakeGitHub, type FakeGitHub } from "../../scripts/fake-github.ts";
import type { Backup, BackupSummary, RestorePlan } from "../../src/lib/backup.ts";
import type { BackupsResponse, RestoreResult } from "../../src/lib/local-api.ts";
import { launch } from "./launch.ts";

const PORT = 5185;
const LOGIN = "abed-nadir";

let fake: FakeGitHub;
let home: string;
let app: Hono;
let launchBackup: BackupSummary;

beforeEach(async () => {
  fake = await startFakeGitHub({
    repoCount: 230,
    lists: [
      { name: "Paintball", repoIndexes: Array.from({ length: 150 }, (_, index) => index) },
      { name: "Darkest Timeline", isPrivate: true, repoIndexes: [0, 5] },
    ],
  });
  home = await mkdtemp(path.join(tmpdir(), "stars-server-"));
  ({ app, launchBackup } = await launch({ github: createGitHubClient("fake-token", fake.url), login: LOGIN, home, appDir: home, port: PORT }));
});

afterEach(async () => {
  await fake.close();
  await rm(home, { recursive: true, force: true });
});

async function call<T>(method: string, route: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: T }> {
  const response = await app.request(`http://127.0.0.1:${PORT}/api/local/${route}`, {
    method,
    headers: { host: `127.0.0.1:${PORT}`, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as T };
}

async function unstarAndDeleteDarkestTimeline() {
  await call("POST", "unstar", { owner: "greendale", name: "project-0" });
  await call("DELETE", `lists/${fake.listNamed("Darkest Timeline").id}`, {});
  fake.writes.length = 0;
}

describe("restore", () => {
  test("restore_restars_recreates_and_readds_when_a_repo_was_unstarred_and_a_list_deleted", async () => {
    // Regression guarded: an unstar or a deleted List in the app couldn't be undone,
    // and a restore that only re-starred left the repo out of the Lists it was in.
    await unstarAndDeleteDarkestTimeline();

    const result = await call<RestoreResult>("POST", "restore/apply", { backupId: launchBackup.id });

    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ restarred: 1, recreatedLists: 1, failed: [] });
    expect(fake.starred()).toHaveLength(230);
    const paintball = fake.listNamed("Paintball");
    expect(paintball.itemIds).toHaveLength(150);
    expect(paintball.itemIds).toContain("R_1000");
    const darkest = fake.listNamed("Darkest Timeline");
    expect(darkest.isPrivate).toBe(true);
    expect([...darkest.itemIds].sort()).toEqual(["R_1000", "R_1005"]);
  });

  test("restore_previews_without_writing_to_github", async () => {
    await unstarAndDeleteDarkestTimeline();

    const preview = await call<RestorePlan>("POST", "restore/plan", { backupId: launchBackup.id });

    expect(preview.json.restar.map((star) => star.fullName)).toEqual(["greendale/project-0"]);
    expect(preview.json.recreateLists.map((list) => list.name)).toEqual(["Darkest Timeline"]);
    expect(fake.writes).toEqual([]);
  });

  test("restore_backs_up_the_current_state_first_and_reports_failures_when_github_refuses_a_write", async () => {
    // Regression guarded: a restore could leave GitHub half-changed with no record of
    // what it was just before, or stop at the first refused write and say nothing.
    await unstarAndDeleteDarkestTimeline();
    fake.failNext("addStar");

    const result = await call<RestoreResult>("POST", "restore/apply", { backupId: launchBackup.id });

    expect(result.json.restarred).toBe(0);
    expect(result.json.failed.map((failure) => failure.what)).toEqual(["Star greendale/project-0"]);
    expect(result.json.recreatedLists).toBe(1);
    const { json } = await call<BackupsResponse>("GET", "backups");
    const beforeRestore = json.backups.find((backup) => backup.reason === "before-restore");
    expect(beforeRestore).toMatchObject({ stars: 229, lists: 1 });
  });

  test("restore_writes_nothing_when_github_already_matches_the_backup", async () => {
    const result = await call<RestoreResult>("POST", "restore/apply", { backupId: launchBackup.id });

    expect(result.json).toMatchObject({ restarred: 0, recreatedLists: 0, addedToLists: 0, failed: [] });
    expect(fake.writes).toEqual([]);
  });

  test("restore_recreates_a_deleted_list_once_when_two_restores_arrive_together", async () => {
    // Regression guarded: a double-click on Restore ran two restores, and both
    // recreated the deleted List, leaving two "Darkest Timeline" Lists.
    await unstarAndDeleteDarkestTimeline();

    const results = await Promise.all([
      call("POST", "restore/apply", { backupId: launchBackup.id }),
      call("POST", "restore/apply", { backupId: launchBackup.id }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(fake.lists.filter((list) => list.name === "Darkest Timeline")).toHaveLength(1);
  });

  test("restore_refuses_a_backup_of_another_account_and_writes_nothing", async () => {
    const { json: launchCopy } = await call<Backup>("GET", `backups/${launchBackup.id}`);

    const upload = await call<{ error: string }>("POST", "backups/upload", { ...launchCopy, login: "troy-barnes" });

    expect(upload.status).toBe(409);
    expect(upload.json.error).toContain("troy-barnes");
    expect(fake.writes).toEqual([]);
  });

  test("restore_refuses_another_site_and_writes_nothing_when_origin_is_foreign", async () => {
    // Regression guarded: any page open in the browser could POST to localhost and
    // restore (or do anything else) with the user's GitHub token.
    await unstarAndDeleteDarkestTimeline();

    const result = await call("POST", "restore/apply", { backupId: launchBackup.id }, { origin: "https://city-college.example" });

    expect(result.status).toBe(403);
    expect(fake.writes).toEqual([]);
  });

  test("restore_answers_404_when_the_backup_does_not_exist", async () => {
    const result = await call<{ error: string }>("POST", "restore/apply", { backupId: "2026-01-01T00-00-00.000Z-manual" });

    expect(result.status).toBe(404);
    expect(fake.writes).toEqual([]);
  });
});

describe("backups", () => {
  test("backups_saves_an_uploaded_file_as_uploaded_and_lists_it_newest_first", async () => {
    const { json: launchCopy } = await call<Backup>("GET", `backups/${launchBackup.id}`);

    const upload = await call<BackupSummary>("POST", "backups/upload", launchCopy);
    const { json } = await call<BackupsResponse>("GET", "backups");

    expect(upload.json).toMatchObject({ reason: "uploaded", stars: 230, lists: 2 });
    expect(json.backups.map((backup) => backup.reason)).toEqual(["uploaded", "launch"]);
  });

  test("backups_answers_400_when_the_upload_is_not_a_backup", async () => {
    const upload = await call<{ error: string }>("POST", "backups/upload", { format: "something-else" });

    expect(upload.status).toBe(400);
    expect((await call<BackupsResponse>("GET", "backups")).json.backups).toHaveLength(1);
  });

  test("backups_records_github_as_it_is_now_when_backed_up_by_hand", async () => {
    await unstarAndDeleteDarkestTimeline();

    const manual = await call<BackupSummary>("POST", "backups", {});

    expect(manual.json).toMatchObject({ reason: "manual", stars: 229, lists: 1 });
  });
});
