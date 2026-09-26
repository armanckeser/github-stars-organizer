import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, FONT_FAMILY } from "./chart-colors";
import { ExploreTooltip } from "./explore-tooltip";

export interface FreshnessBucket {
  label: string;
  count: number;
  color: string;
}

interface FreshnessChartProps {
  data: FreshnessBucket[];
}

export function FreshnessChart({ data }: FreshnessChartProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">How fresh is your collection?</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={100}
              tick={{ fontSize: 12, fill: CHART_COLORS.axisText, fontFamily: FONT_FAMILY }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ExploreTooltip formatter={(value) => `${value} repos`} />} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                style={{ fontSize: 12, fill: CHART_COLORS.grayLight, fontFamily: FONT_FAMILY }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
