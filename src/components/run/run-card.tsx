import { BrickWall, Coins, Crosshair, Gauge, Heart, Shield, Star, Sword, Swords, Zap, type LucideIcon } from "lucide-react";
import { CommitGrid, TYPE, useCreature } from "@/components/battle/repo-card";
import { isLight, languageColor } from "@/lib/card-colors";
import { abilityById } from "../../../server/run/abilities";
import { RARITY_NAMES, setName } from "../../../server/run/names";
import { priceOf, type RunFighter } from "../../../server/run/rules";
import { roleOf, type Role } from "../../../server/run/stats";
import { setsOf, teamSets, TIERS } from "../../../server/run/sets";
import type { Card } from "../../../server/run/types";

// A card as a run plays it: its role, its four numbers, its ability, its
// sets and its price. The old face (battle/repo-card.tsx) lists moves, which a run
// has none of. Sized in container units like the old face.

/** The chip on a card's art: its role by name, with the icon the help uses. */
const ROLES: Record<Role, { label: string; Icon: LucideIcon }> = {
  tank: { label: "Tank", Icon: BrickWall },
  bruiser: { label: "Bruiser", Icon: Swords },
  assassin: { label: "Assassin", Icon: Sword },
  ranged: { label: "Ranged", Icon: Crosshair },
};

const NUMBERS = [
  { key: "hp", label: "HP", Icon: Heart },
  { key: "attack", label: "Attack", Icon: Zap },
  { key: "guard", label: "Guard", Icon: Shield },
  { key: "speed", label: "Speed", Icon: Gauge },
] as const;

/** How many of a set's cards are on `team` once `card` is with them, and the bonus that gives. */
function setsWith(card: Card, team: Card[]) {
  const together = team.some((other) => other.fullName === card.fullName) ? team : [...team, card];
  const sets = teamSets({ units: together.map((other) => ({ card: other, col: 0, row: 0 })) });
  return setsOf(card).flatMap((set) => sets.filter((entry) => entry.set === set));
}

/**
 * `team` is the side the card plays for, so a set counts the cards it would share
 * with: a shop card counts as if bought.
 */
