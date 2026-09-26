import { CHART_COLORS, FONT_FAMILY } from "./chart-colors";

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface ExploreTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  formatter?: (value: number, name: string) => string;
}

export function ExploreTooltip({ active, payload, label, formatter }: ExploreTooltipProps) {
  if (!active || !payload?.length) return null;

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
      {label && (
        <p style={{ color: "oklch(0.95 0 0)", marginBottom: 4, fontWeight: 500 }}>{label}</p>
      )}
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color, margin: 0, lineHeight: 1.6 }}>
          {formatter ? formatter(entry.value, entry.name) : `${entry.name}: ${entry.value}`}
        </p>
      ))}
    </div>
  );
}
