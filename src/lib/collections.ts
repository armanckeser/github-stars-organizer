import { createCollection, createTransaction, localOnlyCollectionOptions } from "@tanstack/react-db";
import type { CollectionConfig } from "@tanstack/react-db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { apiPost, apiDelete, apiPatch, apiCreateList, apiDeleteList, apiUpdateList, apiUnstarRepo, apiAddRepoToList, apiRemoveRepoFromList } from "./api";
import { demoSeed } from "./demo";
import { localApi } from "./local-api";
import { APP_MODE } from "./mode";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

// Production builds leave VITE_API_URL empty so fetches stay same-origin, but
// the Electric client builds its request with `new URL()`, which throws on a
// relative path. Resolve against the page's origin instead.
function electricUrl(table: string) {
  return new URL(`${API_URL}/api/electric/${table}`, window.location.origin).toString();
}

export type Repo = {
  id: string;
  github_id: number;
  node_id: string | null;
  name: string;
  full_name: string;
  owner: string;
  description: string | null;
  url: string;
  homepage: string | null;
  language: string | null;
  stars: number;
  forks: number;
  topics: string | null;
  starred_at: string | null;
  notes: string | null;
  usefulness_rating: number | null;
  imported_at: string;
  health_score: number | null;
  health_data: Record<string, number | string> | null;
  health_refreshed_at: string | null;
  is_archived: boolean;
  pushed_at: string | null;
  created_at: string | null;
};

export type StarList = {
  id: string;
  github_list_id: string | null;
  name: string;
  description: string | null;
  is_private: boolean;
  created_at: string;
  updated_at: string;
};

export type ListItem = {
  id: string;
  list_id: string;
  repo_id: string;
  position: number;
  added_at: string;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
};

export type RepoTag = {
  id: string;
  repo_id: string;
  tag_id: string;
};

type Table = "repos" | "lists" | "list_items" | "tags" | "repo_tags";
type Row = { id: string };

// What a write does beyond the browser, per mode. Server writes return the
// Postgres txid so the optimistic row is held until Electric streams it back.
// Local writes only make the matching GitHub call: the row itself is already
// stored in the browser. A missing entry means the write stays local.
type ServerWrites<T> = {
  insert?: (row: T) => Promise<{ txid: number }>;
  update?: (original: T, changes: Partial<T>) => Promise<{ txid: number }>;
  delete?: (original: T) => Promise<{ txid: number }>;
};
type Settling = { isPersisted: { promise: Promise<unknown> } };
type LocalWrites<T> = {
  insert?: (row: T, transaction: Settling) => Promise<void>;
  update?: (original: T, changes: Partial<T>) => Promise<void>;
  delete?: (original: T, transaction: Settling) => Promise<void>;
};
type Writes<T> = { server: ServerWrites<T>; local: LocalWrites<T> };

// One OPFS SQLite database for every collection in the npx build. The
// coordinator lets a second tab share it instead of failing to open it. A
// dynamic import, so other builds never load the 1.7 MB SQLite worker.
const browserStore = APP_MODE === "local" ? await openBrowserStore() : null;

async function openBrowserStore() {
  const sqlite = await import("@tanstack/browser-db-sqlite-persistence");
  const persistence = sqlite.createBrowserWASQLitePersistence({
    database: await sqlite.openBrowserWASQLiteOPFSDatabase({ databaseName: "stars-organizer.sqlite" }),
    coordinator: new sqlite.BrowserCollectionCoordinator({ dbName: "stars-organizer" }),
  });
  return { persistence, persistedCollectionOptions: sqlite.persistedCollectionOptions };
}

// Bumping this throws on next load and keeps the stored rows, rather than
// silently wiping tags and notes; change it together with a migration.
const LOCAL_SCHEMA_VERSION = 1;

// Every collection is declared once below; this picks how it syncs. A demo build
// is an in-memory copy of the build-time snapshot (scripts/build-demo-data.ts)
// whose writes reset on reload. APP_MODE is a build-time literal, so each build
// keeps only its own branch. The three option types differ only in their utils,
// which nothing outside this file reads, so all three are typed as the base config.
function collectionOptions<T extends Row>(id: Table, writes: Writes<T>): CollectionConfig<T, string> {
  const getKey = (item: T) => item.id;
  if (APP_MODE === "demo") {
    return localOnlyCollectionOptions<T, string>({ id, getKey, initialData: [...(demoSeed()[id] ?? [])] as T[] }) as CollectionConfig<T, string>;
  }
  if (browserStore) {
    const local = writes.local;
    return browserStore.persistedCollectionOptions<T, string>({
      id,
      getKey,
      persistence: browserStore.persistence,
      schemaVersion: LOCAL_SCHEMA_VERSION,
      onInsert: local.insert && (async ({ transaction }) => {
        for (const mutation of transaction.mutations) await local.insert!(mutation.modified, transaction);
      }),
      onUpdate: local.update && (async ({ transaction }) => {
        for (const mutation of transaction.mutations) await local.update!(mutation.original, mutation.changes);
      }),
      onDelete: local.delete && (async ({ transaction }) => {
        for (const mutation of transaction.mutations) await local.delete!(mutation.original, transaction);
      }),
    }) as CollectionConfig<T, string>;
  }
  const { server } = writes;
  return electricCollectionOptions<T>({
    id,
    shapeOptions: { url: electricUrl(id) },
    getKey,
    onInsert: server.insert && (async ({ transaction, collection }) => {
      for (const mutation of transaction.mutations) {
        await collection.utils.awaitTxId((await server.insert!(mutation.modified)).txid);
      }
    }),
    onUpdate: server.update && (async ({ transaction, collection }) => {
      for (const mutation of transaction.mutations) {
        await collection.utils.awaitTxId((await server.update!(mutation.original, mutation.changes)).txid);
      }
    }),
    onDelete: server.delete && (async ({ transaction, collection }) => {
      for (const mutation of transaction.mutations) {
        await collection.utils.awaitTxId((await server.delete!(mutation.original)).txid);
      }
    }),
  }) as CollectionConfig<T, string>;
}

