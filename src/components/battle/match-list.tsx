import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Figure } from "@/components/battle/figure";
import { fetchMatches, type MatchSummary } from "@/lib/game-api";

// The hub (issue #48): every match someone is in, found on GitHub by the Worker.
// Matches waiting on this player come first.

function statusOf(match: MatchSummary): { text: string; strong: boolean } {
  const them = match.opponent.name;
  if (match.status === "waiting") return match.yourMove ? { text: `${them} challenged you`, strong: true } : { text: `Waiting for ${them} to accept`, strong: false };
  if (match.status === "active") return match.yourMove ? { text: "Your move", strong: true } : { text: `Waiting for ${them}`, strong: false };
  if (match.status === "declined") return { text: match.side === "a" ? `${them} declined` : "You declined", strong: false };
  if (match.status === "void") return { text: "Doesn't count: a move was removed", strong: false };
  return { text: match.won ? "You won" : "You lost", strong: false };
}

export function MatchList({ login }: { login: string }) {
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stale = false;
    setMatches(null);
    setError("");
    fetchMatches(login)
      .then((found) => !stale && setMatches([...found].sort((a, b) => Number(b.yourMove) - Number(a.yourMove))))
      .catch((cause: unknown) => !stale && setError(cause instanceof Error ? cause.message : "Couldn't read your matches."));
    return () => {
      stale = true;
    };
  }, [login]);

  if (error) return <p className="text-sm text-muted-foreground">{error}</p>;
  if (!matches) return <p className="text-sm text-muted-foreground">Looking for {login}'s matches...</p>;
  if (matches.length === 0) return <p className="text-sm text-muted-foreground">No matches yet. Find someone's team above and challenge them.</p>;

  return (
    <ul className="divide-y rounded-lg border">
      {matches.map((match) => {
        const status = statusOf(match);
        return (
          <li key={`${match.thread.repo}#${match.thread.number}`}>
            <Link to="/game" search={{ repo: match.thread.repo, n: match.thread.number }} className="flex items-center gap-3 px-3 py-2 hover:bg-accent">
              <Figure look={match.opponent.look} className="h-12 w-auto shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">vs {match.opponent.name}</span>
                <span className={`block truncate text-xs ${status.strong ? "font-medium text-primary" : "text-muted-foreground"}`}>
                  {status.text}{match.status === "active" ? ` · turn ${match.turn}` : ""}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
