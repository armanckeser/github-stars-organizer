/** A folded list of checks shows at most this many rows, and at least this many when it has them. */
const FOLDED_MOST = 3;
const FOLDED_LEAST = 2;

/** How many of a list's rows (live first, then the fullest) show while it is folded: every live set and the next closest, between FOLDED_LEAST and FOLDED_MOST. */
export function foldedCount(rows: { live: boolean }[]): number {
  const live = rows.filter((row) => row.live).length;
  return Math.min(rows.length, FOLDED_MOST, Math.max(FOLDED_LEAST, live + 1));
}
