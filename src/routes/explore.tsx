import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { repoCollection, listCollection } from "../lib/collections";
import { DEMO } from "../lib/demo";
import { APP_MODE } from "../lib/mode";
import { scoreHealth } from "../lib/local-sync";
import { FRESHNESS_BUCKETS, freshnessOf, starsLink } from "../lib/freshness";
import { CHART_COLORS } from "@/components/explore/chart-colors";
import { InsightBanner } from "@/components/explore/insight-banner";
import { StatCards } from "@/components/explore/stat-cards";
import { FreshnessChart } from "@/components/explore/freshness-chart";
import { HealthRadar } from "@/components/explore/health-radar";
import { LanguageBars } from "@/components/explore/language-bars";
import { StarringTimeline } from "@/components/explore/starring-timeline";
import { StarsHealthScatter } from "@/components/explore/stars-health-scatter";
import { RecentActivity } from "@/components/explore/recent-activity";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function refreshHealthOnServer(): Promise<{ scored: number; total: number }> {
  const response = await fetch(`${API_URL}/api/refresh-health`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Refresh failed");
  return result;
}
const DAYS_MS = 86_400_000;

export const Route = createFileRoute("/explore")({ component: ExplorePage });

function ExplorePage() {
  const navigate = useNavigate();
  const openStars = (filter: Record<string, string>) => navigate({ to: "/", search: starsLink(filter) });
  const { data: repos } = useLiveQuery((q) =>
    q.from({ repoCollection }).select(({ repoCollection }) => repoCollection),
  );
  const { data: lists } = useLiveQuery((q) =>
    q.from({ listCollection }).select(({ listCollection }) => listCollection),
  );

  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState("");

  async function handleRefreshHealth() {
    setRefreshing(true);
    setRefreshResult("Scoring repos...");
    try {
      const result = APP_MODE === "local"
        ? await scoreHealth("all", ({ scored, total }) => setRefreshResult(`Scoring ${scored}/${total}...`))
        : await refreshHealthOnServer();
      setRefreshResult(`Scored ${result.scored}/${result.total} repos.`);
    } catch (error) {
      setRefreshResult(`Error: ${error instanceof Error ? error.message : "Unknown"}`);
    } finally {
      setRefreshing(false);
    }
  }

  const allRepos = repos ?? [];
  const now = Date.now();

  const { topLanguage, topLanguagePercent, languages } = useMemo(() => {
    const langCounts = new Map<string, number>();
    for (const r of allRepos) {
      if (r.language) langCounts.set(r.language, (langCounts.get(r.language) ?? 0) + 1);
    }
    const sorted = [...langCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topLang = sorted[0]?.[0] ?? "—";
    const topPercent = allRepos.length > 0 && sorted[0] ? Math.round((sorted[0][1] / allRepos.length) * 100) : 0;
    return {
      topLanguage: topLang,
      topLanguagePercent: topPercent,
      languages: sorted.slice(0, 10).map(([language, count]) => ({ language, count })),
    };
  }, [allRepos]);

  const { avgHealth } = useMemo(() => {
    const scored = allRepos.filter((r) => r.health_score != null);
    const avg = scored.length > 0
      ? scored.reduce((sum, r) => sum + (r.health_score ?? 0), 0) / scored.length
      : null;
    return { avgHealth: avg, scoredCount: scored.length };
  }, [allRepos]);

  const freshness = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allRepos) {
      const id = freshnessOf(r.pushed_at, now);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const colors = [CHART_COLORS.healthy, CHART_COLORS.tealMuted, CHART_COLORS.warning, CHART_COLORS.danger];
    return FRESHNESS_BUCKETS.map((b, i) => ({ id: b.id, label: b.label, count: counts.get(b.id) ?? 0, color: colors[i] }));
  }, [allRepos, now]);

  const healthRadar = useMemo(() => {
    const dimensions = [
      { key: "commit_recency", label: "Commits" },
      { key: "issue_resolution", label: "Issues" },
      { key: "contributors", label: "Contributors" },
      { key: "star_velocity", label: "Star Growth" },
      { key: "release_cadence", label: "Releases" },
    ];
    const scored = allRepos.filter((r) => r.health_data);
    if (scored.length === 0) return [];

    return dimensions.map(({ key, label }) => ({
      dimension: key,
      label,
      value: scored.reduce((sum, r) => {
        const data = r.health_data as Record<string, number | string> | null;
        return sum + (Number(data?.[key]) || 0);
      }, 0) / scored.length,
    }));
  }, [allRepos]);

  const timeline = useMemo(() => {
    const months = new Map<string, number>();
    for (const r of allRepos) {
      if (r.starred_at) {
        const month = r.starred_at.slice(0, 7);
        months.set(month, (months.get(month) ?? 0) + 1);
      }
    }
    return [...months.entries()].sort().map(([month, count]) => ({ month, count }));
  }, [allRepos]);

  const scatterData = useMemo(() =>
    allRepos
      .filter((r) => r.health_score != null && r.stars > 0)
      .map((r) => ({
        name: r.full_name,
        health: r.health_score!,
        logStars: Math.round(Math.log10(r.stars + 1) * 100) / 100,
        stars: r.stars,
        forks: r.forks,
      })),
    [allRepos],
  );

  const recentlyActive = useMemo(() =>
    [...allRepos]
      .filter((r) => r.pushed_at)
      .sort((a, b) => new Date(b.pushed_at!).getTime() - new Date(a.pushed_at!).getTime())
      .slice(0, 8)
      .map((r) => ({
        full_name: r.full_name,
        url: r.url,
        language: r.language,
        pushed_at: r.pushed_at!,
        stars: r.stars,
      })),
    [allRepos],
  );

  const recentMonthStars = useMemo(() => {
    const thirtyDaysAgo = now - 30 * DAYS_MS;
    return allRepos.filter((r) => r.starred_at && new Date(r.starred_at).getTime() > thirtyDaysAgo).length;
  }, [allRepos, now]);

  const dormantCount = freshness[3].count;
  const staleCount = freshness[2].count;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-bold tracking-tight">Explore</h1>
        {/* Scoring needs the server and a token; the demo's scores come baked in. */}
        {!DEMO && (
          <div className="flex items-center gap-3">
            {refreshResult && <span className="text-xs text-muted-foreground">{refreshResult}</span>}
            <Button onClick={handleRefreshHealth} disabled={refreshing} variant="outline" size="sm">
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Scoring..." : "Refresh Health"}
            </Button>
          </div>
        )}
      </div>

      <InsightBanner
        totalRepos={allRepos.length}
        dormantCount={dormantCount}
        staleCount={staleCount}
        avgHealth={avgHealth}
        recentMonthStars={recentMonthStars}
        onShowDormant={() => openStars({ freshness: "+dormant" })}
        onShowStale={() => openStars({ freshness: "+stale,+dormant" })}
      />

      <StatCards
        totalStars={allRepos.length}
        listCount={(lists ?? []).length}
        avgHealth={avgHealth}
        topLanguage={topLanguage}
        topLanguagePercent={topLanguagePercent}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FreshnessChart data={freshness} onSelect={(id) => openStars({ freshness: `+${id}` })} />
        <HealthRadar data={healthRadar} />
      </div>

      <LanguageBars data={languages} onSelect={(language) => openStars({ language: `+${language}` })} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StarringTimeline data={timeline} />
        <StarsHealthScatter data={scatterData} />
      </div>

      <RecentActivity repos={recentlyActive} />
    </div>
  );
}
