import { Icon } from "lucide-react";
import { markOf } from "../../../server/run/set-glyph";

/** The set's hex (marks in server/run/set-glyph.ts). `language` is the card's language, lower-case, so its first set reads as initials. */
export function SetGlyph({ set, language }: { set: string; language?: string | null }) {
  const mark = markOf(set, language);
  return (
    <span className="set-hex" aria-hidden>
      {mark.kind === "icon" && <Icon iconNode={mark.node} className="size-[9px]" strokeWidth={2.5} />}
      {mark.kind === "initials" && <span className="set-initials" data-long={mark.text.length > 2 ? "" : undefined}>{mark.text}</span>}
      {mark.kind === "topic" && <Icon iconNode={mark.node} className="size-[8px]" strokeWidth={2.6} />}
    </span>
  );
}
