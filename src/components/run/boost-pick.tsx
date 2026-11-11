import { Sparkles } from "lucide-react";
import { boostById } from "../../../server/run/boosts";

/** One of three boosts, offered after rounds 2 and 4 (BOOST_ROUNDS). The pick lasts the rest of the run. */
export function BoostPick({ offer, round, onPick }: { offer: string[]; round: number; onPick: (id: string) => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="boost-pick-title">
      <div className="battle-deal w-full max-w-md space-y-3 rounded-lg border border-white/15 bg-[#0c1014]/95 p-4 shadow-lg backdrop-blur-sm">
        <div>
          <p id="boost-pick-title" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight"><Sparkles className="size-5 text-[#ffd84d]" /> Pick a boost</p>
          <p className="text-sm text-white/70">After round {round}. The boost stays for the rest of the run.</p>
        </div>
        <div className="grid gap-2">
          {offer.map((id) => {
            const boost = boostById(id);
            if (!boost) return null;
            return (
              <button key={id} type="button" onClick={() => onPick(id)} className="rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-left outline-none transition-colors hover:border-[#ffd84d]/70 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring">
                <span className="block font-display font-bold">{boost.name}</span>
                <span className="block text-sm text-white/75">{boost.text}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
