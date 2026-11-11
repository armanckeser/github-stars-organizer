import { useEffect, useRef } from "react";
import { ArenaWorld, type ArenaView, type Where } from "./three/world";

/**
 * The arena drawn in 3D (three/world.ts). Loaded on demand by ArenaStage, since the
 * engine is most of this screen's weight. A browser without WebGL gets the scene's
 * plain background; the nameplates and the text box still say everything that happens.
 */
export default function Arena3D({ onInspect, ...view }: ArenaView & { onInspect: (where: Where) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<ArenaWorld | null>(null);
  const inspect = useRef(onInspect);

  useEffect(() => {
    inspect.current = onInspect;
  });

  useEffect(() => {
    if (!host.current) return;
    try {
      world.current = new ArenaWorld(host.current, {
        reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        onInspect: (where) => inspect.current(where),
      });
    } catch {
      return;
    }
    return () => {
      world.current?.dispose();
      world.current = null;
    };
  }, []);

  useEffect(() => {
    world.current?.set(view);
  });

  return <div ref={host} className="absolute inset-0" />;
}
