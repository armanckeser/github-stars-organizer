import { useMemo } from "react";
import { figureImage, type Look } from "../../../server/character";

/** A character's figure. The same drawing the trainer card uses (server/character.ts). */
/** `supporter` adds the gold band worn by someone who starred Stard. */
export function Figure({ look, supporter = false, className = "", flip = false }: { look: Look; supporter?: boolean; className?: string; flip?: boolean }) {
  const src = useMemo(() => `data:image/svg+xml,${encodeURIComponent(figureImage(look, supporter))}`, [look, supporter]);
  return <img src={src} alt="" draggable={false} className={`select-none ${flip ? "-scale-x-100" : ""} ${className}`} />;
}
