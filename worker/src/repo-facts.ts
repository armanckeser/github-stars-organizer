// Repo facts as GitHub last told them, kept for every player. GitHub gives the Worker's
// one token 5,000 points an hour, and each query for a pool's repo facts costs a point.
// Popular repos sit in thousands of pools, so keeping their facts for a week lets most
// players' pools cost only the read of their own profile. The edge cache can't do this:
// it keeps a whole pool, per account and per data center.

import type { FactsNode } from "./battle.ts";

/** A repo's facts and when GitHub gave them (epoch ms). */
export type KeptFacts = { node: FactsNode; readAt: number };

/** Where repo facts are kept: the D1 table in worker/migrations, or a Map in tests. */
export type FactsStore = {
  read: (names: string[]) => Promise<KeptFacts[]>;
  keep: (nodes: FactsNode[], readAt: number) => Promise<void>;
};

/** Keeps one repo's facts: its name in lower case, its facts as JSON, and when GitHub gave them. */
export const KEEP_FACTS = "INSERT INTO repo_facts (name, facts, read_at) VALUES (?, ?, ?) ON CONFLICT (name) DO UPDATE SET facts = excluded.facts, read_at = excluded.read_at";

export function d1FactsStore(db: D1Database): FactsStore {
  return {
    read: async (names) => {
      if (names.length === 0) return [];
      const marks = names.map(() => "?").join(", ");
      const { results } = await db
        .prepare(`SELECT facts, read_at FROM repo_facts WHERE name IN (${marks})`)
        .bind(...names.map((name) => name.toLowerCase()))
        .all<{ facts: string; read_at: number }>();
      return results.map((row) => ({ node: JSON.parse(row.facts) as FactsNode, readAt: row.read_at }));
    },
    keep: async (nodes, readAt) => {
      const write = db.prepare(KEEP_FACTS);
      await db.batch(nodes.map((node) => write.bind(node.nameWithOwner.toLowerCase(), JSON.stringify(node), readAt)));
    },
  };
}
