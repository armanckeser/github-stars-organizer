import { useEffect, useState } from "react";

/** Frames drawn in the last second, in the corner, when the page's address has `?fps=1`. */
export function FpsMeter() {
  const [on] = useState(() => new URLSearchParams(window.location.search).get("fps") === "1");
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    if (!on) return;
    let frames = 0;
    let since = performance.now();
    let raf = requestAnimationFrame(function count(now) {
      frames++;
      if (now - since >= 1000) {
        setFps(Math.round((frames * 1000) / (now - since)));
        frames = 0;
        since = now;
      }
      raf = requestAnimationFrame(count);
    });
    return () => cancelAnimationFrame(raf);
  }, [on]);
  if (!on) return null;
  return <p className="pointer-events-none absolute left-1/2 top-12 z-40 -translate-x-1/2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-[#35c450]" data-testid="fps">{fps ?? "--"} fps</p>;
}
