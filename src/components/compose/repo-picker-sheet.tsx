import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isQuiet } from "@/lib/star-waves";
import type { ComposeRepo } from "@/lib/published-list";
import { useIsDesktop } from "@/hooks/use-media-query";

const MAX_SHOWN = 100;

// Picks the repos for a Highlights section. Archived repos are not offered: the README never includes them.
export function RepoPickerSheet({
  open,
  onOpenChange,
  repos,
  picked,
  onChange,
  now,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repos: ComposeRepo[];
  picked: string[];
  onChange: (ids: string[]) => void;
  now: number;
}) {
  const [search, setSearch] = useState("");
  const isDesktop = useIsDesktop();

  const { shown, matches } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const found = repos
      .filter((r) => !r.is_archived)
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
          <SheetTitle className="font-display text-lg">Pick repos</SheetTitle>
          <SheetDescription>{picked.length} picked</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search repos" className="pl-9" />
          </div>
          <ul className="space-y-1">
            {shown.map((repo) => (
              <li key={repo.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-accent">
                  <Checkbox className="mt-0.5" checked={picked.includes(repo.id)} onCheckedChange={(on) => toggle(repo.id, on)} />
                  <span className="min-w-0 text-sm">
                    <span className="block truncate font-medium">{repo.full_name}</span>
                    {repo.description && <span className="block truncate text-xs text-muted-foreground">{repo.description}</span>}
                    {isQuiet(repo, now) && <span className="block text-xs text-muted-foreground">Quiet: left out unless you keep it</span>}
                  </span>
                </label>
              </li>
            ))}
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
