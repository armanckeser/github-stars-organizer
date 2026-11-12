import { useEffect, useState, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Clover, Crosshair, Droplets, Eye, Flame, Gauge, HeartHandshake, Repeat, Rocket, RotateCcw, Shield, ShieldHalf, ShieldPlus, Snail, Sparkles, Swords, Target, Timer, TriangleAlert, Wind, type LucideProps } from "lucide-react";
import { medallion } from "@/components/battle/three/medallion";
import { boostById, type Boost } from "../../../server/run/boosts";

// The boost pick, after rounds 2 and 4 (BOOST_ROUNDS): three medallions held over the lit
// board, as TFT lays out its augments. Each is brass with an enamel field whose colour
// says what the boost does, and one icon inlaid. The board stays in view behind them,
// and "See the board" folds them away to look at it before choosing.

const ICONS: Record<string, ComponentType<LucideProps>> = {
  "head-start": Shield,
  "critical-mass": Crosshair,
  "last-stand": Flame,
  "lucky-streak": Clover,
  "front-line": ShieldHalf,
  "back-line": Target,
  "warm-start": Gauge,
  "thick-skin": ShieldPlus,
  avenge: Swords,
  regroup: HeartHandshake,
  lifesteal: Droplets,
  thorns: RotateCcw,
  combo: Repeat,
  "opening-volley": Rocket,
  "second-wind": Wind,
  "tar-pit": Snail,
  throttle: Timer,
  "deprecation-notice": TriangleAlert,
};

/**
 * The twelve enamels (docs/GAME-UI.md §8), each far enough from the others in hue or
 * depth to tell apart under brass. A boost's own is picked by what it does; an offer
 * never shows two medallions in one colour.
 */
const ENAMELS = [
  "#1f6feb", // blue: guards
  "#238636", // green: heals
  "#cf222e", // red: hits
  "#b8860b", // ochre: luck
  "#0e8a9a", // teal: speed
  "#7c4dff", // violet: works on the other side
  "#bc4c00", // orange
  "#bf3989", // magenta
  "#1b3a8a", // navy
  "#7d1433", // wine
  "#5f7a1a", // olive
  "#7a4a2a", // brown
] as const;

/** The enamel a boost asks for, as an index into ENAMELS: blue guards, green heals, red hits, ochre for luck, teal for speed, violet for what it does to the other side. */
function wantOf(boost: Boost): number {
  const effect = boost.effects[0];
  if (effect.aim === "foe" && (effect.kind === "condition" || effect.kind === "stat")) return 5;
  if (effect.kind === "shield") return 0;
  if (effect.kind === "heal") return 1;
  if (effect.kind === "damage") return 2;
  if (effect.kind === "stat" && (effect.stat === "critical" || effect.stat === "luck")) return 3;
  if (effect.kind === "stat" && effect.stat === "speed") return 4;
  if (effect.kind === "stat" && effect.stat === "guard") return 0;
  return 6;
}

/** One enamel per boost on offer: each takes the one it asks for, or the next free one after it. */
function enamelsOf(boosts: Boost[]): Map<string, string> {
  const taken = new Set<number>();
  return new Map(
    boosts.map((boost) => {
      let index = wantOf(boost);
      while (taken.has(index)) index = (index + 1) % ENAMELS.length;
      taken.add(index);
      return [boost.id, ENAMELS[index]];
    }),
  );
}

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Props = { offer: string[]; round: number; onPick: (id: string) => void; /** Told when the player folds the pick away to look at the board, and when they bring it back. */ onPeek: (peeking: boolean) => void };

export function BoostPick({ offer, round, onPick, onPeek }: Props) {
  const [peek, setPeekState] = useState(false);
  const setPeek = (peeking: boolean) => {
    setPeekState(peeking);
    onPeek(peeking);
  };
  const [picked, setPicked] = useState<string | null>(null);
  const boosts = offer.flatMap((id) => boostById(id) ?? []);
  const enamels = enamelsOf(boosts);

  const pick = (id: string) => {
    if (picked) return;
    setPicked(id);
    window.setTimeout(() => onPick(id), reduced() ? 0 : 420);
  };

  if (peek) {
    return (
      <button type="button" className="boost-return" onClick={() => setPeek(false)}>
        <Sparkles className="size-4 text-[#ffd84d]" /> Pick a boost
      </button>
    );
  }
  return (
    <div className="boost-pick" role="dialog" aria-modal="true" aria-labelledby="boost-pick-title" data-picked={picked ? "" : undefined}>
      <div className="text-center">
        <p id="boost-pick-title" className="boost-title">Pick a boost</p>
        <p className="boost-subtitle">After round {round}. It lasts the run.</p>
      </div>
      <div className="boost-row">
        {boosts.map((boost, index) => (
          <Medal key={boost.id} boost={boost} enamel={enamels.get(boost.id) ?? ENAMELS[0]} index={index} state={picked === null ? "open" : picked === boost.id ? "chosen" : "passed"} onPick={() => pick(boost.id)} />
        ))}
      </div>
      <button type="button" className="boost-peek" onClick={() => setPeek(true)} disabled={picked !== null}>
        <Eye className="size-4" /> See the board
      </button>
    </div>
  );
}

function Medal({ boost, enamel, index, state, onPick }: { boost: Boost; enamel: string; index: number; state: "open" | "chosen" | "passed"; onPick: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const Icon = ICONS[boost.id] ?? Sparkles;
    const svg = renderToStaticMarkup(<Icon color="#ffffff" strokeWidth={2.4} size={256} />);
    medallion(`${boost.id}|${enamel}`, svg, enamel)
      .then((drawn) => live && setImage(drawn))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [boost, enamel]);
  return (
    <button type="button" className="boost-medal group" data-state={state} style={{ "--order": index } as React.CSSProperties} onClick={onPick} disabled={state !== "open"}>
      <span className="boost-coin" style={{ "--enamel": enamel } as React.CSSProperties}>
        {image ? <img src={image} alt="" draggable={false} /> : <span className="boost-coin-blank" />}
      </span>
      <span className="boost-name">{boost.name}</span>
      <span className="boost-text">{boost.text}</span>
    </button>
  );
}
