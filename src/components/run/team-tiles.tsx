import { costOf, type RunFighter } from "@/lib/run";
import { tierColor } from "../../../server/run/tiers";
import { CardFace } from "./shop";

/** A team's cards, front row first, each with the shop card's face (docs/GAME-UI.md §4), so the team reads as the cards it was bought as. */
export function TeamTiles({ units }: { units: { fighter: RunFighter; col: number; row: number }[] }) {
  const ordered = [...units].sort((a, b) => a.row - b.row || a.col - b.col);
  return (
    <ul className="team-cards" aria-label="Team">
      {ordered.map(({ fighter }) => (
        <li key={fighter.fullName} className="shop-card" title={fighter.fullName} style={{ "--tier": tierColor(costOf(fighter)) } as React.CSSProperties}>
          <CardFace fighter={fighter} />
        </li>
      ))}
    </ul>
  );
}
