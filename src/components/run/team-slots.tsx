import { Plus } from "lucide-react";
import { BOARD_MAX, SLOT_COST } from "../../../server/run/rules";

/** How many cards are on the board of how many allowed, and a slot to buy once gold has nothing else to go to. */
export function TeamSlots({ count, limit, gold, onBuy, className = "" }: { count: number; limit: number; gold: number; onBuy: () => void; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 sm:flex-col sm:items-stretch ${className}`}>
      <p className="text-center font-display text-sm font-[750] tabular-nums text-white/80 [font-stretch:108%]" aria-label={`${count} of ${limit} cards on the board`}>{count}/{limit}<span className="hidden sm:inline"> on board</span></p>
      {limit < BOARD_MAX && (
        <button type="button" className="hud-button flex h-8 items-center justify-center gap-1 px-2.5 text-xs" disabled={gold < SLOT_COST} onClick={onBuy} aria-label={`One more board slot for ${SLOT_COST} gold`}>
          <Plus className="size-3.5" /><span className="hidden sm:inline">Slot</span> <span className="shop-coin" />{SLOT_COST}
        </button>
      )}
    </div>
  );
}
