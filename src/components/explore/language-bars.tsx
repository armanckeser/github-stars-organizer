import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, FONT_FAMILY } from "./chart-colors";
import { ExploreTooltip } from "./explore-tooltip";

interface LanguageEntry {
  language: string;
  count: number;
}

interface LanguageBarsProps {
  data: LanguageEntry[];
}

export function LanguageBars({ data }: LanguageBarsProps) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Languages</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={data.length * 32 + 16}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 40, top: 4, bottom: 4 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="language"
              width={90}
              tick={{ fontSize: 12, fill: CHART_COLORS.axisText, fontFamily: FONT_FAMILY }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ExploreTooltip formatter={(value) => `${value} repos`} />} />
            <Bar dataKey="count" fill={CHART_COLORS.teal} radius={[0, 4, 4, 0]} barSize={18}>
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
