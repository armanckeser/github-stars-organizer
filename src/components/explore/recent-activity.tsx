import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

interface RecentRepo {
  full_name: string;
  url: string;
  language: string | null;
  pushed_at: string;
  stars: number;
}

interface RecentActivityProps {
  repos: RecentRepo[];
}

function formatRelativeTime(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
}

export function RecentActivity({ repos }: RecentActivityProps) {
  if (repos.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Recently pushed</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="divide-y divide-border">
          {repos.map((repo) => (
            <a
              key={repo.full_name}
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-accent/50 group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                  {repo.full_name}
                </p>
              </div>
              {repo.language && (
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {repo.language}
                </Badge>
              )}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {repo.stars.toLocaleString()} stars
              </span>
              <span className="shrink-0 text-xs text-muted-foreground w-16 text-right">
                {formatRelativeTime(repo.pushed_at)}
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
