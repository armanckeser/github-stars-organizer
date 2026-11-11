import { useState } from "react";
import { ArrowLeftRight, Shield, Sparkles, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { repoName } from "@/components/battle/arena";
import { RepoCard } from "@/components/battle/repo-card";
import { RARITY } from "@/components/battle/rarity";
import type { Fighter, Side } from "../../../server/battle";
import { CLASSES } from "../../../server/character";
import { ENERGY_FOR_SPECIAL, applyAction, legalActions, type Action, type GameEvent, type GameState } from "../../../server/game";

// The parts of a turn-based match both screens show: a match over a GitHub thread
// (routes/game.tsx) and a game against the computer (routes/battle.tsx).

// What an action would do, worked out with the same rules the referee uses.
function preview(state: GameState, seed: string, side: Side, action: Action): GameEvent {
  return applyAction(state, seed, side, action, "preview", "").events.at(-1)!;
}

function ActionButton({ icon, title, detail, disabled, onClick }: { icon: React.ReactNode; title: string; detail: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-16 min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
    >
      <span className="shrink-0 text-muted-foreground [&_svg]:size-5">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

/** The four choices for the side to move, each with exactly what it would do. */
export function ActionPanel({ state, seed, side, busy = false, onPlay }: { state: GameState; seed: string; side: Side; busy?: boolean; onPlay: (action: Action) => void }) {
  const [switching, setSwitching] = useState(false);
  const legal = legalActions(state, side);
  if (legal.length === 0) return null;
  const mine = state.sides[side];
  const active = state.teams[side][mine.active];
  const can = (kind: Action["kind"]) => legal.some((action) => action.kind === kind);
  const attack = preview(state, seed, side, { kind: "attack" });
  const special = can("special") ? preview(state, seed, side, { kind: "special" }) : null;
  const hitDetail = (event: GameEvent) => `${event.damage} damage${event.critical ? " · critical" : ""}${event.knockedOut ? " · knocks out" : ""}`;
  const charge = mine.energy[mine.active];
  const switches = legal.filter((action): action is { kind: "switch"; to: number } => action.kind === "switch");
  const play = (action: Action) => {
    setSwitching(false);
    onPlay(action);
  };

  if (switching) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Switch to which card? The switch uses your turn.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {switches.map((action) => {
            const fighter = state.teams[side][action.to];
            const grade = fighter.rarity ? RARITY[fighter.rarity] : `Lv ${fighter.level}`;
            return <ActionButton key={action.to} icon={<ArrowLeftRight />} title={repoName(fighter)} detail={`${mine.hp[action.to]}/${fighter.hp} HP · ${grade} · ${fighter.type}`} disabled={busy} onClick={() => play(action)} />;
          })}
        </div>
        <Button variant="ghost" className="min-h-11" onClick={() => setSwitching(false)}>Back</Button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <ActionButton icon={<Swords />} title={active.moves[0].name} detail={hitDetail(attack)} disabled={busy} onClick={() => play({ kind: "attack" })} />
      <ActionButton
        icon={<Sparkles />}
        title={active.moves[1].name}
        detail={special ? hitDetail(special) : `Charge ${charge} of ${ENERGY_FOR_SPECIAL}. Attacking charges the special.`}
        disabled={busy || !special}
        onClick={() => play({ kind: "special" })}
      />
      <ActionButton icon={<Shield />} title="Guard" detail={can("guard") ? "Halve the next hit you take." : "Not twice in a row."} disabled={busy || !can("guard")} onClick={() => play({ kind: "guard" })} />
      <ActionButton icon={<ArrowLeftRight />} title="Switch" detail={switches.length ? "Bring in another card." : "No other card is standing."} disabled={busy || switches.length === 0} onClick={() => setSwitching(true)} />
    </div>
  );
}

/** The public dice for the next turns. */
export function DiceAhead({ state, note }: { state: GameState; note?: string }) {
  if (state.status !== "active" || state.forecast.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="font-medium uppercase tracking-wider">The dice ahead</span>
      {state.forecast.map((roll) => (
        <span key={roll.turn} className="tabular-nums">
          Turn {roll.turn}: {Math.round(roll.variance * 100)}%{roll.critical && <span className="font-semibold text-[#ffd23f]"> critical</span>}
        </span>
      ))}
      {note && <span>{note}</span>}
    </div>
  );
}

/** A side's cards in a row, the active one ringed, each with its HP. */
export function Bench({ state, side, onInspect }: { state: GameState; side: Side; onInspect: (fighter: Fighter) => void }) {
  const mine = state.sides[side];
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="truncate text-xs text-muted-foreground">
        {state.players[side].name}{state.players[side].klass === "rookie" ? "" : ` · ${CLASSES[state.players[side].klass].label}`}
      </p>
      <ul className="flex gap-1.5">
        {state.teams[side].map((fighter, i) => (
          <li key={fighter.fullName} className={`w-14 shrink-0 sm:w-16 ${mine.hp[i] === 0 ? "opacity-30 grayscale" : i === mine.active ? "" : "opacity-75"}`}>
            <button type="button" onClick={() => onInspect(fighter)} className={`block w-full cursor-zoom-in rounded-[5%] outline-none focus-visible:ring-2 focus-visible:ring-ring ${i === mine.active ? "ring-2 ring-foreground" : ""}`} aria-label={`Look at ${fighter.fullName}`}>
              <RepoCard fighter={fighter} />
            </button>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-label={`${repoName(fighter)}: ${mine.hp[i]} of ${fighter.hp} HP`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${(mine.hp[i] / fighter.hp) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
