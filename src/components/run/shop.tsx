import { useEffect, useState } from "react";
import { repoName } from "@/components/battle/arena";
import { setName } from "../../../server/run/names";
import { costOf, type RunFighter } from "../../../server/run/rules";
import { teamSets } from "../../../server/run/sets";
import { tierColor } from "../../../server/run/tiers";
import type { Card } from "../../../server/run/types";
import { SetGlyph } from "./set-glyph";

// The shop's five cards, in TFT's anatomy (docs/GAME-UI.md §4): the creature on a lit
// board tile fills the card; its sets are stacked bottom-left over a dark fade; a name
// strip tinted by the tier holds the name and the cost. The tier, which is the cost,
// colours only the border, the strip's tint and nothing else.

/** How many of a card's sets its face in the shop shows, as TFT shows two traits on its short cards. */
const CARD_SETS = 2;

/** The card's sets, and for each the count of the player's cards that would share it once this one is bought, when that advances it. */
function reach(card: Card, held: Card[]) {
  const owned = held.some((other) => other.fullName === card.fullName);
  const sets = teamSets({ units: (owned ? held : [...held, card]).map((other) => ({ card: other, col: 0, row: 0 })) });
  // A language that is also a topic (Lean and lean) is one set; the card shows two, its face shows all.
  return [...new Set(card.sets)].slice(0, CARD_SETS).map((set) => {
    const count = sets.find((entry) => entry.set === set)?.members.length ?? 1;
    return { set, advances: !owned && count > 1 ? count : null };
  });
}

/** The creature on its board tile, drawn in a WebGL context of its own, then kept as an image. */
function useShopArt(fighter: RunFighter): string | null | false {
  const [art, setArt] = useState<{ of: RunFighter; image: string | false } | null>(null);
  useEffect(() => {
    let live = true;
    import("@/components/battle/three/portrait")
      .then(({ shopArt }) => live && setArt({ of: fighter, image: shopArt(fighter) }))
      .catch(() => live && setArt({ of: fighter, image: false }));
    return () => {
      live = false;
    };
  }, [fighter]);
  return art?.of === fighter ? art.image : null;
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
    <div data-testid="shop" className="grid flex-1 grid-cols-5 gap-1 sm:gap-1.5">
      {shop.map((fighter, slot) =>
        fighter ? (
          <ShopCard key={fighter.fullName} fighter={fighter} held={held.map((card) => card.card)} affordable={gold >= costOf(fighter) && !draftsFull} onOpen={() => onOpen(slot)} />
        ) : (
          <div key={slot} className="shop-empty" />
        ),
      )}
    </div>
  );
}

function ShopCard({ fighter, held, affordable, onOpen }: { fighter: RunFighter; held: Card[]; affordable: boolean; onOpen: () => void }) {
  const art = useShopArt(fighter);
  const cost = costOf(fighter);
  const language = fighter.language?.toLowerCase() ?? null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Look at ${fighter.fullName}, ${cost} gold`}
      data-affordable={affordable ? "" : undefined}
      className="shop-card battle-deal group"
      style={{ "--tier": tierColor(cost) } as React.CSSProperties}
    >
      <span className="shop-art">
        {art ? <img src={art} alt="" draggable={false} /> : null}
        <span className="shop-sets">
          {reach(fighter.card, held).map(({ set, advances }, index) => (
            <span key={`${index}-${set}`} className="shop-set">
              <SetGlyph set={set} language={language} />
              <span className="shop-set-name">{setName(set)}</span>
              {advances !== null && <span className="shop-reach">{advances}</span>}
            </span>
          ))}
        </span>
      </span>
      <span className="shop-strip">
        <span className="min-w-0 truncate">{repoName(fighter)}</span>
        <span className="shop-cost"><span className="shop-coin" />{cost}</span>
      </span>
    </button>
  );
}
