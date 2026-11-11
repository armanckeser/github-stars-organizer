import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ComposeRepo } from "@/lib/published-list";
import { useIsDesktop } from "@/hooks/use-media-query";

const MAX_SHOWN = 100;

// Picks the repos for the top four or for reviews. With `max`, the rest can't be
// ticked once that many are picked, so nobody picks a fifth that would be dropped.
export function RepoPickerSheet({
  open,
  onOpenChange,
  title,
  repos,
  picked,
  onChange,
  max,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  repos: ComposeRepo[];
  picked: string[];
  onChange: (ids: string[]) => void;
  max?: number;
}) {
  const [search, setSearch] = useState("");
  const isDesktop = useIsDesktop();
  const full = max !== undefined && picked.length >= max;

  const { shown, matches } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const found = repos
      .filter((r) => !term || `${r.full_name} ${r.description ?? ""}`.toLowerCase().includes(term))
      // The best rated first, then the most starred. The order stays put while you tick.
      .sort((a, b) => (b.usefulness_rating ?? 0) - (a.usefulness_rating ?? 0) || b.stars - a.stars);
    return { shown: found.slice(0, MAX_SHOWN), matches: found.length };
  }, [repos, search]);

  function toggle(id: string, on: boolean) {
    onChange(on ? [...picked, id] : picked.filter((p) => p !== id));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={isDesktop ? "overflow-y-auto sm:max-w-md" : "max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]"}
      >
        <SheetHeader>
          <SheetTitle className="font-display text-lg">{title}</SheetTitle>
          <SheetDescription>
            {max === undefined ? `${picked.length} picked` : `${picked.length} of ${max} picked`}
            {full && ". Untick one to pick another."}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your stars" className="pl-9" />
          </div>
          <ul className="space-y-0.5">
            {shown.map((repo) => {
              const on = picked.includes(repo.id);
              const blocked = full && !on;
              return (
                <li key={repo.id}>
                  <label className={`flex items-start gap-3 rounded-md px-2 py-2 ${blocked ? "opacity-50" : "cursor-pointer hover:bg-accent"}`}>
                    <Checkbox className="mt-0.5" checked={on} disabled={blocked} onCheckedChange={(next) => toggle(repo.id, next)} />
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-medium">{repo.full_name}</span>
                      {repo.description && <span className="block truncate text-xs text-muted-foreground">{repo.description}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {shown.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No repos found.</p>}
          {matches > MAX_SHOWN && (
            <p className="text-xs text-muted-foreground">Showing {MAX_SHOWN} of {matches}. Search to narrow.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
