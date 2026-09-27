import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ZAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, FONT_FAMILY } from "./chart-colors";

interface ScatterPoint {
  name: string;
  health: number;
  logStars: number;
  stars: number;
  forks: number;
}

interface StarsHealthScatterProps {
  data: ScatterPoint[];
}

function ScatterTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div
      style={{
        background: CHART_COLORS.tooltipBackground,
        border: `1px solid ${CHART_COLORS.tooltipBorder}`,
        borderRadius: 8,
        padding: "8px 12px",
        fontFamily: FONT_FAMILY,
        fontSize: 12,
      }}
    >
      <p style={{ color: "oklch(0.95 0 0)", fontWeight: 500, marginBottom: 2 }}>{point.name}</p>
      <p style={{ color: CHART_COLORS.teal, margin: 0 }}>Health: {point.health.toFixed(1)}/10</p>
      <p style={{ color: CHART_COLORS.grayLight, margin: 0 }}>{point.stars.toLocaleString()} stars · {point.forks.toLocaleString()} forks</p>
    </div>
  );
}

export function StarsHealthScatter({ data }: StarsHealthScatterProps) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Popularity vs. health</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid stroke={CHART_COLORS.gridLine} />
            <XAxis
              dataKey="health"
              type="number"
              domain={[0, 10]}
              name="Health"
              tick={{ fontSize: 11, fill: CHART_COLORS.axisText, fontFamily: FONT_FAMILY }}
              axisLine={false}
              tickLine={false}
              label={{ value: "Health Score", position: "insideBottom", offset: -2, fontSize: 10, fill: CHART_COLORS.gray }}
            />
            <YAxis
              dataKey="logStars"
              type="number"
              name="Stars (log)"
              tick={{ fontSize: 11, fill: CHART_COLORS.axisText, fontFamily: FONT_FAMILY }}
              axisLine={false}
              tickLine={false}
              width={32}
              label={{ value: "Stars (log)", angle: -90, position: "insideLeft", fontSize: 10, fill: CHART_COLORS.gray }}
            />
            <ZAxis dataKey="forks" range={[20, 200]} />
            <Tooltip content={<ScatterTooltipContent />} />
            <Scatter data={data} fill={CHART_COLORS.teal} fillOpacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
