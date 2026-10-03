import { createRootRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useState } from "react";
import { listCollection, listItemCollection, type StarList } from "../lib/collections";
import { Star, Compass, ListTree, Plus, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DEMO } from "../lib/demo";

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
    </>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {DEMO && (
        <p className="shrink-0 border-b border-border bg-sidebar px-4 py-2 text-center text-xs text-muted-foreground">
          Demo: public stars read from GitHub. Lists, tags and notes you make stay in this tab.{" "}
          <a href="https://github.com/armanckeser/github-stars-organizer" className="font-medium text-primary underline-offset-4 hover:underline">
            Self-host it
          </a>{" "}
          to sync with your own account.
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <span className="font-display text-base font-bold tracking-tight">Stars</span>
        </header>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-72 gap-2 bg-sidebar p-2 pt-10">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {navigation}
          </SheetContent>
        </Sheet>
        <nav className="hidden w-64 shrink-0 flex-col gap-2 p-2 bg-sidebar md:flex">
          {navigation}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
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
