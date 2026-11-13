// The end of a run, as words: who the run beat, and the message Challenge a friend
// copies. A username tells nothing about the person, so no message uses a pronoun.

/** One round of a finished run: who it was against and how it went. */
export type RoundResult = { round: number; opponent: string; outcome: "won" | "lost" | "draw" };

// More names than this make the line wrap on a phone; the rest are counted.
const NAMED = 3;

/** The accounts a run beat, each once, in the order it beat them. */
export const beatenIn = (results: RoundResult[]): string[] => [...new Set(results.filter((result) => result.outcome === "won").map((result) => result.opponent))];

/** "@a", "@a and @b", "@a, @b and @c", "@a, @b, @c and 2 more". */
function named(logins: string[]): string {
  const handles = logins.slice(0, NAMED).map((login) => `@${login}`);
  const more = logins.length - handles.length;
  if (more > 0) return `${handles.join(", ")} and ${more} more`;
  if (handles.length === 1) return handles[0];
  return `${handles.slice(0, -1).join(", ")} and ${handles.at(-1)}`;
}

/** The end screen's lead line; null when the run beat nobody. */
export const beatLine = (beaten: string[]): string | null => (beaten.length === 0 ? null : `You beat ${named(beaten)}`);

/** The team link with the friend it challenges, whom the team page then greets. */
export const challengeLink = (teamLink: string, friend: string): string => (friend ? `${teamLink}&to=${friend}` : teamLink);

/** What Challenge a friend copies: the result, the friend named when there is one, and the link. */
export function challengeMessage(beaten: string[], teamLink: string, friend: string): string {
  const result = beaten.length === 0 ? "I drafted a team from my GitHub stars on Stard." : `I beat ${named(beaten)} with my GitHub stars on Stard.`;
  const ask = friend ? `@${friend}, beat my team:` : "Beat my team:";
  return `${result} ${ask} ${challengeLink(teamLink, friend)}`;
}
