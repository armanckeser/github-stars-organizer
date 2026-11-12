import { Plus } from "lucide-react";
import { BOARD_MAX, SLOT_COST } from "../../../server/run/rules";
import { BarButton } from "./bar-button";

/** How many cards are on the board of how many allowed, on the button that buys one more slot. */
export function TeamSlots({ count, limit, gold, onBuy }: { count: number; limit: number; gold: number; onBuy: () => void }) {
  const full = limit >= BOARD_MAX;
  return (
    <BarButton
      label={<>Slot <span className="bar-button-count" aria-label={`${count} of ${limit} cards on the board`}>{count}/{limit}</span></>}
      cost={full ? null : SLOT_COST}
      icon={<Plus className="size-4" strokeWidth={2.6} />}
      disabled={full || gold < SLOT_COST}
      onClick={onBuy}
      aria-label={full ? `${count} of ${limit} cards on the board` : `One more board slot for ${SLOT_COST} gold`}
    />
  );
}
