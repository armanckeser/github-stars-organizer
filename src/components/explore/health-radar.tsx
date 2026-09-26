import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, FONT_FAMILY } from "./chart-colors";
import { ExploreTooltip } from "./explore-tooltip";

export interface HealthDimension {
  dimension: string;
  label: string;
  value: number;
}

interface HealthRadarProps {
  data: HealthDimension[];
}

export function HealthRadar({ data }: HealthRadarProps) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Where are your repos weakest?</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke={CHART_COLORS.gridLine} />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: CHART_COLORS.grayLight, fontFamily: FONT_FAMILY }}
            />
            <PolarRadiusAxis
              domain={[0, 10]}
              tick={{ fontSize: 10, fill: CHART_COLORS.gray }}
              axisLine={false}
            />
            <Tooltip content={<ExploreTooltip formatter={(value) => `${value.toFixed(1)} / 10`} />} />
            <Radar
              dataKey="value"
              stroke={CHART_COLORS.teal}
              fill={CHART_COLORS.teal}
              fillOpacity={0.25}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