export function RunCard({ fighter, team }: { fighter: RunFighter; team: RunFighter[] }) {
  const { card } = fighter;
  const creature = useCreature(fighter);
  const type = TYPE[fighter.type];
  const language = languageColor(fighter.color);
  const ink = isLight(language) ? "#14171a" : "#ffffff";
  const [owner, name] = fighter.fullName.split("/");
  const title = name ?? fighter.fullName;
  const nameSize = Math.max(3.4, Math.min(7.2, 46 / (title.length * 0.66)));
  const ability = abilityById(card.ability);
  const role = ROLES[roleOf(card)];
  const sets = setsWith(card, team.map((member) => member.card));

  return (
    <div className="@container select-none" data-testid="run-card">
      <div
        className="relative aspect-[5/7] overflow-hidden text-[#1b1d21]"
        style={{
          background: card.shiny ? `linear-gradient(135deg, #f5c84b, ${type.color} 30%, ${type.color} 70%, #f5c84b)` : type.color,
          borderRadius: "5cqw",
          padding: "3.2cqw",
          boxShadow: "0 1.5cqw 5cqw rgba(0,0,0,0.5), inset 0 0 0 0.4cqw rgba(255,255,255,0.25)",
        }}
      >
        <div className="flex h-full flex-col overflow-hidden bg-[#f5f1e8]" style={{ borderRadius: "2.6cqw" }}>
          <div className="flex items-center" style={{ gap: "1.6cqw", padding: "2.2cqw 3cqw 0" }}>
            <span className="shrink-0 rounded-full bg-[#1b1d21] font-semibold text-[#f5f1e8]" style={{ fontSize: "3cqw", padding: "0.5cqw 1.8cqw" }}>{RARITY_NAMES[card.rarity]}</span>
            <h3 className="min-w-0 flex-1 truncate font-display font-bold tracking-tight" style={{ fontSize: `${nameSize}cqw`, lineHeight: 1.15 }}>{title}</h3>
            <span className="flex shrink-0 items-center rounded-full bg-[#1b1d21] font-display font-bold tabular-nums text-[#ffd84d]" style={{ fontSize: "5cqw", gap: "0.8cqw", padding: "0.4cqw 2cqw" }} aria-label={`${priceOf(card.rarity)} gold`}>
              <Coins style={{ width: "4.2cqw", height: "4.2cqw" }} aria-hidden />
              {priceOf(card.rarity)}
            </span>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: language, margin: "1.6cqw 3cqw 0", borderRadius: "1.6cqw", border: "0.9cqw solid #cfc6ae" }}>
            <CommitGrid seed={fighter.fullName} ink={ink} />
            {creature && <img src={creature} alt="" className="absolute inset-0 h-full w-full object-contain" style={{ filter: "drop-shadow(0 1.5cqw 2cqw rgba(0,0,0,0.35))" }} draggable={false} />}
            <span className="absolute flex items-center bg-[#1b1d21] font-semibold text-[#f5f1e8]" style={{ left: "2cqw", bottom: "2cqw", gap: "1cqw", fontSize: "3.2cqw", padding: "0.6cqw 2cqw", borderRadius: "1cqw" }}>
              <role.Icon style={{ width: "3.6cqw", height: "3.6cqw" }} aria-hidden />
              {role.label}
            </span>
          </div>

          <div className="grid grid-cols-4" style={{ margin: "1.6cqw 3cqw 0", gap: "1.2cqw" }}>
            {NUMBERS.map(({ key, label, Icon }) => (
              <div key={key} className="flex flex-col items-center rounded-[1.4cqw]" style={{ background: `${type.color}26`, padding: "0.8cqw 0" }}>
                <span className="flex items-center font-semibold uppercase text-[#1b1d21]/70" style={{ fontSize: "2.4cqw", gap: "0.6cqw", letterSpacing: "0.06em" }}>
                  <Icon style={{ width: "2.8cqw", height: "2.8cqw" }} aria-hidden />
                  {label}
                </span>
                <span className="font-display font-bold tabular-nums" style={{ fontSize: "6cqw", lineHeight: 1.1 }}>{card[key]}</span>
              </div>
            ))}
          </div>

          <div style={{ margin: "1.6cqw 3cqw 0", padding: "1.2cqw 2cqw", borderRadius: "1.4cqw", background: "#1b1d210f" }}>
            <p className="font-display font-bold" style={{ fontSize: "4cqw", lineHeight: 1.2 }}>{ability?.name ?? "No ability"}</p>
            <p className="text-[#1b1d21]/75" style={{ fontSize: "3.1cqw", lineHeight: 1.3 }}>{ability?.text ?? ""}</p>
          </div>

          <ul className="flex flex-col" style={{ margin: "1.2cqw 3cqw 0", gap: "0.8cqw" }}>
            {sets.map(({ set, members, bonus, tier, next }) => (
              <li key={set} className={`line-clamp-2 ${tier ? "" : "text-[#1b1d21]/55"}`} style={{ fontSize: "3cqw", lineHeight: 1.25 }} title={bonus.tiers.map((each) => `${each.at} cards: ${each.text}`).join(" ")}>
                <span className="font-semibold">{setName(set)}: {bonus.does} <span className="tabular-nums">{members.length}/{next?.at ?? TIERS[TIERS.length - 1]}</span></span>{" "}
                {tier ? tier.text : `At ${next?.at ?? TIERS[0]}: ${(next ?? bonus.tiers[0]).text}`}
              </li>
            ))}
          </ul>

          <div className="mt-auto flex items-center justify-between text-[#1b1d21]/55" style={{ fontSize: "2.5cqw", padding: "0.8cqw 3.4cqw 1.6cqw" }}>
            <span className="min-w-0 truncate">{owner}/{title}</span>
            <span className="flex shrink-0 items-center font-semibold" style={{ gap: "0.6cqw" }}>
              {fighter.home && "home · "}
              {fighter.popular && "popular on GitHub · "}
              {card.shiny && <><Star style={{ width: "2.8cqw", height: "2.8cqw" }} fill="#d99a0b" stroke="#d99a0b" aria-hidden /> shiny ·</>} stard
            </span>
          </div>
        </div>
        {card.shiny && <div className="card-foil pointer-events-none absolute inset-0" aria-hidden />}
      </div>
    </div>
  );
}
