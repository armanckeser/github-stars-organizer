// The tier colour of each cost, 1 to 5 gold (docs/GAME-UI.md §3). A card's cost is its
// rarity, and this colour means that and nothing else: the card's border, its name
// strip's tint and its cost. The Play screen's shop and the share pictures both read it.

export const TIER_COLORS: Record<number, string> = { 1: "#8b949e", 2: "#3fb950", 3: "#4a90d9", 4: "#a371f7", 5: "#e3b341" };

/** The tier colour of a cost, grey for anything outside 1 to 5. */
export const tierColor = (cost: number): string => TIER_COLORS[cost] ?? TIER_COLORS[1];
