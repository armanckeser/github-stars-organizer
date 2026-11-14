// The game's public address, shared by the app (shared links, the card origin) and the
// Worker (the link in a battle's opening post, the old address's redirect).
export const SITE_ORIGIN = "https://stard.armanckeser.com";

// The address the game had while it was a stars organizer demo. Profile READMEs embed
// cards from it and team links were shared with it, so the Worker keeps answering it:
// its /api/* as before, every other path a redirect to SITE_ORIGIN.
export const OLD_SITE_HOST = "stars-demo.armanckeser.com";
