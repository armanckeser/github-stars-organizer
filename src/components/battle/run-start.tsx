import { Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validLogin } from "@/lib/published-list";

/** Whose stars "Try with a sample account" plays: the maintainer's, public and always there. */
const SAMPLE_LOGIN = "armanckeser";

type Props = {
  login: string;
  onLogin: (login: string) => void;
  onStart: (login: string) => void;
  loading: boolean;
  error: string;
  /** The run starting by itself from `/run?me=`: no form, only what is being read. */
  starting: string | null;
  intro: string;
  className: string;
};

// The Play screen's start panel. A link with ?me= starts the run with no typing;
// otherwise one tap plays a sample account's stars.
export function RunStart({ login, onLogin, onStart, loading, error, starting, intro, className }: Props) {
  if (starting && !error) {
    return (
      <div className={`${className} space-y-2 text-center`} role="status">
        <p className="font-display text-2xl font-bold tracking-tight">Play</p>
        <p className="text-sm text-white/70">Reading @{starting}'s stars...</p>
      </div>
    );
  }
  return (
    <form onSubmit={(event) => { event.preventDefault(); onStart(login.trim()); }} className={`${className} space-y-3`}>
      <h1 className="font-display text-2xl font-bold tracking-tight">Play</h1>
      <p className="text-sm text-white/70">{intro}</p>
      <div className="flex flex-wrap gap-2">
        <Input value={login} onChange={(e) => onLogin(e.target.value.replace(/^@/, ""))} placeholder="Your GitHub username" aria-label="Your GitHub username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 basis-32" />
        <Button type="button" variant="outline" disabled={loading} onClick={() => { onLogin(SAMPLE_LOGIN); onStart(SAMPLE_LOGIN); }}><Sparkles /> Try with a sample account</Button>
      </div>
      <Button type="submit" className="w-full" disabled={!validLogin(login) || loading}><Play /> {loading ? "Reading the stars..." : "Start a run"}</Button>
      {error && <p className="text-sm text-[#ff8f93]" role="alert">{error}</p>}
    </form>
  );
}
