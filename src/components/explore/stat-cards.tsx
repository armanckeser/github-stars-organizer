import { Card, CardContent } from "@/components/ui/card";
import { Star, List, Activity, Code } from "lucide-react";

interface StatCardsProps {
  totalStars: number;
  listCount: number;
  avgHealth: number | null;
  topLanguage: string;
  topLanguagePercent: number;
}

const ICON_CLASS = "h-4 w-4 text-muted-foreground";

export function StatCards({ totalStars, listCount, avgHealth, topLanguage, topLanguagePercent }: StatCardsProps) {
  const stats = [
    { label: "Total Stars", value: totalStars, detail: "repos tracked", icon: <Star className={ICON_CLASS} /> },
    { label: "Lists", value: listCount, detail: "collections", icon: <List className={ICON_CLASS} /> },
    { label: "Avg Health", value: avgHealth != null ? avgHealth.toFixed(1) : "—", detail: avgHealth != null ? "out of 10" : "not scored", icon: <Activity className={ICON_CLASS} /> },
    { label: "Top Language", value: topLanguage, detail: `${topLanguagePercent}% of repos`, icon: <Code className={ICON_CLASS} /> },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{stat.label}</p>
              {stat.icon}
            </div>
            <p className="mt-1 text-2xl font-bold tracking-tight">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
