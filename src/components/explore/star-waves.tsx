import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CHART_COLORS, FONT_FAMILY } from "./chart-colors";
import { ExploreTooltip } from "./explore-tooltip";
import { buildWaves, peakOf, OTHER, type WaveAxis, type WaveRepo } from "../../lib/star-waves";

// One way to sort repos into kinds: Lists, topics, language, tags.
export type WaveGrouping = { id: string; label: string; labelsOf: (repo: WaveRepo) => string[] };

type Props = {
  repos: WaveRepo[];
  groupings: WaveGrouping[];
  now: number;
};

const PANEL_HEIGHT = 44;
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

function Toggle<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { id: T; label: string }[]; onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      <span className="mr-1 text-xs text-muted-foreground">{label}</span>
      {options.map((o) => (
        <Button key={o.id} size="sm" variant={value === o.id ? "secondary" : "ghost"} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

export function StarWaves({ repos, groupings, now }: Props) {
  const [axis, setAxis] = useState<WaveAxis>("starred");
  // Only offer groupings that give at least two panels.
  const usable = useMemo(
    () => groupings.filter((g) => buildWaves(repos, g.labelsOf, "starred", now).kinds.filter((k) => k.name !== OTHER).length >= 2),
    [repos, groupings, now],
  );
  const [groupId, setGroupId] = useState<string | null>(null);
  const grouping = usable.find((g) => g.id === groupId) ?? usable[0];
  const waves = useMemo(() => (grouping ? buildWaves(repos, grouping.labelsOf, axis, now) : null), [repos, grouping, axis, now]);
  if (!grouping || !waves) return null;
  const named = waves.kinds.filter((k) => k.name !== OTHER);

  // "Other" is a catch-all, usually the biggest, and would flatten every panel.
  const others = waves.kinds.find((k) => k.name === OTHER)?.total ?? 0;
  const max = Math.max(...named.flatMap((k) => k.counts.map(([a, q]) => a + q)));
  const lead = named[0];
  const quietest = [...named].filter((k) => k.total >= 5).sort((a, b) => b.quiet / b.total - a.quiet / a.total)[0];
  const title = axis === "starred"
    ? `Your biggest run: ${lead.name}, peaking in ${peakOf(lead, waves.quarters)}`
    : quietest
      ? `${pct(quietest.quiet, quietest.total)}% of your ${quietest.name} stars have gone quiet`
      : `Most of your stars are ${lead.name}`;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            By {axis === "starred" ? "the quarter you starred each repo" : "the quarter each repo was created"}.
            {others ? ` ${others} repos outside the biggest ${grouping.label.toLowerCase()} groups are left out. ` : ""}
            Gray: archived or no commit in 6 months.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1">
          <Toggle label="Group by" value={grouping.id} options={usable.map((g) => ({ id: g.id, label: g.label }))} onChange={setGroupId} />
          <Toggle label="Date" value={axis} options={[{ id: "starred", label: "When you starred" }, { id: "created", label: "When created" }]} onChange={setAxis} />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {named.map((kind, i) => {
          const data = waves.quarters.map((quarter, qi) => ({ quarter, active: kind.counts[qi][0], quiet: kind.counts[qi][1] }));
          const lastPanel = i === named.length - 1;
          return (
            <div key={kind.name}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium text-foreground">{kind.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {kind.total} · {pct(kind.active, kind.total)}% active
                </span>
              </div>
              <ResponsiveContainer width="100%" height={PANEL_HEIGHT + (lastPanel ? 20 : 0)}>
                <BarChart data={data} margin={{ left: 0, right: 0, top: 2, bottom: 0 }} barCategoryGap={1}>
                  <XAxis
                    dataKey="quarter"
                    hide={!lastPanel}
                    tick={{ fontSize: 10, fill: CHART_COLORS.axisText, fontFamily: FONT_FAMILY }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide domain={[0, max]} />
                  <Tooltip
                    cursor={{ fill: CHART_COLORS.gridLine }}
                    content={<ExploreTooltip formatter={(value, name) => `${value} ${name}`} />}
                  />
                  <Bar dataKey="active" stackId="s" fill={CHART_COLORS.teal} isAnimationActive={false} />
                  <Bar dataKey="quiet" stackId="s" fill={CHART_COLORS.gray} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
        <details className="pt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Table</summary>
          <table className="mt-2 w-full tabular-nums">
            <thead>
              <tr className="text-left"><th className="font-medium">Kind</th><th className="font-medium">Repos</th><th className="font-medium">Active</th><th className="font-medium">Quiet</th></tr>
            </thead>
            <tbody>
              {waves.kinds.map((k) => (
                <tr key={k.name}><td>{k.name}</td><td>{k.total}</td><td>{k.active}</td><td>{k.quiet}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </CardContent>
    </Card>
  );
}
