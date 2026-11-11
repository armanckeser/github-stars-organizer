import { useMemo } from "react";
import { figureImage, type Look } from "../../../server/character";

/** A character's figure. The same drawing the trainer card uses (server/character.ts). */
export function Figure({ look, className = "", flip = false }: { look: Look; className?: string; flip?: boolean }) {
  const src = useMemo(() => `data:image/svg+xml,${encodeURIComponent(figureImage(look))}`, [look]);
  return <img src={src} alt="" draggable={false} className={`select-none ${flip ? "-scale-x-100" : ""} ${className}`} />;
}
