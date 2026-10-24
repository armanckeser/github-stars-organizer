import { useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Info, ListPlus, Plus, StarOff, StickyNote, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  applyAstralImport, defaultListTags, GITHUB_LIST_LIMIT, newListCount, parseAstralExport, planAstralImport,
  type AstralResult, type AstralStar, type StoredLists,
} from "@/lib/astral";
import { afterAstralImport, astralWriter, beforeAstralImport } from "@/lib/astral-writers";

// Brings an Astral export in: tags become GitHub Lists, notes join the repo's notes.
// Nothing is written until the person has seen the plan and pressed Import. The
// screen shows counts; what someone only needs to learn once sits behind an (i).

type Step =
  | { step: "pick" }
  | { step: "review"; stars: AstralStar[]; asLists: Set<string> }
  | { step: "applying"; done: number; total: number }
  | { step: "done"; result: AstralResult }
  | { step: "failed"; message: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger openOnHover delay={150}
        render={<button type="button" aria-label={label} className="inline-flex text-muted-foreground hover:text-foreground" />}>
        <Info className="size-4" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 text-sm">{children}</PopoverContent>
    </Popover>
  );
}

/** An icon and a number; the label shows on hover and is read out by screen readers. */
function Stat({ icon, count, label, className }: { icon: ReactNode; count: number; label: string; className?: string }) {
  return (
    <span title={label} aria-label={`${count} ${label}`} className={cn("inline-flex items-center gap-1 tabular-nums [&>svg]:size-4", className)}>
      {icon}{count}
    </span>
  );
}

export function AstralImportDialog({ stored, onClose }: { stored: StoredLists; onClose: () => void }) {
  const [state, setState] = useState<Step>({ step: "pick" });
  const fileInput = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      const stars = parseAstralExport(JSON.parse(await file.text()));
      setState({ step: "review", stars, asLists: defaultListTags(planAstralImport(stars, stored, new Set())) });
    } catch (error) {
      setState({ step: "failed", message: error instanceof SyntaxError ? `${file.name} isn't a JSON file.` : messageOf(error) });
    }
  }

  async function apply(stars: AstralStar[], asLists: Set<string>) {
    const plan = planAstralImport(stars, stored, asLists);
    setState({ step: "applying", done: 0, total: 0 });
    try {
      await beforeAstralImport();
      const result = await applyAstralImport(plan, asLists, astralWriter, ({ done, total }) => setState({ step: "applying", done, total }));
      await afterAstralImport();
      setState({ step: "done", result });
    } catch (error) {
      setState({ step: "failed", message: messageOf(error) });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && state.step !== "applying") onClose(); }}>
      {/* Focus the main action, not the first (i), which would open its tip on arrival. */}
      <DialogContent initialFocus={chooseButton}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Import from Astral
            <InfoTip label="How the import works">
              Each tag becomes a GitHub List. Astral notes go below your own. Tags you uncheck are saved in each
              repo&apos;s notes instead. Nothing changes until you press Import.
            </InfoTip>
          </DialogTitle>
        </DialogHeader>

        {state.step === "pick" && (
          <div className="flex items-center gap-2">
            <input ref={fileInput} type="file" accept="application/json,.json" className="hidden"
              onChange={(event) => { void handleFile(event.target.files?.[0]); event.target.value = ""; }} />
            <Button ref={chooseButton} variant="outline" onClick={() => fileInput.current?.click()}>
              <Upload className="mr-1.5 size-4" />Choose export
            </Button>
            <InfoTip label="Where to get the export">In Astral, open Settings and press Export.</InfoTip>
          </div>
        )}
        {state.step === "review" && (
          <AstralReview stars={state.stars} stored={stored} asLists={state.asLists}
            onChange={(asLists) => setState({ ...state, asLists })} />
        )}
        {state.step === "applying" && <Progress done={state.done} total={state.total} />}
        {state.step === "done" && <AstralOutcome result={state.result} />}
        {state.step === "failed" && <p className="text-sm text-destructive">{state.message}</p>}

        {state.step !== "pick" && state.step !== "applying" && <DialogFooter>
          {state.step === "review" && (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={() => void apply(state.stars, state.asLists)} disabled={!canImport(state.stars, stored, state.asLists)}>
                Import
              </Button>
            </>
          )}
          {(state.step === "done" || state.step === "failed") && <Button onClick={onClose}>Close</Button>}
        </DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

function canImport(stars: AstralStar[], stored: StoredLists, asLists: Set<string>): boolean {
  const plan = planAstralImport(stars, stored, asLists);
  const writes = plan.notes.length + plan.tags.filter((tag) => asLists.has(tag.name) && tag.toAdd.length > 0).length;
  return writes > 0 && newListCount(plan, asLists) <= plan.listSlots;
}

function AstralReview({ stars, stored, asLists, onChange }: {
  stars: AstralStar[];
  stored: StoredLists;
  asLists: Set<string>;
  onChange: (asLists: Set<string>) => void;
}) {
  const plan = planAstralImport(stars, stored, asLists);
  const newLists = newListCount(plan, asLists);
  const overLimit = newLists > plan.listSlots;

  function toggle(name: string, checked: boolean) {
    const next = new Set(asLists);
    if (checked) next.add(name);
    else next.delete(name);
    onChange(next);
  }

  return (
    <div className="space-y-3 text-sm">
      {plan.tags.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Lists</span>
            <span className={cn("flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground", overLimit && "text-destructive")}>
              {newLists}/{plan.listSlots} new
              <InfoTip label="GitHub's List limit">
                GitHub allows {GITHUB_LIST_LIMIT} Lists, and you have room for {plan.listSlots} more. A tag matching a
                List you have adds to it instead.
              </InfoTip>
            </span>
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {plan.tags.map((tag) => (
              <li key={tag.name}>
                <label className="flex items-center gap-2">
                  <Checkbox checked={asLists.has(tag.name)} onCheckedChange={(checked) => toggle(tag.name, checked === true)} />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  {!tag.existingList && <Badge variant="outline">new</Badge>}
                  {tag.toAdd.length > 0
                    ? <Stat icon={<Plus />} count={tag.toAdd.length} label="repos to add" className="text-xs text-muted-foreground" />
                    : <span title="Already in your List" aria-label="Already in your List"><Check className="size-4 text-muted-foreground" /></span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-4 text-muted-foreground">
        {plan.notes.length > 0 && <Stat icon={<StickyNote />} count={plan.notes.length} label="repos getting notes" />}
        {plan.notStarred > 0 && <Stat icon={<StarOff />} count={plan.notStarred} label="not starred any more, skipped" />}
      </div>
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
      aria-label="Writing to GitHub">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">{done}/{total}</p>
    </div>
  );
}

function AstralOutcome({ result }: { result: AstralResult }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-4">
        <Stat icon={<ListPlus />} count={result.listsCreated} label="Lists created" />
        <Stat icon={<Plus />} count={result.added} label="repos added to Lists" />
        <Stat icon={<StickyNote />} count={result.notes} label="repos given notes" />
      </div>
      {result.failed.length > 0 && (
        <details className="rounded-md border border-destructive/40 p-2 text-destructive">
          <summary className="flex cursor-pointer items-center gap-1.5">
            <AlertTriangle className="size-4" />{result.failed.length} failed
          </summary>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs">
            {result.failed.map((failure) => <li key={failure.what}>{failure.what}: {failure.reason}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
