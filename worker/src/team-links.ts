// A team's short link. The sealed token (worker/src/team.ts) is the team itself and
// runs to well over a thousand characters, too long to paste into a chat. The Worker
// keeps the token in D1 under a short id taken from the token's hash, and opens it
// exactly as it opens a long link: the stored token is still checked against
// BATTLE_KEY, so the table only shortens links and is trusted with nothing.
//
// If the table can't be written (D1's free plan stops writes for the day past its cap),
// the player gets the long link, which keeps working without the table.
//
//   npx wrangler d1 create stard
//   npx wrangler d1 migrations apply stard --remote

/** Where short links are kept: the D1 table in worker/migrations, or a Map in tests. */
export type TeamLinks = {
  /** Keeps `token` under `id` unless `id` is taken; answers the token kept under `id` either way. */
  keep: (id: string, token: string, login: string) => Promise<string | null>;
  find: (id: string) => Promise<string | null>;
};

const SHORT_ID = /^[A-Za-z0-9_-]{10}$/;

/** 10 base64url characters of the token's SHA-256: the same team always gets the same link. */
export async function shortIdOf(token: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return btoa(String.fromCharCode(...hash)).replace(/\+/g, "-").replace(/\//g, "_").slice(0, 10);
}

/** The short id a link can carry instead of `token`, or the token itself when it can't be kept. */
export async function shortened(token: string, login: string, links: TeamLinks | undefined): Promise<string> {
  if (!links) return token;
  const id = await shortIdOf(token);
  try {
    // Two tokens sharing an id is a 1 in 2^60 chance; the long link is right either way.
    return (await links.keep(id, token, login)) === token ? id : token;
  } catch (error) {
    console.error(error);
    return token;
  }
}

/** The sealed token a link's `t` stands for: a short id's stored token, or `t` as it is. */
export async function tokenFor(t: string, links: TeamLinks | undefined): Promise<string> {
  if (!links || !SHORT_ID.test(t)) return t;
  return (await links.find(t)) ?? t;
}

export function d1TeamLinks(db: D1Database): TeamLinks {
  const find = async (id: string) => (await db.prepare("SELECT token FROM team_links WHERE id = ?").bind(id).first<string>("token")) ?? null;
  return {
    find,
    keep: async (id, token, login) => {
      const kept = await db.prepare("INSERT INTO team_links (id, token, login, created) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING").bind(id, token, login.toLowerCase(), new Date().toISOString()).run();
      return kept.meta.changes > 0 ? token : find(id);
    },
  };
}
