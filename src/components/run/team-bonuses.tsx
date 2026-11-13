import { useState } from "react";
import { Layers, Sparkles } from "lucide-react";
import { boostById } from "../../../server/run/boosts";
import { setName } from "../../../server/run/names";
import { teamSets } from "../../../server/run/sets";
import type { Card } from "../../../server/run/types";

/** The team's set bonuses and boosts, beside the board. Tap to read what each does. */
export function TeamBonuses({ cards, boosts, className = "" }: { cards: Card[]; boosts: string[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const sets = teamSets({ units: cards.map((card) => ({ card, col: 0, row: 0 })) }).flatMap((entry) => (entry.tier ? [{ ...entry, tier: entry.tier }] : []));
  const held = boosts.flatMap((id) => boostById(id) ?? []);
  if (sets.length === 0 && held.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label="Set bonuses and boosts"
      className={`pointer-events-auto block max-w-60 space-y-1 rounded-lg border border-white/15 bg-[#0c1014]/90 px-2.5 py-1.5 text-left text-xs shadow-lg outline-none backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      {sets.map(({ set, members, bonus, tier }) => (
        <span key={set} className="block" data-testid="set-bonus">
          <span className="flex items-center gap-1.5">
            <Layers className="size-3.5 shrink-0 text-[#35c450]" aria-hidden />
            <span className="font-semibold tabular-nums">{setName(set)} {members.length}</span>
            <span className="truncate text-white/70">{bonus.does}</span>
          </span>
          {open && <span className="block pl-5 text-white/70">{tier.text}</span>}
        </span>
      ))}
      {held.map((boost) => (
        <span key={boost.id} className="block" data-testid="boost-held">
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 shrink-0 text-[#ffd84d]" aria-hidden />
            <span className="truncate font-semibold">{boost.name}</span>
          </span>
          {open && <span className="block pl-5 text-white/70">{boost.text}</span>}
        </span>
      ))}
    </button>
  );
}
