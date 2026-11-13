// Colours and counts both card faces share: the repo card (battle/repo-card.tsx) and the run card (run/run-card.tsx).

/** The art's background for a repo with no language colour. */
export const NO_LANGUAGE = "#3a4049";

/** The repo's language colour, or the grey for none. */
export const languageColor = (color: string | null) => (color && /^#[0-9a-f]{6}$/i.test(color) ? color : NO_LANGUAGE);

export function isLight(color: string): boolean {
  const n = parseInt(color.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
}

export function compact(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}
