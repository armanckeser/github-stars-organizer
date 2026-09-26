import { type ReactNode } from "react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Area,
  AreaChart,
  Pie,
  PieChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface StatConfig {
  label: string;
  value: number | string;
  description?: string;
  icon?: ReactNode;
}

interface ChartConfig {
  title: string;
  type: "bar" | "line" | "area" | "pie";
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string | string[];
  span?: number;
  colors?: string[];
}

interface DashboardProps {
  stats?: StatConfig[];
  charts: ChartConfig[];
  columns?: number;
}

export function Dashboard({ stats, charts, columns = 3 }: DashboardProps) {
  return (
    <div className="space-y-6">
      {stats && stats.length > 0 && (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          {stats.map((stat, i) => (
            <StatCard key={i} stat={stat} />
          ))}
        </div>
      )}

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {charts.map((chart, i) => (
          <Card key={i} style={{ gridColumn: `span ${chart.span ?? 1}` }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{chart.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartRenderer config={chart} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatCard({ stat }: { stat: StatConfig }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{stat.label}</p>
          {stat.icon}
        </div>
        <p className="mt-1 text-2xl font-bold">{stat.value}</p>
        {stat.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{stat.description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ChartRenderer({ config }: { config: ChartConfig }) {
  const colors = config.colors ?? COLORS;
  const yKeys = Array.isArray(config.yKey) ? config.yKey : [config.yKey];
  const height = 250;

  if (config.data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
        No data
      </div>
    );
  }

  switch (config.type) {
    case "bar":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={config.data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey={config.xKey} className="text-xs" tick={{ fontSize: 12 }} />
            <YAxis className="text-xs" tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            {yKeys.length > 1 && <Legend />}
            {yKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );

    case "line":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={config.data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey={config.xKey} className="text-xs" tick={{ fontSize: 12 }} />
            <YAxis className="text-xs" tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            {yKeys.length > 1 && <Legend />}
            {yKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );

    case "area":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={config.data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey={config.xKey} className="text-xs" tick={{ fontSize: 12 }} />
            <YAxis className="text-xs" tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            {yKeys.length > 1 && <Legend />}
            {yKeys.map((key, i) => (
              <Area key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.2} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );

    case "pie":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={config.data}
              dataKey={yKeys[0]}
              nameKey={config.xKey}
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {config.data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      );
  }
}
