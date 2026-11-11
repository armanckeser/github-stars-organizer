import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import type { Composed, ComposeRepo } from "@/lib/published-list";

function RepoRow({ repo, note, action }: { repo: ComposeRepo; note: string; action?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-2">
      <div className="min-w-0 flex-1 text-sm">
        <a href={repo.url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:underline">
          {repo.full_name}
        </a>
        <span className="block truncate text-xs text-muted-foreground">{note}</span>
      </div>
      {action}
    </li>
  );
}

function lastPush(repo: ComposeRepo): string {
  if (!repo.pushed_at) return "No pushes on record";
  return `Last push ${new Date(repo.pushed_at).toLocaleDateString(undefined, { dateStyle: "medium" })}`;
}

// The repos a section asked for that the README leaves out. A quiet one can be kept.
export function LeftOutSheet({
  open,
  onOpenChange,
  composed,
  onKeep,
  onLeaveOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  composed: Composed;
  onKeep: (id: string) => void;
  onLeaveOut: (id: string) => void;
}) {
  const isDesktop = useIsDesktop();
  const { archived, quiet } = composed.leftOut;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={isDesktop ? "overflow-y-auto sm:max-w-md" : "max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]"}
      >
        <SheetHeader>
          <SheetTitle className="font-display text-lg">Left out</SheetTitle>
          <SheetDescription>
            Archived repos are never listed. A quiet repo has had no push in about six months; keep one when the repo is finished and still good.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          {quiet.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Quiet ({quiet.length})</h3>
              <ul>
                {quiet.map((repo) => (
                  <RepoRow key={repo.id} repo={repo} note={lastPush(repo)}
                    action={<Button size="sm" variant="outline" onClick={() => onKeep(repo.id)}>Keep</Button>} />
                ))}
              </ul>
            </section>
          )}
          {archived.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Archived ({archived.length})</h3>
              <ul>
                {archived.map((repo) => <RepoRow key={repo.id} repo={repo} note="Archived repos are never listed" />)}
              </ul>
            </section>
          )}
          {composed.keptQuiet.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Kept ({composed.keptQuiet.length})</h3>
              <ul>
                {composed.keptQuiet.map((repo) => (
                  <RepoRow key={repo.id} repo={repo} note={lastPush(repo)}
                    action={<Button size="sm" variant="ghost" onClick={() => onLeaveOut(repo.id)}>Leave out</Button>} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
