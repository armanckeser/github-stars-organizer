import { useMemo, useRef } from "react";
import { BookOpen, ChartColumn, Cpu, Globe, Smartphone, Star, Terminal, type LucideIcon } from "lucide-react";
import { seededRandom, type CardType, type Fighter } from "../../../server/battle";

// A repo as a trading card (issue #45). One rule for the look: the frame is the
// card's type, the art is the repo's language colour under a commit-graph pattern
// with the owner's avatar, and every number on the card is a fact about the repo.
// Everything is sized in container units, so the same card works on the bench at
// 60px wide and in the inspect view at 360px.

export const TYPE: Record<CardType, { label: string; color: string; Icon: LucideIcon }> = {
  systems: { label: "Systems", color: "#d9482b", Icon: Cpu },
  scripts: { label: "Scripts", color: "#7c5cd6", Icon: Terminal },
  web: { label: "Web", color: "#1f8fe0", Icon: Globe },
  apps: { label: "Apps", color: "#1fa866", Icon: Smartphone },
  data: { label: "Data", color: "#d99a0b", Icon: ChartColumn },
  docs: { label: "Docs", color: "#77818d", Icon: BookOpen },
};

const NO_LANGUAGE = "#3a4049";
const GRID_COLUMNS = 12;
const GRID_ROWS = 7;

function isLight(color: string): boolean {
  const n = parseInt(color.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
}

function compact(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}

export function TypeDot({ type, size }: { type: CardType; size: string }) {
  const { color, Icon, label } = TYPE[type];
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full text-white" style={{ background: color, width: size, height: size }} title={label}>
      <Icon style={{ width: "62%", height: "62%" }} strokeWidth={2.4} aria-hidden />
    </span>
  );
}

