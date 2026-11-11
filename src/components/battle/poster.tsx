import { nameLines } from "../../../server/cards";
import type { Fighter } from "../../../server/battle";

const NO_LANGUAGE = "#3a4049";

// The same rule as the README cards (server/cards.ts): a flat poster in the colour of
// the repo's language, set in type. Sized by its container through container units.
function inkOn(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.6 ? "#14171a" : "#ffffff";
}

export function Poster({ fighter, className = "" }: { fighter: Fighter; className?: string }) {
  const color = fighter.color && /^#[0-9a-f]{6}$/i.test(fighter.color) ? fighter.color : NO_LANGUAGE;
  const [owner, name] = fighter.fullName.split("/");
  const lines = nameLines(name ?? fighter.fullName);
  const longest = Math.max(...lines.map((l) => l.length));
  // Mirrors the card: at most 22% of the width, smaller when the longest line needs the room.
  const size = Math.min(22, 82 / (longest * 0.6));
  return (
    <div
      className={`@container relative aspect-[2/3] overflow-hidden rounded-md ${fighter.shiny ? "ring-2 ring-[#f5c84b]" : "ring-1 ring-white/15"} ${className}`}
      style={{ backgroundColor: color, color: inkOn(color) }}
      title={fighter.fullName}
    >
      {fighter.avatarUrl && <img src={fighter.avatarUrl} alt="" className="absolute left-[9%] top-[6%] w-[24%] rounded-[18%]" loading="lazy" />}
      <div className="absolute inset-x-[9%] bottom-[6%] leading-none">
        <p className="truncate font-semibold opacity-75" style={{ fontSize: "6.8cqw", marginBottom: "3cqw" }}>{owner}</p>
        {lines.map((line, i) => (
          <p key={i} className="whitespace-nowrap font-extrabold tracking-tight" style={{ fontSize: `${size}cqw`, lineHeight: 1.02 }}>{line}</p>
        ))}
      </div>
    </div>
  );
}
