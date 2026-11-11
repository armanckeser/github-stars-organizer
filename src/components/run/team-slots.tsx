import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BOARD_MAX, SLOT_COST } from "../../../server/run/rules";

/** How many cards are on the board of how many allowed, and a slot to buy once gold has nothing else to go to. */
export function TeamSlots({ count, limit, gold, onBuy, className = "" }: { count: number; limit: number; gold: number; onBuy: () => void; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 sm:flex-col sm:items-stretch ${className}`}>
      <p className="text-center text-xs tabular-nums text-white/70" aria-label={`${count} of ${limit} cards on the board`}>Team {count}/{limit}</p>
      {limit < BOARD_MAX && (
        <Button variant="outline" size="sm" disabled={gold < SLOT_COST} onClick={onBuy} aria-label={`One more board slot for ${SLOT_COST} gold`}>
          <Plus /> Slot · {SLOT_COST}
        </Button>
      )}
    </div>
  );
}