// The art's pattern: a commit graph that is the same every time for the same repo.
function CommitGrid({ seed, ink }: { seed: string; ink: string }) {
  const cells = useMemo(() => {
    const random = seededRandom(seed);
    return Array.from({ length: GRID_COLUMNS * GRID_ROWS }, () => {
      const roll = random();
      return roll < 0.35 ? 0.06 : roll < 0.65 ? 0.14 : roll < 0.88 ? 0.24 : 0.4;
    });
  }, [seed]);
  return (
    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`, gap: "1cqw", padding: "1.6cqw" }} aria-hidden>
      {cells.map((opacity, i) => (
        <span key={i} style={{ background: ink, opacity, borderRadius: "0.9cqw" }} />
      ))}
    </div>
  );
}

function MoveRow({ fighter, index }: { fighter: Fighter; index: 0 | 1 }) {
  const move = fighter.moves[index];
  return (
    <div className="flex items-center" style={{ gap: "2cqw", padding: "1.5cqw 3.6cqw" }}>
      <span className="flex shrink-0" style={{ gap: "0.8cqw", width: "15cqw" }}>
        {Array.from({ length: index === 0 ? 1 : 3 }, (_, i) => <TypeDot key={i} type={fighter.type} size="4.4cqw" />)}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold" style={{ fontSize: "4.8cqw" }}>{move.name}</span>
      <span className="font-display font-bold tabular-nums" style={{ fontSize: "6.4cqw", lineHeight: 1 }}>{move.damage}</span>
    </div>
  );
}

export function RepoCard({ fighter, tilt = false, className = "" }: { fighter: Fighter; tilt?: boolean; className?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const type = TYPE[fighter.type];
  const language = fighter.color && /^#[0-9a-f]{6}$/i.test(fighter.color) ? fighter.color : NO_LANGUAGE;
  const ink = isLight(language) ? "#14171a" : "#ffffff";
  const [owner, name] = fighter.fullName.split("/");
  const title = name ?? fighter.fullName;
  // The name shrinks to stay on one line; past the smallest size, the rest is cut off.
  const nameSize = Math.max(3.4, Math.min(7.2, 46 / (title.length * 0.66)));

  // The card leans toward the pointer, and the foil's glare follows. Mouse only: a touch has no hover.
  function lean(event: React.PointerEvent) {
    if (!tilt || event.pointerType !== "mouse" || !frame.current) return;
    const box = frame.current.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    frame.current.style.transform = `perspective(900px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg)`;
    frame.current.style.setProperty("--glare-x", `${(x + 0.5) * 100}%`);
    frame.current.style.setProperty("--glare-y", `${(y + 0.5) * 100}%`);
  }
  function settle() {
    if (frame.current) frame.current.style.transform = "";
  }

  return (
    <div className={`@container select-none ${className}`} onPointerMove={lean} onPointerLeave={settle}>
      <div
        ref={frame}
        className="relative aspect-[5/7] overflow-hidden text-[#1b1d21] transition-transform duration-200 ease-out will-change-transform"
        style={{
          background: fighter.shiny ? `linear-gradient(135deg, #f5c84b, ${type.color} 30%, ${type.color} 70%, #f5c84b)` : type.color,
          borderRadius: "5cqw",
          padding: "3.2cqw",
          boxShadow: "0 1.5cqw 5cqw rgba(0,0,0,0.5), inset 0 0 0 0.4cqw rgba(255,255,255,0.25)",
        }}
      >
        <div className="flex h-full flex-col overflow-hidden bg-[#f5f1e8]" style={{ borderRadius: "2.6cqw" }}>
          <div className="flex items-end" style={{ gap: "1.6cqw", padding: "2.2cqw 3cqw 0" }}>
            <span className="shrink-0 rounded-full bg-[#1b1d21] font-semibold text-[#f5f1e8]" style={{ fontSize: "3cqw", padding: "0.5cqw 1.8cqw", marginBottom: "0.8cqw" }}>
              Lv {fighter.level}
            </span>
            <h3 className="min-w-0 flex-1 truncate font-display font-bold tracking-tight" style={{ fontSize: `${nameSize}cqw`, lineHeight: 1.15 }}>{title}</h3>
            <span className="flex shrink-0 items-end font-display font-bold tabular-nums" style={{ fontSize: "7cqw", lineHeight: 1.1, gap: "0.8cqw" }}>
              <span className="font-sans font-semibold" style={{ fontSize: "3cqw", marginBottom: "0.9cqw" }}>HP</span>
              {fighter.hp}
            </span>
            <span style={{ marginBottom: "0.6cqw" }}><TypeDot type={fighter.type} size="7cqw" /></span>
          </div>

          <div
            className={`relative min-h-0 flex-1 overflow-hidden ${fighter.retired ? "grayscale" : ""}`}
            style={{ background: language, margin: "1.6cqw 3cqw 0", borderRadius: "1.6cqw", border: "0.9cqw solid #cfc6ae" }}
          >
            <CommitGrid seed={fighter.fullName} ink={ink} />
            {fighter.avatarUrl && (
              <img
                src={fighter.avatarUrl}
                alt=""
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ width: "40%", borderRadius: "18%", boxShadow: `0 0 0 1cqw ${ink === "#ffffff" ? "rgba(255,255,255,0.85)" : "rgba(20,23,26,0.85)"}, 0 2cqw 5cqw rgba(0,0,0,0.35)` }}
                draggable={false}
              />
            )}
            {fighter.retired && (
              <span className="absolute bg-[#1b1d21] font-semibold uppercase text-[#f5f1e8]" style={{ right: "2cqw", bottom: "2cqw", fontSize: "3cqw", padding: "0.4cqw 1.8cqw", borderRadius: "1cqw", letterSpacing: "0.08em" }}>
                Archived
              </span>
            )}
          </div>

          <p className="truncate text-center font-medium" style={{ fontSize: "3.1cqw", margin: "1.2cqw 3cqw 0", padding: "0.7cqw 2cqw", borderRadius: "1cqw", background: `${type.color}26` }}>
            {fighter.language ?? "No language"} · {compact(fighter.stars)} stars · {compact(fighter.contributors)} people · {compact(fighter.commits)} commits · {fighter.age < 1 ? "new" : `${fighter.age} yr`}
          </p>

          <div className="flex flex-col" style={{ margin: "1cqw 0" }}>
            <MoveRow fighter={fighter} index={0} />
            <div style={{ height: "0.25cqw", margin: "0 3.6cqw", background: "#1b1d2122" }} />
            <MoveRow fighter={fighter} index={1} />
          </div>

          <div className="grid grid-cols-3 items-center font-medium" style={{ fontSize: "2.9cqw", padding: "1.2cqw 3.4cqw", borderTop: "0.25cqw solid #1b1d2122" }}>
            <span className="flex items-center" style={{ gap: "1cqw" }}>
              weak {fighter.weakness ? <><TypeDot type={fighter.weakness} size="3.8cqw" /> ×1.3</> : "none"}
            </span>
            <span className="flex items-center justify-center" style={{ gap: "1cqw" }}>
              resists {fighter.resistance ? <TypeDot type={fighter.resistance} size="3.8cqw" /> : "none"}
            </span>
            <span className="text-right tabular-nums">health {fighter.health.toFixed(1)}</span>
          </div>

          <p className="line-clamp-2 text-[#1b1d21]/65" style={{ fontSize: "2.7cqw", lineHeight: 1.3, padding: "0 3.4cqw", minHeight: "7cqw" }}>
            {fighter.description ?? "No description."}
          </p>

          <div className="flex items-center justify-between text-[#1b1d21]/55" style={{ fontSize: "2.5cqw", padding: "0.8cqw 3.4cqw 1.6cqw" }}>
            <span className="min-w-0 truncate">{owner}/{title}</span>
            <span className="flex shrink-0 items-center font-semibold" style={{ gap: "0.6cqw" }}>
              {fighter.wildcard && "wildcard · "}
              {fighter.perk && "class perk · "}
              {fighter.shiny && <><Star style={{ width: "2.8cqw", height: "2.8cqw" }} fill="#d99a0b" stroke="#d99a0b" aria-hidden /> shiny ·</>} stard
            </span>
          </div>
        </div>
        {fighter.shiny && <div className="card-foil pointer-events-none absolute inset-0" aria-hidden />}
      </div>
    </div>
  );
}

/** The back of a card, for the pile a team's cards are dealt from. */
export function CardBack({ className = "" }: { className?: string }) {
  return (
    <div className={`@container ${className}`} aria-hidden>
      <div className="flex aspect-[5/7] items-center justify-center bg-[#14181d]" style={{ borderRadius: "5cqw", border: "3.2cqw solid #232a32", boxShadow: "0 1.5cqw 5cqw rgba(0,0,0,0.5)" }}>
        <Star style={{ width: "34%", height: "34%" }} fill="#f5c84b" stroke="#f5c84b" />
      </div>
    </div>
  );
}
