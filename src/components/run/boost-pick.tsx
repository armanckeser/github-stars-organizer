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

/** The enamel: blue guards, green heals, red hits, gold for luck, cyan for speed, violet for what it does to the other side. */
function enamelOf(boost: Boost): string {
  const effect = boost.effects[0];
  if (effect.aim === "foe" && (effect.kind === "condition" || effect.kind === "stat")) return "#7c4dff";
  if (effect.kind === "shield") return "#1f6feb";
  if (effect.kind === "heal") return "#238636";
  if (effect.kind === "damage") return "#cf222e";
  if (effect.kind === "stat" && (effect.stat === "critical" || effect.stat === "luck")) return "#b8860b";
  if (effect.kind === "stat" && effect.stat === "speed") return "#0e8a9a";
  if (effect.kind === "stat" && effect.stat === "guard") return "#1f6feb";
  return "#bc4c00";
}

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BoostPick({ offer, round, onPick }: { offer: string[]; round: number; onPick: (id: string) => void }) {
  const [peek, setPeek] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const boosts = offer.flatMap((id) => boostById(id) ?? []);

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
        <p id="boost-pick-title" className="font-display text-3xl font-[800] tracking-tight [font-stretch:112%] sm:text-4xl">Pick a boost</p>
        <p className="mt-1 text-sm text-white/65">After round {round}. It lasts the run.</p>
      </div>
      <div className="boost-row">
        {boosts.map((boost, index) => (
          <Medal key={boost.id} boost={boost} index={index} state={picked === null ? "open" : picked === boost.id ? "chosen" : "passed"} onPick={() => pick(boost.id)} />
        ))}
      </div>
      <button type="button" className="boost-peek" onClick={() => setPeek(true)} disabled={picked !== null}>
        <Eye className="size-4" /> See the board
      </button>
    </div>
  );
}

function Medal({ boost, index, state, onPick }: { boost: Boost; index: number; state: "open" | "chosen" | "passed"; onPick: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const Icon = ICONS[boost.id] ?? Sparkles;
    const svg = renderToStaticMarkup(<Icon color="#ffffff" strokeWidth={2.4} size={256} />);
    medallion(boost.id, svg, enamelOf(boost))
      .then((drawn) => live && setImage(drawn))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [boost]);
  return (
    <button type="button" className="boost-medal group" data-state={state} style={{ "--order": index } as React.CSSProperties} onClick={onPick} disabled={state !== "open"}>
      <span className="boost-coin" style={{ "--enamel": enamelOf(boost) } as React.CSSProperties}>
        {image ? <img src={image} alt="" draggable={false} /> : <span className="boost-coin-blank" />}
      </span>
      <span className="mt-2 block font-display text-lg font-[800] leading-tight tracking-tight [font-stretch:110%]">{boost.name}</span>
      <span className="mt-1 block text-[13px] leading-snug text-white/75">{boost.text}</span>
    </button>
  );
}
