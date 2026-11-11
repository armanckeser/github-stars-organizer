import { useEffect, useRef, useState } from "react";
import type { Wearer } from "../../../server/character";
import { BoardWorld, type BoardFight, type BoardUnit } from "./three/board";

export type BoardProps = {
  units: BoardUnit[];
  near: Wearer | null;
  far: Wearer | null;
  selected: string | null;
  /** The fight to play, or null between fights. */
  fight: BoardFight | null;
  speed: number;
  /** Goes up by one to jump to the end of the fight. */
  skips: number;
  onPlace: (id: string, col: number, row: number) => void;
  onSelect: (id: string | null) => void;
  onFightEnd: (key: string) => void;
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
      });
    } catch {
      return;
    }
    return () => {
      clearTimeout(retry);
      world.current?.dispose();
      world.current = null;
    };
  }, [start]);

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
