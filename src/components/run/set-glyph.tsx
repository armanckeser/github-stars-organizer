import { Icon } from "lucide-react";
import { markOf } from "../../../server/run/set-glyph";

/** The set's hex (marks in server/run/set-glyph.ts). */
export function SetGlyph({ set }: { set: string }) {
  const mark = markOf(set);
  return (
    <span className="set-hex" aria-hidden>
      {mark.kind === "icon" && <Icon iconNode={mark.node} className="size-[9px]" strokeWidth={2.5} />}
      {mark.kind === "topic" && <Icon iconNode={mark.node} className="size-[8px]" strokeWidth={2.6} />}
    </span>
  );
}
