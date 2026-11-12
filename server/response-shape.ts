// The version of the Worker's JSON replies. It goes up whenever a reply's shape changes,
// and whenever the same repo would now be dealt different card numbers (a rarity or
// stat rule), since a cached pool keeps the old cards for up to a week.
// The Worker keys its edge cache on it (worker/src/edge-cache.ts), and the Play screen
// sends it with each read (src/lib/run.ts), so neither the edge nor a browser's own
// HTTP cache hands an older shape to a newer app after a deploy.
export const RESPONSE_SHAPE = "5";
