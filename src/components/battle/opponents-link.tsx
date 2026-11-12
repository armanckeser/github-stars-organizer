import { REPO_URL } from "@/lib/published-list";

// The start panel's line on who a run is played against, and how an account asks to be left out.
export function OpponentsLink() {
  return (
    <p className="text-xs text-white/60">
      <a href={`${REPO_URL}/blob/main/OPPONENTS.md`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">Who you play against</a>
    </p>
  );
}
