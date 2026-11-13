import { useCallback, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { abilityById } from "../../../server/run/abilities";
import { conditionLine, setName } from "../../../server/run/names";
import type { RunFighter } from "../../../server/run/rules";
import { teamSets } from "../../../server/run/sets";
import type { Side } from "../../../server/run/types";
import { useFightTick, type FightClock } from "./fight-clock";
import { momentAt, type CreatureMoment } from "./fight-moment";
import type { BoardFight } from "./three/board";
import { CONDITION_COLOR } from "./three/effects/stage";

// A creature looked at while the fight plays on, as TFT's unit panel: docked at the
// side (the bottom on a phone), never over the board's middle, and never a modal.

/** How long a fainted creature's panel stays to say so, in milliseconds. */
const FAINTED_LINGER = 1600;
/** The board's HP bar colours (three/board.ts): your side green, theirs red (docs/GAME-UI.md §3). */
const SIDE_HP = ["#35c450", "#e5484d"] as const;
/** The shield's pale blue-white, as on the board (effects/stage.ts EFFECT_COLOR.shield). */
const SHIELD = "#dff3ff";
/** Where the panel is a sheet along the bottom, not docked at the side: `.fight-inspect` in index.css. */
const SHEET = "(max-width: 639px)";

type Creature = { id: string; side: Side; fighter: RunFighter; moment: CreatureMoment };

export type FightInspectProps = {
  fight: BoardFight;
  /** Each side's cards, in the order of `fight.ids`. */
  teams: [RunFighter[], RunFighter[]];
  /** The other team's GitHub login. */
  opponent: string;
  clock: FightClock;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Screen pixels the panel covers along the bottom (0 when it is docked at the side or closed), so the board's camera can lift clear of it. */
  onCover?: (pixels: number) => void;
};

const ownerOf = (side: Side, opponent: string) => (side === 0 ? "Your team" : `@${opponent}`);
const titleOf = (fighter: RunFighter) => fighter.fullName.split("/")[1] ?? fighter.fullName;

/** The creature in one line, for its button and for a screen reader: name, side, HP, shield and condition. */
function spoken(creature: Creature, opponent: string): string {
  const { fighter, moment } = creature;
  const head = `${titleOf(fighter)}, ${ownerOf(creature.side, opponent)}`;
  if (moment.fainted) return `${head}, fainted`;
  const shield = moment.shield > 0 ? `, shield ${moment.shield}` : "";
  const condition = moment.condition ? `, ${conditionLine(moment.condition.name, moment.condition.ticksLeft, fighter.card.hp)}` : "";
  return `${head}, ${moment.hp} of ${fighter.card.hp} HP${shield}${condition}`;
}

function HpBar({ creature }: { creature: Creature }) {
  const { moment, fighter } = creature;
  // As the board's bar: HP from the left, then the shield; a shield past the end shrinks the HP to make room.
  const total = Math.max(fighter.card.hp, moment.hp + moment.shield);
  return (
    <div className="fight-inspect-bar" aria-hidden>
      <span style={{ width: `${(moment.hp / total) * 100}%`, background: SIDE_HP[creature.side] }} />
      <span style={{ width: `${(moment.shield / total) * 100}%`, background: SHIELD }} />
    </div>
  );
}

function Panel({ creature, team, opponent, onClose, onCover }: { creature: Creature; team: RunFighter[]; opponent: string; onClose: () => void; onCover?: (pixels: number) => void }) {
  const sheet = useMediaQuery(SHEET);
  const measure = useCallback(
    (element: HTMLElement | null) => {
      if (!element || !sheet || !onCover) return;
      const observer = new ResizeObserver(() => onCover(window.innerHeight - element.getBoundingClientRect().top));
      observer.observe(element);
      return () => {
        observer.disconnect();
        onCover(0);
      };
    },
    [sheet, onCover],
  );
  const { fighter, moment } = creature;
  const ability = abilityById(fighter.card.ability);
  const live = teamSets({ units: team.map((member) => ({ card: member.card, col: 0, row: 0 })) }).flatMap(({ set, members, bonus, tier }) =>
    bonus && tier && fighter.card.sets.includes(set) ? [{ set, count: Math.min(members.length, 3), name: bonus.name, text: tier.text }] : [],
  );
  return (
    <aside ref={measure} className="fight-inspect" aria-label={`${titleOf(fighter)}, ${ownerOf(creature.side, opponent)}`} data-testid="fight-inspect">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-bold leading-tight tracking-tight">{titleOf(fighter)}</h2>
          <p className="truncate text-xs text-white/60">{ownerOf(creature.side, opponent)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="fight-inspect-close"><X className="size-4" /></button>
      </div>

      {moment.fainted ? (
        <p className="font-display text-base font-semibold text-white/70">Fainted</p>
      ) : (
        <div className="space-y-1.5">
          <p className="flex items-baseline justify-between font-display tabular-nums">
            <span className="text-xs font-semibold text-white/60">HP</span>
            <span className="text-base font-bold" data-testid="fight-inspect-hp">{moment.hp} / {fighter.card.hp}</span>
          </p>
          <HpBar creature={creature} />
          {moment.shield > 0 && (
            <p className="flex items-baseline justify-between font-display tabular-nums">
              <span className="text-xs font-semibold text-white/60">Shield</span>
              <span className="text-sm font-bold" style={{ color: SHIELD }}>{moment.shield}</span>
            </p>
          )}
          {moment.condition && (
            <p className="flex items-start gap-2 text-sm" data-testid="fight-inspect-condition">
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: CONDITION_COLOR[moment.condition.name] }} aria-hidden />
              <span>{conditionLine(moment.condition.name, moment.condition.ticksLeft, fighter.card.hp)}</span>
            </p>
          )}
        </div>
      )}

      {ability && (
        <section>
          <h3 className="text-xs font-semibold text-white/60">Ability</h3>
          <p className="font-display text-sm font-semibold">{ability.name}</p>
          <p className="text-sm text-white/75">{ability.text}</p>
        </section>
      )}
      <section>
        <h3 className="text-xs font-semibold text-white/60">Set bonuses</h3>
        {live.length === 0 ? (
          <p className="text-sm text-white/60">None live</p>
        ) : (
          <ul className="space-y-0.5">
            {live.map(({ set, count, name, text }) => (
              <li key={set} className="text-sm">
                <span className="font-display font-semibold tabular-nums">{setName(set)} {count}</span>{" "}
                <span className="text-white/75">{name}: {text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

/**
 * The fight's creature panel, and a row of buttons to pick a creature from the
 * keyboard: hidden until one of them has focus, since a pointer picks on the board.
 */
export function FightInspect({ fight, teams, opponent, clock, selected, onSelect, onCover }: FightInspectProps) {
  const tick = useFightTick(clock);
  const fullHp = useMemo(() => teams.map((team) => team.map((fighter) => fighter.card.hp)) as [number[], number[]], [teams]);
  const moment = useMemo(() => momentAt(fight.events, tick, fullHp), [fight.events, tick, fullHp]);
  const creatures: Creature[] = ([0, 1] as const).flatMap((side) => fight.ids[side].flatMap((id, index) => (teams[side][index] ? [{ id, side, fighter: teams[side][index], moment: moment[side][index] }] : [])));
  const chosen = creatures.find((creature) => creature.id === selected);
  const fainted = chosen?.moment.fainted === true;
  const chosenId = chosen?.id;

  useEffect(() => {
    if (!chosenId) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onSelect(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [chosenId, onSelect]);

  useEffect(() => {
    if (!fainted) return;
    const timer = setTimeout(() => onSelect(null), FAINTED_LINGER);
    return () => clearTimeout(timer);
  }, [fainted, onSelect]);

  return (
    <>
      <div role="group" aria-label="Look at a creature" className="fight-pick sr-only focus-within:not-sr-only">
        {creatures.filter((creature) => !creature.moment.fainted).map((creature) => (
          <button key={creature.id} type="button" aria-pressed={creature.id === selected} aria-label={spoken(creature, opponent)} onClick={() => onSelect(creature.id === selected ? null : creature.id)}>
            {titleOf(creature.fighter)}
          </button>
        ))}
      </div>
      {chosen && <Panel creature={chosen} team={teams[chosen.side]} opponent={opponent} onClose={() => onSelect(null)} onCover={onCover} />}
    </>
  );
}
