import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NO_LIST } from "@/components/repo-table/registry";

const DISMISSED_KEY = "agent-sort-card-dismissed";
// Below this, sorting by hand is quicker than setting up an agent.
const MIN_UNLISTED = 30;

// Shown over the stars table when the "Not in any list" pile is too big to sort
// by hand, which is when an AI agent earns its setup.
export function AgentSortCard({ unlisted }: { unlisted: number }) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "1");
  if (dismissed || unlisted < MIN_UNLISTED) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
      <Bot className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="flex-1 space-y-2 text-sm">
        <p>
          <span className="font-medium">{unlisted} stars are in no List.</span>{" "}
          <span className="text-muted-foreground">
            An AI agent such as Claude Code can suggest Lists for them and sort them once you agree.
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" render={<Link to="/settings" />}>Set up an agent</Button>
          <Button size="sm" variant="ghost" render={<Link to="/" search={{ lists: `+${NO_LIST}` }} />}>
            Show them
          </Button>
        </div>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
