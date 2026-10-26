import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { Star, ExternalLink, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { repoCollection, type Repo } from "@/lib/collections";
import { fetchSimilar } from "@/lib/github-extras";
import { freshnessOf } from "@/lib/freshness";
import type { SimilarRepo } from "../../server/similar";

const DAY_MS = 86_400_000;

function pushedAgo(pushedAt: string | null): string {
  if (!pushedAt) return "no pushes";
  const days = Math.floor((Date.now() - Date.parse(pushedAt)) / DAY_MS);
  if (days < 1) return "pushed today";
  if (days < 30) return `pushed ${days}d ago`;
  if (days < 365) return `pushed ${Math.floor(days / 30)}mo ago`;
  return `pushed ${Math.floor(days / 365)}y ago`;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; repos: SimilarRepo[] }
  | { status: "error"; message: string };

// Runs only when asked: each lookup spends up to three of GitHub's 30 searches a minute.
export function SimilarRepos({ repo }: { repo: Repo }) {
  const [state, setState] = useState<State>({ status: "idle" });
  useEffect(() => setState({ status: "idle" }), [repo.id]);

  const { data: stars } = useLiveQuery((q) =>
    q.from({ repoCollection }).select(({ repoCollection }) => ({ full_name: repoCollection.full_name })),
  );
  const starred = useMemo(() => new Set((stars ?? []).map((r) => r.full_name.toLowerCase())), [stars]);

  // A repo nobody has pushed to in a year needs a replacement more than a neighbour.
  const freshness = freshnessOf(repo.pushed_at);
  const wantsAlternative = freshness === "stale" || freshness === "dormant" || repo.is_archived;

  async function find() {
    setState({ status: "loading" });
    try {
      let repos = await fetchSimilar(repo);
      if (wantsAlternative) repos = repos.filter((r) => freshnessOf(r.pushed_at) === "active" || freshnessOf(r.pushed_at) === "aging");
      setState({ status: "done", repos });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "The search failed." });
    }
  }

  return (
    <section>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        {wantsAlternative ? "Active alternatives" : "Similar repos"}
      </h3>
      {wantsAlternative && state.status === "idle" && (
        <p className="text-sm text-muted-foreground mb-3">
          {repo.is_archived ? "This repo is archived." : "No pushes to this repo in over a year."} Look for maintained repos that do the same job.
        </p>
      )}
      {(state.status === "idle" || state.status === "error") && (
        <Button variant="outline" size="sm" className="w-full" onClick={find}>
          <Search className="mr-2 h-3.5 w-3.5" />
          {wantsAlternative ? "Find alternatives" : "Find similar repos"}
        </Button>
      )}
      {state.status === "error" && <p className="text-sm text-destructive mt-2">{state.message}</p>}
      {state.status === "loading" && <p className="text-sm text-muted-foreground">Searching GitHub...</p>}
      {state.status === "done" && state.repos.length === 0 && (
        <p className="text-sm text-muted-foreground">No close matches on GitHub.</p>
      )}
      {state.status === "done" && state.repos.length > 0 && (
        <ul className="space-y-3">
          {state.repos.map((r) => (
            <li key={r.full_name} className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline inline-flex items-center gap-1">
                  {r.full_name}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </a>
                {starred.has(r.full_name.toLowerCase()) && <Badge variant="secondary" className="text-[10px]">In your stars</Badge>}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Star className="h-3 w-3" />{r.stars.toLocaleString()}</span>
                {r.language && <span>{r.language}</span>}
                <span>{pushedAgo(r.pushed_at)}</span>
              </div>
              {r.description && <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>}
              {r.shared_topics.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {r.shared_topics.slice(0, 3).map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
