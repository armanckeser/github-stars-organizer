import { Crosshair, Sword } from "lucide-react";
import { repoName } from "@/components/battle/arena";
import { TYPE, useCreature } from "@/components/battle/repo-card";
import { rangeOf, type RunFighter } from "@/lib/run";

function Tile({ fighter }: { fighter: RunFighter }) {
  const art = useCreature(fighter);
  const type = TYPE[fighter.type];
  const reach = rangeOf(fighter) > 1;
  return (
    <li className="relative flex aspect-[5/6] w-[calc(20%-0.3rem)] flex-col overflow-hidden rounded-md border-2" style={{ borderColor: type.color, background: `linear-gradient(180deg, ${type.color}55, #0c1014 70%)` }} title={fighter.fullName}>
      <span className="relative min-h-0 flex-1">
        {art ? <img src={art} alt="" className="absolute inset-0 size-full object-contain" draggable={false} /> : art === false && fighter.avatarUrl ? <img src={fighter.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" /> : null}
        <span className="absolute left-1 top-1 rounded-full bg-black/70 p-1" title={reach ? "Hits from behind" : "Fights up close"}>{reach ? <Crosshair className="size-3" /> : <Sword className="size-3" />}</span>
      </span>
      <span className="block truncate bg-black/55 px-1.5 py-1 font-display text-[11px] font-bold leading-tight tracking-tight sm:text-xs">{repoName(fighter)}</span>
    </li>
  );
}

/** A team's cards in a row, front row first, each with its creature. */
export function TeamTiles({ units }: { units: { fighter: RunFighter; col: number; row: number }[] }) {
  const ordered = [...units].sort((a, b) => a.row - b.row || a.col - b.col);
  return (
    <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Team">
      {ordered.map((unit) => <Tile key={unit.fighter.fullName} fighter={unit.fighter} />)}
    </ul>
  );
}
