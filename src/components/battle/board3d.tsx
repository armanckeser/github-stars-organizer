import { useEffect, useRef, useState } from "react";
import type { Wearer } from "../../../server/character";
import type { FightClock } from "./fight-clock";
import { BoardWorld, type BoardFight, type BoardUnit, type Spot } from "./three/board";

declare global {
  interface Window {
    /** The board, for the browser tests (e2e/), in development builds only. */
    stardBoard?: Pick<BoardWorld, "screenOf" | "screenOfSlot" | "screenOfUnit" | "screenOfArchive">;
  }
}

export type BoardProps = {
  units: BoardUnit[];
  near: Wearer | null;
  far: Wearer | null;
  selected: string | null;
  /** The fight to play, or null between fights. */
  fight: BoardFight | null;
  speed: number;
  /** Set to the tick the fight has reached as it plays. */
  clock?: FightClock;
  /** Goes up by one to jump to the end of the fight. */
  skips: number;
  /** Free board cells a creature from the Drafts may take. */
  room: number;
  /** Screen pixels the shop covers along the bottom. */
  inset: number;
  onSelect: (id: string | null) => void;
  onFightEnd: (key: string) => void;
  /** What a creature sells for in the Archive, or null when it can't be sold. */
  sellPrice: (id: string) => number | null;
  /** A creature carried to a cell, a Drafts slot or the Archive. */
  onMove: (id: string, spot: Spot) => void;
  /** One of the player's creatures is being carried (its id), or was put down (null). */
  onDrag: (id: string | null) => void;
};

// Started in full, then once more with the extras off after the browser drops the WebGL context.
const STARTS = 2;

/** The run's board in 3D (three/board.ts). Loaded on demand, since the engine is most of the screen's weight. */
export default function Board3D(props: BoardProps) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<BoardWorld | null>(null);
  const latest = useRef(props);
  const skipped = useRef(props.skips);
  const [start, setStart] = useState(0);

  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    if (!host.current || start >= STARTS) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    try {
      world.current = new BoardWorld(host.current, {
        reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        lite: start > 0,
        onLost: () => (retry = setTimeout(() => setStart((count) => count + 1), 400)),
        onSelect: (id) => latest.current.onSelect(id),
        onFightEnd: (key) => latest.current.onFightEnd(key),
        onTick: (tick) => latest.current.clock?.set(tick),
        onDrag: (id) => latest.current.onDrag(id),
        onMove: (id, spot) => latest.current.onMove(id, spot),
        sellPrice: (id) => latest.current.sellPrice(id),
      });
      if (import.meta.env.DEV) window.stardBoard = world.current;
    } catch {
      return;
    }
    return () => {
      clearTimeout(retry);
      world.current?.dispose();
      world.current = null;
      if (import.meta.env.DEV) delete window.stardBoard;
    };
  }, [start]);

  useEffect(() => {
    const board = world.current;
    if (!board) return;
    board.setLooks(props.near, props.far);
    board.setSpeed(props.speed);
    board.setRoom(props.room);
    board.setInset(props.inset);
    if (props.fight) board.play(props.fight);
    else board.setUnits(props.units);
    board.setSelected(props.selected);
    if (props.skips !== skipped.current) {
      skipped.current = props.skips;
      board.skip();
    }
  });

  return <div ref={host} className="absolute inset-0" />;
}
