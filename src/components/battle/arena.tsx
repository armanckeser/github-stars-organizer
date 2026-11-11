import { lazy, Suspense, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RepoCard, TYPE, TypeDot } from "@/components/battle/repo-card";
import type { Fighter } from "../../../server/battle";
import type { ArenaView, Where } from "./three/world";

// The arena both kinds of battle are staged in: the instant one (routes/battle.tsx)
// and a match played over a thread (routes/game.tsx). The fight itself is a 3D scene
// (three/world.ts); the nameplates and the text box are drawn over it. Sizes are in
// container units, so the overlay scales with the scene.

export type { SideView, Stance } from "./three/world";

export const repoName = (fighter: Fighter) => fighter.fullName.split("/")[1] ?? fighter.fullName;

const Arena3D = lazy(() => import("./arena3d"));

export function ArenaScene({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl border bg-[#080b0f] sm:aspect-[16/10]">{children}</div>
    </div>
  );
}

/** Both creatures, both characters and the fight between them. */
export function ArenaStage(props: ArenaView & { onInspect: (where: Where) => void }) {
  return (
    <Suspense fallback={null}>
      <Arena3D {...props} />
    </Suspense>
  );
}

export function Nameplate({
  near,
  owner,
  avatarUrl,
  fighter,
  hp,
  left,
  total,
  energy,
  onInspect,
}: {
  near: boolean;
  /** The line over the card's name: who is playing it. */
  owner: string;
  avatarUrl: string | null;
  fighter: Fighter;
  hp: number;
  /** Cards still standing, of `total`. */
  left: number;
  total: number;
  /** Charge toward the special, of two. Left out where specials aren't chosen. */
  energy?: number;
  /** Opens the card. */
  onInspect: () => void;
}) {
  const share = hp / fighter.hp;
  const bar = share > 0.5 ? "bg-primary" : share > 0.2 ? "bg-[#e0a312]" : "bg-[#e5484d]";
  const place = near ? "bottom-[19%] right-[3%] w-[47%] sm:bottom-[21%] sm:right-[4%] sm:w-[34%]" : "left-[3%] top-[3%] w-[58%] sm:left-[4%] sm:top-[5%] sm:w-[34%]";
  return (
    <div className={`absolute z-20 rounded-lg border border-white/15 bg-[#0c1014]/90 shadow-lg ${place}`} style={{ padding: "1.4cqw 1.8cqw" }}>
      <div className="flex items-center" style={{ gap: "1.2cqw" }}>
        {avatarUrl && <img src={avatarUrl} alt="" className="shrink-0 rounded-full" style={{ width: "4.6cqw", height: "4.6cqw" }} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-muted-foreground" style={{ fontSize: "max(1.5cqw, 10px)", lineHeight: 1.2 }}>{owner}</p>
          <button type="button" onClick={onInspect} className="block max-w-full cursor-zoom-in truncate rounded-sm text-left font-display font-bold tracking-tight underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" style={{ fontSize: "max(2.3cqw, 13px)", lineHeight: 1.15 }} aria-label={`Look at ${fighter.fullName}`}>{repoName(fighter)}</button>
        </div>
        <span className="shrink-0 font-semibold tabular-nums" style={{ fontSize: "max(1.6cqw, 10px)" }}>Lv {fighter.level}</span>
        <TypeDot type={fighter.type} size="max(3cqw, 16px)" />
      </div>
      <div className="flex items-center" style={{ gap: "1cqw", marginTop: "0.9cqw" }}>
        <span className="font-semibold text-muted-foreground" style={{ fontSize: "max(1.3cqw, 9px)" }}>HP</span>
        <div className="flex-1 overflow-hidden rounded-full bg-white/10" style={{ height: "max(1.1cqw, 6px)" }} role="meter" aria-label={`${repoName(fighter)} HP`} aria-valuemin={0} aria-valuemax={fighter.hp} aria-valuenow={hp}>
          <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${bar}`} style={{ width: `${share * 100}%` }} />
        </div>
        <span className="tabular-nums" style={{ fontSize: "max(1.5cqw, 10px)" }}>{hp}/{fighter.hp}</span>
      </div>
      <div className="flex items-center justify-between" style={{ marginTop: "0.9cqw" }}>
        <div className="flex items-center" style={{ gap: "0.7cqw" }} aria-label={`${left} of ${total} cards left`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`rounded-full ${i >= total - left ? "bg-foreground" : "bg-white/15"}`} style={{ width: "max(1.1cqw, 6px)", height: "max(1.1cqw, 6px)" }} />
          ))}
        </div>
        {energy !== undefined && (
          <div className="flex items-center text-muted-foreground" style={{ gap: "0.6cqw", fontSize: "max(1.3cqw, 9px)" }} aria-label={`Special charge ${energy} of 2`}>
            charge
            {[0, 1].map((i) => (
              <span key={i} className="rounded-sm" style={{ width: "max(1.6cqw, 9px)", height: "max(0.9cqw, 5px)", background: i < energy ? TYPE[fighter.type].color : "rgb(255 255 255 / 0.15)" }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The strip along the bottom of the arena: what just happened on the left, what can be done on the right. */
export function TextBox({ children, actions, strong = false }: { children: React.ReactNode; actions?: React.ReactNode; strong?: boolean }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex h-[16%] items-center gap-3 border-t border-white/15 bg-[#0c1014]/95 px-3 sm:h-[17%] sm:px-5">
      <p className={`min-w-0 flex-1 text-sm sm:text-base ${strong ? "font-display text-base font-bold tracking-tight sm:text-xl" : ""}`} aria-live="polite">{children}</p>
      {actions && <div className="flex shrink-0 flex-wrap justify-end gap-1.5">{actions}</div>}
    </div>
  );
}

/** A card opened large, leaning toward the pointer. Closes on Escape or a press outside. */
export function InspectOverlay({ fighter, onClose }: { fighter: Fighter | null; onClose: () => void }) {
  useEffect(() => {
    if (!fighter) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [fighter, onClose]);
  if (!fighter) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6" role="dialog" aria-modal="true" aria-label={fighter.fullName} onClick={onClose}>
      <div className="battle-deal w-[min(86vw,22rem,56vh)]" onClick={(e) => e.stopPropagation()}>
        <RepoCard fighter={fighter} tilt />
        <div className="mt-3 flex items-center justify-between gap-2 text-sm">
          <a href={`https://github.com/${fighter.fullName}`} target="_blank" rel="noopener noreferrer" className="truncate underline-offset-4 hover:underline">{fighter.fullName}</a>
          <Button variant="outline" size="sm" onClick={onClose}><X /> Close</Button>
        </div>
      </div>
    </div>
  );
}
