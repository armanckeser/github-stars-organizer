import { Star } from "lucide-react";
import { REPO_URL } from "@/lib/published-list";

/** The one quiet line under a finished battle or run. No popup. */
export function StarStard({ className = "text-muted-foreground hover:text-foreground" }: { className?: string }) {
  return (
    <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline ${className}`}>
      <Star className="size-4" /> Star Stard on GitHub
    </a>
  );
}
