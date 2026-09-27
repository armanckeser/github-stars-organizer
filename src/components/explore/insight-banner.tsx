import { AlertTriangle, TrendingUp, Heart } from "lucide-react";

interface InsightBannerProps {
  totalRepos: number;
  dormantCount: number;
  staleCount: number;
  avgHealth: number | null;
  recentMonthStars: number;
}

export function InsightBanner({ totalRepos, dormantCount, staleCount, avgHealth, recentMonthStars }: InsightBannerProps) {
  const { headline, detail, icon, severity } = pickInsight({ totalRepos, dormantCount, staleCount, avgHealth, recentMonthStars });

  const borderColor = severity === "warning" ? "border-l-amber-500" : severity === "concern" ? "border-l-red-400" : "border-l-primary";

  return (
    <div className={`rounded-lg border border-border bg-card p-5 border-l-4 ${borderColor}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
        <div>
          <p className="text-sm font-medium text-card-foreground">{headline}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function pickInsight({ totalRepos, dormantCount, staleCount, avgHealth, recentMonthStars }: InsightBannerProps): { headline: string; detail: string; icon: React.ReactNode; severity: "info" | "warning" | "concern" } {
  const dormantPercent = totalRepos > 0 ? Math.round((dormantCount / totalRepos) * 100) : 0;
  const rottingCount = dormantCount + staleCount;
  const rottingPercent = totalRepos > 0 ? Math.round((rottingCount / totalRepos) * 100) : 0;

  if (dormantPercent > 15) {
    return {
      headline: `${dormantPercent}% of your stars are dormant`,
      detail: `${dormantCount} repos with no commits in 2+ years. Worth pruning.`,
      icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
      severity: "warning",
    };
  }

  if (rottingPercent > 30) {
    return {
      headline: `${rottingPercent}% of your stars are going stale`,
      detail: `${rottingCount} repos not updated in over a year.`,
      icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
      severity: "warning",
    };
  }

  if (avgHealth != null && avgHealth < 5) {
    return {
      headline: `Average health is ${avgHealth.toFixed(1)}/10`,
      detail: "Many repos are light on commits, releases or contributors.",
      icon: <Heart className="h-5 w-5 text-red-400" />,
      severity: "concern",
    };
  }

  if (recentMonthStars > 0) {
    return {
      headline: `${recentMonthStars} new stars in the last 30 days`,
      detail: `${totalRepos} repos in total.`,
      icon: <TrendingUp className="h-5 w-5 text-primary" />,
      severity: "info",
    };
  }

  return {
    headline: `${totalRepos} starred repos`,
    detail: "No new stars in the last 30 days.",
    icon: <TrendingUp className="h-5 w-5 text-primary" />,
    severity: "info",
  };
}
