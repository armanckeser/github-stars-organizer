import { useCreature } from "@/components/battle/repo-card";
import { repoName } from "@/components/battle/arena";
import { languageColor } from "@/lib/card-colors";
import { setName } from "../../../server/run/names";
import { costOf, type RunFighter } from "../../../server/run/rules";
import { teamSets } from "../../../server/run/sets";
import type { Card } from "../../../server/run/types";

// The shop: five cards lit like cards in a hand. Cost is the frame's metal, as in TFT:
// grey, green, blue, purple, gold for 1 to 5 gold. A card's sets are written over its
// art; a set the card would advance on the player's team shows the count it reaches.

/** The frame's metal for each cost: the light edge, the dark edge, and the glow behind the art. */
const METAL: Record<number, [string, string, string]> = {
  1: ["#c9d1d9", "#4b545e", "#8b949e"],
  2: ["#7ee2a0", "#1b6b3a", "#35c450"],
  3: ["#8cc8ff", "#1d4f8f", "#3ea6ff"],
  4: ["#d9b3ff", "#5b2e91", "#a47cff"],
  5: ["#ffe7a1", "#9a6a12", "#ffc93d"],
};

/** Each of the card's sets, and how many of the player's cards would share it once this one is bought. */
function reach(card: Card, held: Card[]) {
  const together = held.some((other) => other.fullName === card.fullName) ? held : [...held, card];
  const sets = teamSets({ units: together.map((other) => ({ card: other, col: 0, row: 0 })) });
  return card.sets.map((set) => {
    const found = sets.find((entry) => entry.set === set);
    return { set, count: found?.members.length ?? 1, live: Boolean(found?.tier) };
  });
}

type Props = {
  shop: (RunFighter | null)[];
  /** Every card the player holds, board and Drafts. */
  held: RunFighter[];
  gold: number;
  draftsFull: boolean;
  onOpen: (slot: number) => void;
};

export function Shop({ shop, held, gold, draftsFull, onOpen }: Props) {
  return (
    <div data-testid="shop" className="grid flex-1 grid-cols-5 gap-1.5 sm:gap-2.5">
      {shop.map((fighter, slot) =>
        fighter ? (
          <ShopCard key={fighter.fullName} fighter={fighter} held={held.map((card) => card.card)} affordable={gold >= costOf(fighter) && !draftsFull} onOpen={() => onOpen(slot)} />
        ) : (
          <div key={slot} className="shop-empty aspect-[4/5] rounded-[10px] sm:aspect-[1/1]" />
        ),
      )}
    </div>
  );
}

function ShopCard({ fighter, held, affordable, onOpen }: { fighter: RunFighter; held: Card[]; affordable: boolean; onOpen: () => void }) {
  const art = useCreature(fighter);
  const cost = costOf(fighter);
  const [light, dark, glow] = METAL[cost] ?? METAL[1];
  const language = fighter.language?.toLowerCase();
  const sets = reach(fighter.card, held);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Look at ${fighter.fullName}, ${cost} gold`}
      data-affordable={affordable ? "" : undefined}
      className="shop-card battle-deal group relative aspect-[4/5] w-full rounded-[10px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:aspect-[1/1]"
      style={{ "--metal-light": light, "--metal-dark": dark, "--metal-glow": glow } as React.CSSProperties}
    >
      <span className="shop-card-art absolute inset-[3px] overflow-hidden rounded-[7px]">
        {art ? <img src={art} alt="" draggable={false} className="absolute inset-x-0 -bottom-[6%] mx-auto h-[118%] w-auto max-w-none object-contain transition-transform duration-200 ease-out group-hover:scale-[1.04] sm:left-auto sm:right-[-10%] sm:h-[112%]" /> : null}
        <span className="absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-[#06080b] via-[#06080bcc] to-transparent" />
        <span className="shop-sets-named absolute left-1.5 top-1.5 hidden flex-col gap-0.5 sm:flex">
          {sets.map(({ set, count, live }) => (
            <span key={set} className="flex items-center gap-1 text-[12px] font-semibold leading-tight text-white [text-shadow:0_1px_2px_#000,0_0_8px_#000]">
              {count > 1 ? <span className={`shop-count ${live ? "shop-count-live" : ""}`}>{count}</span> : <span className="shop-dot" style={set === language ? { background: languageColor(fighter.color) } : undefined} data-topic={set === language ? undefined : ""} />}
              {setName(set)}
            </span>
          ))}
        </span>
        {/* On a phone the sets are dots only, and a count where the card advances one. */}
        <span className="shop-sets-dots absolute left-1 top-1 flex gap-0.5 sm:hidden">
          {sets.map(({ set, count, live }) => (count > 1 ? <span key={set} className={`shop-count ${live ? "shop-count-live" : ""}`}>{count}</span> : <span key={set} className="shop-dot" style={set === language ? { background: languageColor(fighter.color) } : undefined} data-topic={set === language ? undefined : ""} />))}
        </span>
        <span className="absolute inset-x-1.5 bottom-1 flex items-end justify-end gap-1 sm:justify-between">
          <span className="hidden min-w-0 truncate font-display text-[13px] font-[750] leading-tight tracking-tight [font-stretch:108%] sm:block">{repoName(fighter)}</span>
          <span className="flex shrink-0 items-center gap-0.5 font-display text-[12px] font-[800] tabular-nums text-[#ffe08a] sm:text-sm"><span className="shop-coin" />{cost}</span>
        </span>
      </span>
    </button>
  );
}
