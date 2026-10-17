import { APP_MODE } from "./mode";

// GitHub can't set a star's date, so a repo starred again (by hand or by a
// restore) moves to the top as if starred today. Said before every unstar.
const RESTAR_DATE_NOTE = APP_MODE === "local"
  ? "Backups can star it again, but GitHub will date it today."
  : "Starring it again later gives it today's date on GitHub.";

export function confirmUnstar(question: string): boolean {
  return window.confirm(`${question} ${RESTAR_DATE_NOTE}`);
}
