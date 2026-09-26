import { AlertTriangle, TrendingUp, Heart } from "lucide-react";

interface InsightBannerProps {
  totalRepos: number;
  dormantCount: number;
  staleCount: number;
  avgHealth: number | null;
  recentMonthStars: number;
}

export function InsightBanner({ totalRepos, dormantCount, staleCount, avgHealth, recentMonthStars }: InsightBannerProps) {
  const { message, icon, severity } = pickInsight({ totalRepos, dormantCount, staleCount, avgHealth, recentMonthStars });

  const borderColor = severity === "warning" ? "border-l-amber-500" : severity === "concern" ? "border-l-red-400" : "border-l-primary";

  return (
    <div className={`rounded-lg border border-border bg-card p-5 border-l-4 ${borderColor}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
        <p className="text-sm leading-relaxed text-card-foreground">{message}</p>
      </div>
    </div>
  );
}

function pickInsight({ totalRepos, dormantCount, staleCount, avgHealth, recentMonthStars }: InsightBannerProps): { message: string; icon: React.ReactNode; severity: "info" | "warning" | "concern" } {
  const dormantPercent = totalRepos > 0 ? Math.round((dormantCount / totalRepos) * 100) : 0;
  const rottingCount = dormantCount + staleCount;
  const rottingPercent = totalRepos > 0 ? Math.round((rottingCount / totalRepos) * 100) : 0;

  if (dormantPercent > 15) {
    return {
      message: `${dormantCount} of your ${totalRepos} starred repos haven't had a commit in over 2 years. That's ${dormantPercent}% of your collection — consider pruning repos you no longer use.`,
      icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
      severity: "warning",
    };
  }

  if (rottingPercent > 30) {
    return {
      message: `${rottingCount} repos (${rottingPercent}%) haven't been updated in over a year. Your collection may have dependencies that are no longer maintained.`,
      icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
      severity: "warning",
    };
  }

  if (avgHealth != null && avgHealth < 5) {
    return {
      message: `Your collection's average health score is ${avgHealth.toFixed(1)}/10 — below the midpoint. Many starred repos may lack active maintenance, recent releases, or community engagement.`,
      icon: <Heart className="h-5 w-5 text-red-400" />,
      severity: "concern",
    };
  }

  if (recentMonthStars > 0) {
    return {
      message: `You starred ${recentMonthStars} new repos in the last 30 days. Your collection of ${totalRepos} repos spans the tools and libraries you rely on.`,
      icon: <TrendingUp className="h-5 w-5 text-primary" />,
      severity: "info",
    };
  }

  return {
    message: `You're tracking ${totalRepos} starred repos. Use health scores and freshness data below to find repos worth keeping — and ones worth replacing.`,
    icon: <TrendingUp className="h-5 w-5 text-primary" />,
    severity: "info",
  };
}
