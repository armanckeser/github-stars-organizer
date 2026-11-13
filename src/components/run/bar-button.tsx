import type { ReactNode } from "react";

// A shop bar button (docs/GAME-UI.md §5): slate, the label over its cost, an icon tile on the right. No border.

type Props = {
  label: ReactNode;
  /** The gold it costs, or null when it costs nothing more. */
  cost: number | null;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  "aria-label": string;
};

export function BarButton({ label, cost, icon, disabled, onClick, "aria-label": name }: Props) {
  return (
    <button type="button" className="bar-button" disabled={disabled} onClick={onClick} aria-label={name}>
      <span className="min-w-0">
        <span className="bar-button-label">{label}</span>
        {cost !== null && <span className="bar-button-cost"><span className="shop-coin" />{cost}</span>}
      </span>
      <span className="bar-button-tile" aria-hidden>{icon}</span>
    </button>
  );
}