export const repoCollection = createCollection(
  collectionOptions<Repo>("repos", {
    server: {
      insert: (row) => apiPost("repos", row),
      update: (original, changes) => apiPatch("repos", original.id, changes),
      delete: (original) => apiUnstarRepo(original.id),
    },
    local: {
      delete: async (original, transaction) => {
        await localApi.unstar({ owner: original.owner, name: original.name });
        afterPersisted(transaction, () => deleteChildren(listItemCollection, (item) => item.repo_id === original.id));
        afterPersisted(transaction, () => deleteChildren(repoTagCollection, (tag) => tag.repo_id === original.id));
      },
    },
  }),
);

export const listCollection = createCollection(
  collectionOptions<StarList>("lists", {
    server: {
      insert: (row) => apiCreateList({ name: row.name, description: row.description }),
      update: (original, changes) => apiUpdateList(original.id, changes),
      delete: (original) => apiDeleteList(original.id),
    },
    local: {
      insert: async (row, transaction) => {
        const { githubListId } = await localApi.createList({ name: row.name, description: row.description ?? null });
        afterPersisted(transaction, () => listCollection.update(row.id, (draft) => { draft.github_list_id = githubListId; }));
      },
      update: async (original, changes) => {
        if (!original.github_list_id) return;
        await localApi.updateList(original.github_list_id, { name: changes.name, description: changes.description });
      },
      delete: async (original, transaction) => {
        if (original.github_list_id) await localApi.deleteList(original.github_list_id);
        afterPersisted(transaction, () => deleteChildren(listItemCollection, (item) => item.list_id === original.id));
      },
    },
  }),
);

export const listItemCollection = createCollection(
  collectionOptions<ListItem>("list_items", {
    server: {
      insert: (row) => apiAddRepoToList(row.list_id, { repo_id: row.repo_id }),
      delete: (original) => apiRemoveRepoFromList(original.list_id, original.repo_id),
    },
    local: {
      insert: (row) => syncListChange(row, "add"),
      delete: (original) => syncListChange(original, "remove"),
    },
  }),
);

export const tagCollection = createCollection(
  collectionOptions<Tag>("tags", {
    server: {
      insert: (row) => apiPost("tags", row),
      delete: (original) => apiDelete("tags", original.id),
    },
    local: {},
  }),
);

export const repoTagCollection = createCollection(
  collectionOptions<RepoTag>("repo_tags", {
    server: {
      insert: (row) => apiPost("repo_tags", row),
      delete: (original) => apiDelete("repo_tags", original.id),
    },
    local: {},
  }),
);

// Writes rows to the browser's storage without running the write handlers above,
// for changes that already happened on GitHub: an import, or the follow-up rows
// of a write that just succeeded. Local builds only.
export async function writeWithoutSync(mutate: () => void): Promise<void> {
  const transaction = createTransaction({
    mutationFn: async ({ transaction: pending }) => {
      for (const collection of [repoCollection, listCollection, listItemCollection, tagCollection, repoTagCollection]) {
        await (collection.utils as { acceptMutations: (tx: typeof pending) => Promise<void> | void }).acceptMutations(pending);
      }
    },
  });
  transaction.mutate(mutate);
  await transaction.isPersisted.promise;
}

function afterPersisted(transaction: Settling, mutate: () => void) {
  void transaction.isPersisted.promise.then(() => writeWithoutSync(mutate));
}

function deleteChildren<T extends Row>(collection: { toArray: T[]; delete: (keys: string[]) => unknown }, belongs: (row: T) => boolean) {
  const keys = collection.toArray.filter(belongs).map((row) => row.id);
  if (keys.length > 0) collection.delete(keys);
}

// One List change on GitHub. The server re-reads the repo's Lists before writing
// (updateUserListsForItem replaces the whole set), so the browser only says which
// List changed, never which Lists the repo should be in.
async function syncListChange(item: ListItem, change: "add" | "remove"): Promise<void> {
  const repo = repoCollection.get(item.repo_id);
  const githubListId = listCollection.get(item.list_id)?.github_list_id;
  if (!repo?.node_id) return;
  if (!githubListId) throw new Error("That List is still being created on GitHub. Try again in a moment.");
  await localApi.changeMembership({ repoNodeId: repo.node_id, repoGithubId: repo.github_id, githubListId, change });
}
