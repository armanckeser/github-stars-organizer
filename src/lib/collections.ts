import { createCollection } from "@tanstack/react-db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { apiPost, apiDelete, apiPatch, apiCreateList, apiDeleteList, apiUpdateList, apiUnstarRepo, apiAddRepoToList, apiRemoveRepoFromList } from "./api";

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

export const repoCollection = createCollection(
  electricCollectionOptions<Repo>({
    id: "repos",
    shapeOptions: { url: electricUrl("repos") },
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const newItem = transaction.mutations[0].modified;
      const result = await apiPost("repos", newItem);
      return { txid: result.txid };
    },
    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0];
      const result = await apiPatch("repos", original.id, changes);
      return { txid: result.txid };
    },
    onDelete: async ({ transaction }) => {
      const { original } = transaction.mutations[0];
      const result = await apiUnstarRepo(original.id);
      return { txid: result.txid };
    },
  }),
);

export const listCollection = createCollection(
  electricCollectionOptions<StarList>({
    id: "lists",
    shapeOptions: { url: electricUrl("lists") },
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const newItem = transaction.mutations[0].modified;
      const result = await apiCreateList({ name: newItem.name, description: newItem.description });
      return { txid: result.txid };
    },
    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0];
      const result = await apiUpdateList(original.id, changes);
      return { txid: result.txid };
    },
    onDelete: async ({ transaction }) => {
      const { original } = transaction.mutations[0];
      const result = await apiDeleteList(original.id);
      return { txid: result.txid };
    },
  }),
);

export const listItemCollection = createCollection(
  electricCollectionOptions<ListItem>({
    id: "list_items",
    shapeOptions: { url: electricUrl("list_items") },
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const newItem = transaction.mutations[0].modified;
      const result = await apiAddRepoToList(newItem.list_id, { repo_id: newItem.repo_id });
      return { txid: result.txid };
    },
    onDelete: async ({ transaction }) => {
      const { original } = transaction.mutations[0];
      const result = await apiRemoveRepoFromList(original.list_id, original.repo_id);
      return { txid: result.txid };
    },
  }),
);

export const tagCollection = createCollection(
  electricCollectionOptions<Tag>({
    id: "tags",
    shapeOptions: { url: electricUrl("tags") },
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const newItem = transaction.mutations[0].modified;
      const result = await apiPost("tags", newItem);
      return { txid: result.txid };
    },
    onDelete: async ({ transaction }) => {
      const { original } = transaction.mutations[0];
      const result = await apiDelete("tags", original.id);
      return { txid: result.txid };
    },
  }),
);

export const repoTagCollection = createCollection(
  electricCollectionOptions<RepoTag>({
    id: "repo_tags",
    shapeOptions: { url: electricUrl("repo_tags") },
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const newItem = transaction.mutations[0].modified;
      const result = await apiPost("repo_tags", newItem);
      return { txid: result.txid };
    },
    onDelete: async ({ transaction }) => {
      const { original } = transaction.mutations[0];
      const result = await apiDelete("repo_tags", original.id);
      return { txid: result.txid };
    },
  }),
);
