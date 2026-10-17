import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, History, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { changeCount, type BackupReason, type BackupSummary, type RestorePlan } from "@/lib/backup";
import { localApi, type BackupsResponse } from "@/lib/local-api";
import { backUpNow, downloadBackup, restoreBackup, uploadBackupFile, type FullRestoreResult, type LocalFillCounts } from "@/lib/local-backups";
import { APP_MODE } from "@/lib/mode";

export const Route = createFileRoute("/backups")({ component: BackupsPage });

const REASON_LABELS: Record<BackupReason, string> = {
  launch: "On launch",
  manual: "Backed up by hand",
  "before-restore": "Before a restore",
  uploaded: "From a file",
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function BackupsPage() {
  if (APP_MODE !== "local") {
    return <p className="text-sm text-muted-foreground">Backups are part of the version you run with <code>npx github-stars-organizer</code>.</p>;
  }
  return <LocalBackups />;
}

function LocalBackups() {
  const [state, setState] = useState<BackupsResponse | null>(null);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [restoring, setRestoring] = useState<BackupSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    setState(await localApi.listBackups());
  }

  useEffect(() => {
    refresh().catch((error) => setStatus(`Couldn't read the backups: ${messageOf(error)}`));
  }, []);

  async function run(label: string, work: () => Promise<string>) {
    setWorking(true);
    setStatus(label);
    try {
      setStatus(await work());
      await refresh();
    } catch (error) {
      setStatus(messageOf(error));
    } finally {
      setWorking(false);
    }
  }

  function handleBackUp() {
    void run("Backing up...", async () => {
      const summary = await backUpNow();
      return `Backed up ${plural(summary.stars, "star")} and ${plural(summary.lists, "List")}, with your tags, ratings and notes.`;
    });
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    void run(`Reading ${file.name}...`, async () => {
      const summary = await uploadBackupFile(file);
      setRestoring(summary);
      return `Kept a copy of ${file.name}.`;
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">Backups</h1>
          <p className="text-sm text-muted-foreground">
            Each launch backs up your stars and Lists before the app can change anything. A restore only adds back what
            is missing: it never unstars a repo or deletes a List.
          </p>
          {state && <p className="text-xs text-muted-foreground">Saved in <code>{state.directory}</code></p>}
        </div>
        <Button onClick={handleBackUp} disabled={working}>Back up now</Button>
      </header>

      {status && <p role="status" className="text-sm">{status}</p>}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {state?.backups.length === 0 && <li className="p-4 text-sm text-muted-foreground">No backups yet.</li>}
        {state?.backups.map((backup) => (
          <li key={backup.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{dateFormat.format(new Date(backup.createdAt))}</p>
              <p className="text-xs text-muted-foreground">
                {REASON_LABELS[backup.reason]} · {plural(backup.stars, "star")} · {plural(backup.lists, "List")}
              </p>
            </div>
            <Button variant="ghost" size="sm" disabled={working} onClick={() => void run("Preparing the file...", async () => {
              await downloadBackup(backup);
              return "Downloaded.";
            })}>
              <Download className="mr-1.5 size-4" />Download
            </Button>
            <Button variant="outline" size="sm" disabled={working} onClick={() => setRestoring(backup)}>
              <History className="mr-1.5 size-4" />Restore...
            </Button>
          </li>
        ))}
      </ul>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Restore from a file</h2>
        <p className="text-sm text-muted-foreground">
          A backup you downloaded, from this computer or another. You see what it would change before anything does.
        </p>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden"
          onChange={(event) => { handleFile(event.target.files?.[0]); event.target.value = ""; }} />
        <Button variant="outline" size="sm" disabled={working} onClick={() => fileInput.current?.click()}>
          <Upload className="mr-1.5 size-4" />Choose a file
        </Button>
      </section>

      {restoring && (
        <RestoreDialog backup={restoring} onClose={() => setRestoring(null)} onRestored={() => void refresh()} />
      )}
    </div>
  );
}

type RestoreStep =
  | { step: "planning" }
  | { step: "review"; plan: RestorePlan; hasLocal: boolean }
  | { step: "applying" }
  | { step: "done"; result: FullRestoreResult }
  | { step: "failed"; message: string };

const NAMES_SHOWN = 5;

function Names({ names }: { names: string[] }) {
  const hidden = names.length - NAMES_SHOWN;
  return (
    <p className="truncate text-xs text-muted-foreground">
      {names.slice(0, NAMES_SHOWN).join(", ")}{hidden > 0 && `, and ${hidden} more`}
    </p>
  );
}

function RestoreDialog({ backup, onClose, onRestored }: { backup: BackupSummary; onClose: () => void; onRestored: () => void }) {
  const [state, setState] = useState<RestoreStep>({ step: "planning" });

  useEffect(() => {
    Promise.all([localApi.planRestore({ backupId: backup.id }), localApi.readBackup(backup.id)])
      .then(([plan, full]) => setState({ step: "review", plan, hasLocal: full.local !== undefined }))
      .catch((error) => setState({ step: "failed", message: messageOf(error) }));
  }, [backup.id]);

  async function apply() {
    setState({ step: "applying" });
    try {
      setState({ step: "done", result: await restoreBackup(backup) });
      onRestored();
    } catch (error) {
      setState({ step: "failed", message: messageOf(error) });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && state.step !== "applying") onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore the backup from {dateFormat.format(new Date(backup.createdAt))}</DialogTitle>
          <DialogDescription>Only adds what GitHub is missing. Nothing you starred or made since is touched.</DialogDescription>
        </DialogHeader>
        <RestoreBody state={state} />
        <DialogFooter>
          {state.step === "review" && (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={() => void apply()} disabled={changeCount(state.plan) === 0 && !state.hasLocal}>Restore</Button>
            </>
          )}
          {(state.step === "done" || state.step === "failed") && <Button onClick={onClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestoreBody({ state }: { state: RestoreStep }) {
  switch (state.step) {
    case "planning":
      return <p className="text-sm text-muted-foreground">Comparing the backup with GitHub...</p>;
    case "applying":
      return <p className="text-sm text-muted-foreground">Restoring. Leave this open until it finishes.</p>;
    case "failed":
      return <p className="text-sm text-destructive">{state.message}</p>;
    case "review":
      return <RestorePreview plan={state.plan} hasLocal={state.hasLocal} />;
    case "done":
      return <RestoreOutcome result={state.result} />;
  }
}

function RestorePreview({ plan, hasLocal }: { plan: RestorePlan; hasLocal: boolean }) {
  const reposToReadd = new Set(plan.addToLists.map((addition) => addition.repo.fullName));
  if (changeCount(plan) === 0) {
    return (
      <p className="text-sm">
        GitHub already has every star and List in this backup.
        {hasLocal && " Restoring fills in any tags, ratings and notes this browser is missing."}
      </p>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      {plan.restar.length > 0 && (
        <div>
          <p>Star {plural(plan.restar.length, "repo")} again. GitHub dates them today, so they move to the top.</p>
          <Names names={plan.restar.map((star) => star.fullName)} />
        </div>
      )}
      {plan.recreateLists.length > 0 && (
        <div>
          <p>Recreate {plural(plan.recreateLists.length, "List")}.</p>
          <Names names={plan.recreateLists.map((list) => (list.isPrivate ? `${list.name} (private)` : list.name))} />
        </div>
      )}
      {reposToReadd.size > 0 && (
        <div>
          <p>Put {plural(reposToReadd.size, "repo")} back in their Lists.</p>
          <Names names={[...reposToReadd]} />
        </div>
      )}
      {hasLocal && <p>Fill in tags, ratings and notes this browser is missing. Nothing you have is overwritten.</p>}
      <p className="text-xs text-muted-foreground">A backup of how things are now is taken first, so you can go back.</p>
    </div>
  );
}

function localFillSentence(local: LocalFillCounts): string {
  const parts = [
    local.notesAndRatings > 0 && `notes or ratings on ${plural(local.notesAndRatings, "repo")}`,
    local.tagLinks > 0 && plural(local.tagLinks, "tag"),
  ].filter((part) => part !== false);
  return parts.length === 0 ? "This browser already had every tag, rating and note." : `Filled in ${parts.join(" and ")}.`;
}

function RestoreOutcome({ result }: { result: FullRestoreResult }) {
  return (
    <div className="space-y-2 text-sm">
      <p>
        Starred {plural(result.restarred, "repo")} again, recreated {plural(result.recreatedLists, "List")}, and re-added{" "}
        {plural(result.addedToLists, "List entry", "List entries")}.
        {result.local && ` ${localFillSentence(result.local)}`}
      </p>
      {result.failed.length > 0 && (
        <div className="rounded-md border border-destructive/40 p-2">
          <p className="font-medium text-destructive">GitHub refused {plural(result.failed.length, "change")}:</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {result.failed.map((failure) => <li key={failure.what}>{failure.what}: {failure.reason}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
