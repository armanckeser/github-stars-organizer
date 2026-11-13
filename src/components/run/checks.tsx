import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { boostById } from "../../../server/run/boosts";
import { setName } from "../../../server/run/names";
import { checksOf, TIERS, type TeamSet } from "../../../server/run/sets";
import type { Card } from "../../../server/run/types";
import { foldedCount } from "./checks-fold";

// The team's sets as a pull request's checks: a green check is a set whose bonus is
// live, an amber ring is one still waiting for another card. Each row names the set and
// what it does in a word, then how many cards share it of how many the next bonus
// needs. The bonus text and the cards in the set show on hover.
// A folded list holds the live sets and the one closest to going live, at most three
// rows, so it never covers a phone's board or the other side's character (docs/GAME-UI.md §7).

const repoName = (fullName: string) => fullName.split("/")[1] ?? fullName;

/** `repos` are the names of the board's cards in the set, so a player sees what fills it. */
type Row = { set: string; have: number; next: number; live: boolean; entry: TeamSet; repos: string[] };

function rowsOf(cards: Card[]): Row[] {
  return checksOf({ units: cards.map((card) => ({ card, col: 0, row: 0 })) }).map((entry) => {
    const have = entry.members.length;
    const repos = entry.members.map((index) => repoName(cards[index].fullName));
    return { set: entry.set, have, next: entry.next?.at ?? TIERS[TIERS.length - 1], live: Boolean(entry.tier), entry, repos };
  });
}

type Props = { title: string; cards: Card[]; boosts: string[]; align?: "left" | "right"; /** Fold the list to its live sets and the closest one until it is opened. */ folds?: boolean };

export function Checks({ title, cards, boosts, align = "left", folds = false }: Props) {
  const [opened, setOpened] = useState(false);
  const rows = rowsOf(cards);
  const held = boosts.flatMap((id) => boostById(id) ?? []);
  if (rows.length === 0 && held.length === 0) return null;
  const passing = rows.filter((row) => row.live).length;
  const foldable = folds && rows.length > foldedCount(rows);
  const shown = foldable && !opened ? rows.slice(0, foldedCount(rows)) : rows;
  return (
    <div className={`checks pointer-events-auto ${align === "right" ? "checks-right" : ""}`} aria-label={`${passing} of ${rows.length} set bonuses live`}>
      {foldable ? (
        <button type="button" className="checks-head checks-toggle" aria-expanded={opened} onClick={() => setOpened(!opened)}>
          <span className="truncate">{title}</span>
          <span className="flex shrink-0 items-center gap-1 tabular-nums">{passing}/{rows.length}<ChevronDown className="size-3" style={{ rotate: opened ? "180deg" : "0deg" }} /></span>
        </button>
      ) : (
        <p className="checks-head"><span className="truncate">{title}</span><span className="shrink-0 tabular-nums">{passing}/{rows.length}</span></p>
      )}
      <ul className="space-y-px">
        {shown.map((row) => (
          <li key={row.set} tabIndex={0} className="check-row group" data-live={row.live ? "" : undefined} data-testid="set-bonus">
            <span className="check-mark" aria-hidden />
            <span className="check-name">{setName(row.set)} <span className="check-does">{row.entry.bonus.does}</span></span>
            <span className="check-count">{row.have}<span className="text-white/35">/{row.next}</span></span>
            <span className="check-detail" role="tooltip">
              <span className="block font-display text-[13px] font-bold">{setName(row.set)}: {row.entry.bonus.does}</span>
              {row.entry.bonus.tiers.map((tier) => (
                <span key={tier.at} className="mt-1 flex gap-2 text-[12px] leading-snug" data-on={row.have >= tier.at ? "" : undefined}>
                  <span className="check-tier">{tier.at}</span>
                  <span>{tier.text}</span>
                </span>
              ))}
              <span className="check-repos mt-1.5 block text-[11px] leading-snug">{row.repos.join(", ")}</span>
            </span>
          </li>
        ))}
      </ul>
      {shown.length < rows.length && (
        <button type="button" className="checks-more" onClick={() => setOpened(true)}>
          +{rows.length - shown.length} more
        </button>
      )}
      {held.length > 0 && (
        <ul className="mt-2 flex gap-1.5 px-1.5">
          {held.map((boost) => (
            <li key={boost.id} tabIndex={0} className="check-row check-boost group" data-testid="boost-held" aria-label={boost.name}>
              <span className="boost-pip" aria-hidden />
              <span className="check-detail" role="tooltip">
                <span className="block font-display text-[13px] font-bold">{boost.name}</span>
                <span className="mt-1 block text-[12px] leading-snug">{boost.text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
