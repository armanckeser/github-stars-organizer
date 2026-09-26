import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Star, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Repo } from "@/lib/collections";
import { createSelectColumn } from "@/components/views/data-table";

function HealthBadge({ score }: { score: number | null }) {
  if (score == null)
    return <span className="text-muted-foreground/40">&mdash;</span>;
  const variant =
    score >= 7 ? "default" : score >= 4 ? "secondary" : "destructive";
  return (
    <Badge variant={variant} className="tabular-nums">
      {score.toFixed(1)}
    </Badge>
  );
}

function RatingDisplay({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${i < value ? "fill-primary text-primary" : "text-muted-foreground/20"}`}
        />
      ))}
    </span>
  );
}

function relativeDate(dateString: string | null): string {
  if (!dateString) return "";
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

interface RepoColumnsOptions {
  renderActions?: (repo: Repo) => ReactNode;
  selectable?: boolean;
  onPreview?: (repo: Repo) => void;
}

export function createRepoColumns({
  renderActions,
  selectable = false,
  onPreview,
}: RepoColumnsOptions = {}): ColumnDef<Repo>[] {
  const columns: ColumnDef<Repo>[] = [
    ...(selectable ? [createSelectColumn<Repo>()] : []),
    ...(onPreview
      ? [
          {
            id: "preview",
            header: "",
            cell: ({ row }: { row: { original: Repo } }) => (
              <button
                type="button"
                onClick={() => onPreview(row.original)}
                className="p-1 rounded text-muted-foreground/50 hover:text-primary transition-colors"
                aria-label="Preview details"
              >
                <Eye className="h-4 w-4" />
              </button>
            ),
            enableHiding: false,
          } satisfies ColumnDef<Repo>,
        ]
      : []),
    {
      accessorKey: "full_name",
      header: "Repository",
      size: 280,
      cell: ({ row }) => (
        <div className="max-w-[280px]">
          <a
            href={row.original.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground hover:underline truncate block"
          >
            {row.original.full_name}
          </a>
          {row.original.description && (
            <p className="truncate text-xs text-muted-foreground">
              {row.original.description}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "language",
      header: "Language",
    },
    {
      accessorKey: "stars",
      header: "Stars",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.stars.toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "forks",
      header: "Forks",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.forks.toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "health_score",
      header: "Health",
      cell: ({ row }) => <HealthBadge score={row.original.health_score} />,
    },
    {
      accessorKey: "usefulness_rating",
      header: "Rating",
      cell: ({ row }) => (
        <RatingDisplay value={row.original.usefulness_rating} />
      ),
    },
    {
      accessorKey: "starred_at",
      header: "Starred",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {relativeDate(row.original.starred_at)}
        </span>
      ),
    },
    {
      accessorKey: "pushed_at",
      header: "Last Push",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {relativeDate(row.original.pushed_at)}
        </span>
      ),
    },
    {
      accessorKey: "topics",
      header: "Topics",
      size: 180,
      cell: ({ row }) => {
        const topics = row.original.topics?.split(",").filter(Boolean) ?? [];
        if (topics.length === 0) return null;
        return (
          <div className="flex flex-wrap gap-1 max-w-[180px]">
            {topics.slice(0, 2).map((topic) => (
              <Badge key={topic} variant="outline" className="text-xs">
                {topic.trim()}
              </Badge>
            ))}
            {topics.length > 2 && (
              <span className="text-xs text-muted-foreground">
                +{topics.length - 2}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "is_archived",
      header: "Status",
      cell: ({ row }) =>
        row.original.is_archived ? (
          <Badge variant="secondary">Archived</Badge>
        ) : null,
    },
  ];

  if (renderActions) {
    columns.push({
      id: "actions",
      header: "",
      cell: ({ row }) => renderActions(row.original),
    });
  }

  return columns;
}
