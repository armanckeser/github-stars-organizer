import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, FONT_FAMILY } from "./chart-colors";
import { ExploreTooltip } from "./explore-tooltip";

interface TimelineEntry {
  month: string;
  count: number;
}

interface StarringTimelineProps {
  data: TimelineEntry[];
}

export function StarringTimeline({ data }: StarringTimelineProps) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">When did you discover these repos?</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
            <defs>
              <linearGradient id="tealGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.teal} stopOpacity={0.4} />
                <stop offset="100%" stopColor={CHART_COLORS.teal} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_COLORS.gridLine} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: CHART_COLORS.axisText, fontFamily: FONT_FAMILY }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: CHART_COLORS.axisText, fontFamily: FONT_FAMILY }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip content={<ExploreTooltip formatter={(value) => `${value} starred`} />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke={CHART_COLORS.teal}
              fill="url(#tealGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
