import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TYPE, useCreature } from "@/components/battle/repo-card";
import { repoName } from "@/components/battle/arena";
import type { BoardHandle } from "@/components/battle/board3d";
import type { RunFighter } from "../../../server/run/rules";
import { benchDrop, dropTargetAt, markDropTarget } from "./drop-target";

/** Where a card carried from the bench was put down. */
export type BenchDrop = { kind: "bench"; slot: number } | { kind: "shop" } | { kind: "board"; col: number; row: number };

type Props = {
  slots: (RunFighter | null)[];
  /** The board, to find the cell a card is put down on. */
  board: React.RefObject<BoardHandle | null>;
  onOpen: (slot: number) => void;
  onDrop: (slot: number, drop: BenchDrop) => void;
  onDrag: (fighter: RunFighter | null) => void;
};

/** Cards bought and not yet placed, between the board and the shop. Drag one onto the board, another slot, or the shop to sell. */
export function Bench({ slots, board, onOpen, onDrop, onDrag }: Props) {
  const drag = useRef<{ slot: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [carried, setCarried] = useState<{ slot: number; x: number; y: number } | null>(null);

  function down(event: React.PointerEvent, slot: number) {
    if (event.button !== 0) return;
    drag.current = { slot, startX: event.clientX, startY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent) {
    const current = drag.current;
    if (!current) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 8) return;
    if (!current.moved) onDrag(slots[current.slot]);
    current.moved = true;
    setCarried({ slot: current.slot, x: event.clientX, y: event.clientY });
    markDropTarget(event.clientX, event.clientY);
    board.current?.hover(event);
  }

  function up(event: React.PointerEvent) {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (!current.moved) return onOpen(current.slot);
    setCarried(null);
    markDropTarget(null, null);
    board.current?.hover(null);
    onDrag(null);
    const target = dropTargetAt(event.clientX, event.clientY);
    if (target) return onDrop(current.slot, target);
    const cell = board.current?.cellAt(event);
    if (cell) onDrop(current.slot, { kind: "board", ...cell });
  }

  function cancel() {
    if (drag.current?.moved) onDrag(null);
    drag.current = null;
    setCarried(null);
    markDropTarget(null, null);
    board.current?.hover(null);
  }

  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2" aria-label="Bench">
      {slots.map((fighter, slot) => (
        <div
          key={slot}
          data-drop={benchDrop(slot)}
          data-testid={`bench-${slot}`}
          className="h-12 rounded-md border border-dashed border-white/15 transition-colors data-[over]:border-[#35c450] data-[over]:bg-[#35c450]/15 sm:h-14"
        >
          {fighter && (
            <BenchCard
              fighter={fighter}
              lifted={carried?.slot === slot}
              onOpen={() => onOpen(slot)}
              onPointerDown={(event) => down(event, slot)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={cancel}
            />
          )}
        </div>
      ))}
      {carried && slots[carried.slot] && <Ghost fighter={slots[carried.slot]!} x={carried.x} y={carried.y} />}
    </div>
  );
}

type CardEvents = Pick<React.HTMLAttributes<HTMLButtonElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel">;

function BenchCard({ fighter, lifted, onOpen, ...events }: { fighter: RunFighter; lifted: boolean; onOpen: () => void } & CardEvents) {
  const art = useCreature(fighter);
  const type = TYPE[fighter.type];
  return (
    <button
      type="button"
      {...events}
      // A click with no pointer behind it is a key press: open the card, the way a tap does.
      onClick={(event) => event.detail === 0 && onOpen()}
      aria-label={`${fighter.fullName} on the bench`}
      className={`flex size-full touch-none items-center gap-1 overflow-hidden rounded-md border-2 px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${lifted ? "opacity-30" : ""}`}
      style={{ borderColor: type.color, background: `linear-gradient(90deg, ${type.color}44, #0c1014 80%)`, cursor: "grab" }}
    >
      {art && <img src={art} alt="" className="size-9 shrink-0 object-contain sm:size-11" draggable={false} />}
      <span className="hidden min-w-0 truncate font-display text-[11px] font-bold leading-tight sm:block">{repoName(fighter)}</span>
    </button>
  );
}

function Ghost({ fighter, x, y }: { fighter: RunFighter; x: number; y: number }) {
  const art = useCreature(fighter);
  // On the page itself: the bench's panel blurs what is behind it, which would pin a fixed element to the panel.
  return createPortal(
    <div className="pointer-events-none fixed z-50 size-16 -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }} aria-hidden>
      {art && <img src={art} alt="" className="size-full object-contain drop-shadow-lg" draggable={false} />}
    </div>,
    document.body,
  );
}
