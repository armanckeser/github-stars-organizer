import { createRootRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useState } from "react";
import { listCollection, listItemCollection, repoCollection, type StarList } from "../lib/collections";
import { Star, Compass, ListTree, Plus, Menu, Info, History, FileText, Swords, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEMO } from "../lib/demo";
import { APP_MODE } from "../lib/mode";
import { DemoCredit } from "@/components/demo-credit";
import { useSignInEnabled } from "../lib/session";
import { MarkGithubIcon } from "@primer/octicons-react";
import { toast } from "sonner";
import { localApi } from "../lib/local-api";
import { apiStarSelf } from "../lib/api";

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  const { data: lists } = useLiveQuery((q) =>
    q.from({ listCollection }).select(({ listCollection }) => listCollection),
  );
  const { data: allListItems } = useLiveQuery((q) =>
    q.from({ listItemCollection }).select(({ listItemCollection }) => listItemCollection),
  );

  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Following a link in the phone menu should put the page in front of you.
  useEffect(() => setMenuOpen(false), [pathname]);
  const [newName, setNewName] = useState("");

  function handleCreate() {
    if (!newName.trim()) return;
    listCollection.insert({ id: crypto.randomUUID(), name: newName.trim(), is_private: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as StarList);
    setNewName("");
    setCreating(false);
  }

  function countForList(listId: string) {
    return (allListItems ?? []).filter((li) => li.list_id === listId).length;
  }

  const navigation = (
    <>
      <div className="rounded-lg p-3 space-y-0.5">
        <NavLink to="/" icon={<Star className="w-4 h-4" />} label="All Stars" />
        <NavLink to="/explore" icon={<Compass className="w-4 h-4" />} label="Explore" />
        <NavLink to="/compose" icon={<FileText className="w-4 h-4" />} label="Profile" />
        <NavLink to="/run" icon={<Gamepad2 className="w-4 h-4" />} label="Play" />
        <NavLink to="/battle" icon={<Swords className="w-4 h-4" />} label="Battle" />
        {APP_MODE === "local" && <NavLink to="/backups" icon={<History className="w-4 h-4" />} label="Backups" />}
      </div>
      <div className="rounded-lg p-3 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <ListTree className="w-4 h-4" /> Lists
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="New list" title="New list" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {creating && (
          <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="mb-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="List name" autoFocus
              onBlur={() => { if (!newName.trim()) setCreating(false); }} className="h-8 text-sm" />
          </form>
        )}
        <div className="space-y-0.5">
          {(lists ?? []).map((list) => (
            <Link key={list.id} to="/list/$listId" params={{ listId: list.id }}
              className="flex items-center gap-3 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors [&.active]:text-foreground [&.active]:bg-accent">
              <span className="text-xs tabular-nums text-muted-foreground w-5 text-right">{countForList(list.id)}</span>
              <span className="truncate">{list.name}</span>
            </Link>
          ))}
        </div>
      </div>
      <StarThisRepo />
      {!DEMO && <AboutLine />}
    </>
  );

  // Play takes the whole screen, as a game does (docs/GAME-UI.md §1); it has its own way out.
  if (pathname === "/run") {
    return (
      <div className="h-dvh overflow-hidden bg-[#080b0f] text-foreground">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {DEMO && (
        <p className="hidden shrink-0 border-b border-border bg-sidebar px-4 py-2 text-center text-xs text-muted-foreground md:block">
          <DemoNote />
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <header className="flex shrink-0 items-center gap-1 border-b border-border px-2 pt-[env(safe-area-inset-top,0px)] md:hidden">
          <Button variant="ghost" size="icon-lg" className="size-11" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <span className="font-display text-base font-bold tracking-tight">Stard</span>
          {DEMO && (
            <Popover>
              <PopoverTrigger
                render={<Button variant="ghost" size="sm" className="ml-auto h-9 gap-1.5 text-muted-foreground" />}
              >
                Demo
                <Info className="size-3.5" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(18rem,calc(100vw-1.5rem))] text-sm leading-relaxed text-muted-foreground">
                <DemoNote />
              </PopoverContent>
            </Popover>
          )}
        </header>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-72 gap-2 bg-sidebar p-2 pt-[calc(env(safe-area-inset-top,0px)+2.5rem)] pb-[env(safe-area-inset-bottom,0px)]">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {navigation}
          </SheetContent>
        </Sheet>
        <nav className="hidden w-64 shrink-0 flex-col gap-2 p-2 bg-sidebar md:flex">
          {navigation}
        </nav>
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors [&.active]:text-primary [&.active]:bg-accent">
      {icon}{label}
    </Link>
  );
}

// Where the source is, for anyone using it over a network (AGPL section 13), and
// that it isn't GitHub's own app.
function AboutLine() {
  const signInEnabled = useSignInEnabled();
  return (
    <div className="px-3 pb-2 text-xs leading-relaxed text-muted-foreground">
      {signInEnabled && (
        <a href="/auth/logout" className="mb-1 block font-medium text-foreground underline-offset-4 hover:underline">
          Sign out
        </a>
      )}
      <p className="flex items-center gap-1.5">
        Stard v{__APP_VERSION__}
        <a href="https://github.com/armanckeser/github-stars-organizer" target="_blank" rel="noopener"
          aria-label="Source code on GitHub" title="Source code on GitHub"
          className="-m-1 rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
          <MarkGithubIcon size={14} />
        </a>
      </p>
      <p>Not affiliated with GitHub.</p>
    </div>
  );
}

const SELF = "armanckeser/github-stars-organizer";

// Stars the repo with the app's own token; the demo has no token, so it links
// to the repo page. Hidden once the repo is among the stars on screen.
function StarThisRepo() {
  const { data: starred } = useLiveQuery((q) =>
    q.from({ repoCollection }).select(({ repoCollection }) => ({ full_name: repoCollection.full_name })),
  );
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  if (state === "done" || (starred ?? []).some((r) => r.full_name.toLowerCase() === SELF)) return null;
  const className = "mx-3 flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60";
  const label = <><Star className="h-3.5 w-3.5" /> Star on GitHub</>;
  if (DEMO) {
    return <a href={`https://github.com/${SELF}`} target="_blank" rel="noopener" className={className}>{label}</a>;
  }
  async function star() {
    setState("busy");
    try {
      if (APP_MODE === "local") await localApi.starSelf();
      else await apiStarSelf();
      toast.success("Starred. Thank you!");
      setState("done");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't star the repo.");
      setState("idle");
    }
  }
  return <button type="button" onClick={star} disabled={state === "busy"} className={className}>{label}</button>;
}

function DemoNote() {
  return (
    <>
      Demo: public stars read from GitHub. Lists, tags and notes you make stay in this tab.{" "}
      <a href="https://github.com/armanckeser/github-stars-organizer" className="font-medium text-primary underline-offset-4 hover:underline">
        Self-host it
      </a>{" "}
      to sync with your own account.{" "}
      {/* Its own line in the narrow mobile popover; inline in the desktop bar. */}
      <span className="mt-2 block md:mt-0 md:inline">
        <DemoCredit />
      </span>
    </>
  );
}
