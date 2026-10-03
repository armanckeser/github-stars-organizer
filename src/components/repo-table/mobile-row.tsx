import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { Repo } from "@/lib/collections";
import type { MobileRowState } from "@/components/views/data-table";
import { cn } from "@/lib/utils";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function healthTone(score: number) {
  if (score >= 7) return "bg-primary";
  if (score >= 4) return "bg-(--chart-amber)";
  return "bg-destructive";
}

// One repo on a phone: the name and what it is first, the numbers in one quiet line under it.
export function RepoMobileRow({
  repo,
  state,
  actions,
}: {
  repo: Repo;
  state: MobileRowState;
  actions?: ReactNode;
}) {
  const [owner, name] = repo.full_name.split("/");
  const meta = [
    repo.language,
    repo.is_archived ? "Archived" : null,
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-3 py-3 pr-1 pl-4">
      <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={state.selected}
          onCheckedChange={state.toggleSelected}
          aria-label={`Select ${repo.full_name}`}
          className="size-5 rounded-md after:-inset-3"
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate leading-snug">
          <span className="text-muted-foreground">{owner}/</span>
          <span className="font-medium">{name}</span>
        </p>
        {repo.description && (
          <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted-foreground">
            {repo.description}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
          <span className="flex items-center gap-1">
            <Star className="size-3" />
            {compact.format(repo.stars)}
          </span>
          {repo.health_score != null && (
            <span className="flex items-center gap-1.5" title="Health">
              <span className={cn("size-1.5 rounded-full", healthTone(repo.health_score))} />
              {repo.health_score.toFixed(1)}
            </span>
          )}
          {meta.map((item) => (
            <span key={item} className="truncate">{item}</span>
          ))}
          {!!repo.usefulness_rating && (
            <span className="flex items-center gap-0.5 text-primary">
              {repo.usefulness_rating}
              <Star className="size-3 fill-current" />
            </span>
          )}
        </div>
      </div>
      {actions && (
        <div className={cn("shrink-0 transition-opacity", state.selecting && "pointer-events-none opacity-0")} onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
