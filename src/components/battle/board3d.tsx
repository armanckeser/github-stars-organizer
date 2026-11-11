import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Look } from "../../../server/character";
import { dropTargetAt, markDropTarget, type DropTarget } from "../run/drop-target";
import { BoardWorld, type BoardFight, type BoardUnit, type Point } from "./three/board";

/** What the screen around the board can ask of it: for a creature carried in from the bench. */
export type BoardHandle = { cellAt: (point: Point) => { col: number; row: number } | null; hover: (point: Point | null) => void };

declare global {
  interface Window {
    /** The board, for the browser tests (e2e/), in development builds only. */
    stardBoard?: Pick<BoardWorld, "screenOf" | "screenOfUnit">;
  }
}

export type BoardProps = {
  units: BoardUnit[];
  near: Look | null;
  far: Look | null;
  selected: string | null;
  /** The fight to play, or null between fights. */
  fight: BoardFight | null;
  speed: number;
  /** Goes up by one to jump to the end of the fight. */
  skips: number;
  onPlace: (id: string, col: number, row: number) => void;
  onSelect: (id: string | null) => void;
  onFightEnd: (key: string) => void;
  /** A creature from the board put down on the bench or the shop. */
  onDrop: (id: string, target: DropTarget) => void;
  /** A creature from the board is being carried (its id), or was put down (null). */
  onDrag: (id: string | null) => void;
  handle?: React.Ref<BoardHandle>;
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
        onPlace: (...args) => latest.current.onPlace(...args),
        onSelect: (id) => latest.current.onSelect(id),
        onFightEnd: (key) => latest.current.onFightEnd(key),
        onDrag: (id) => latest.current.onDrag(id),
        onDragAt: (point) => markDropTarget(point?.clientX ?? null, point?.clientY ?? null),
        onDrop: (id, point) => {
          const target = dropTargetAt(point.clientX, point.clientY);
          if (target) latest.current.onDrop(id, target);
          return target !== null;
        },
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

  useImperativeHandle(props.handle, () => ({
    cellAt: (point) => world.current?.cellAt(point) ?? null,
    hover: (point) => world.current?.hover(point),
  }), []);

  useEffect(() => {
    const board = world.current;
    if (!board) return;
    board.setLooks(props.near, props.far);
    board.setSpeed(props.speed);
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
