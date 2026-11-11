import { useEffect, useRef, useState } from "react";
import { ArenaWorld, type ArenaView, type Where } from "./three/world";

// How many times the scene is started: in full, then once more with the extras off
// after the browser drops the WebGL context (phones do, under memory pressure).
const STARTS = 2;

/**
 * The arena drawn in 3D (three/world.ts). Loaded on demand by ArenaStage, since the
 * engine is most of this screen's weight. A browser without WebGL gets the scene's
 * plain background; the nameplates and the text box still say everything that happens.
 */
export default function Arena3D({ onInspect, ...view }: ArenaView & { onInspect: (where: Where) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<ArenaWorld | null>(null);
  const inspect = useRef(onInspect);
  const [start, setStart] = useState(0);

  useEffect(() => {
    inspect.current = onInspect;
  });

  useEffect(() => {
    if (!host.current || start >= STARTS) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    try {
      world.current = new ArenaWorld(host.current, {
        reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        lite: start > 0,
        onInspect: (where) => inspect.current(where),
        onLost: () => (retry = setTimeout(() => setStart((count) => count + 1), 400)),
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
    world.current?.set(view);
  });

  return <div ref={host} className="absolute inset-0" />;
}
