import { boostById } from "../../../server/run/boosts";
import { setName } from "../../../server/run/names";
import { teamSets, type TeamSet } from "../../../server/run/sets";
import type { Card } from "../../../server/run/types";

// The team's sets as a pull request's checks: a green check is a set whose bonus is
// live, an amber ring is one still waiting for another card. Each row says how many
// cards share the set of how many the next bonus needs. The bonus text shows on hover.

const TIERS = [2, 3] as const;

type Row = { set: string; have: number; next: number; live: boolean; entry: TeamSet };

function rowsOf(cards: Card[]): Row[] {
  return teamSets({ units: cards.map((card) => ({ card, col: 0, row: 0 })) })
    // A set two cards share with no bonus between them can never give one: it is not a check.
    .filter((entry) => entry.bonus && (entry.tier || entry.members.length < 2))
    .map((entry) => {
      const have = entry.members.length;
      return { set: entry.set, have, next: TIERS.find((tier) => tier > have) ?? TIERS[TIERS.length - 1], live: Boolean(entry.tier), entry };
    })
    .sort((a, b) => Number(b.live) - Number(a.live) || b.have - a.have);
}

export function Checks({ title, cards, boosts, align = "left" }: { title: string; cards: Card[]; boosts: string[]; align?: "left" | "right" }) {
  const rows = rowsOf(cards);
  const held = boosts.flatMap((id) => boostById(id) ?? []);
  if (rows.length === 0 && held.length === 0) return null;
  const passing = rows.filter((row) => row.live).length;
  return (
    <div className={`checks pointer-events-auto ${align === "right" ? "checks-right" : ""}`} aria-label={`${passing} of ${rows.length} set bonuses live`}>
      <p className="checks-head"><span>{title}</span><span className="tabular-nums">{passing}/{rows.length}</span></p>
      <ul className="space-y-px">
        {rows.map((row) => (
          <li key={row.set} tabIndex={0} className="check-row group" data-live={row.live ? "" : undefined} data-testid="set-bonus">
            <span className="check-mark" aria-hidden />
            <span className="check-name">{setName(row.set)}</span>
            <span className="check-count">{row.have}<span className="text-white/35">/{row.next}</span></span>
            <span className="check-detail" role="tooltip">
              <span className="block font-display text-[13px] font-[750] [font-stretch:108%]">{row.entry.bonus!.name}</span>
              {TIERS.map((tier) => (
                <span key={tier} className="mt-1 flex gap-2 text-[12px] leading-snug" data-on={row.have >= tier ? "" : undefined}>
                  <span className="check-tier">{tier}</span>
                  <span>{(tier === 2 ? row.entry.bonus!.two : row.entry.bonus!.three).text}</span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {held.length > 0 && (
        <ul className="mt-2 flex gap-1.5 px-1.5">
          {held.map((boost) => (
            <li key={boost.id} tabIndex={0} className="check-row check-boost group" data-testid="boost-held" aria-label={boost.name}>
              <span className="boost-pip" aria-hidden />
              <span className="check-detail" role="tooltip">
                <span className="block font-display text-[13px] font-[750] [font-stretch:108%]">{boost.name}</span>
                <span className="mt-1 block text-[12px] leading-snug">{boost.text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
