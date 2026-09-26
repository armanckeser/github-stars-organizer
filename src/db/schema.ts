import { pgTable, serial, text, boolean, timestamp, integer, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const repos = pgTable("repos", {
  id: serial("id").primaryKey(),
  githubId: integer("github_id").notNull().unique(),
  nodeId: text("node_id"),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  owner: text("owner").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  homepage: text("homepage"),
  language: text("language"),
  stars: integer("stars").notNull().default(0),
  forks: integer("forks").notNull().default(0),
  topics: text("topics"),
  starredAt: timestamp("starred_at"),
  notes: text("notes"),
  usefulnessRating: integer("usefulness_rating"),
  importedAt: timestamp("imported_at").defaultNow(),
}, (table) => [
  check("rating_range", sql`${table.usefulnessRating} IS NULL OR (${table.usefulnessRating} >= 1 AND ${table.usefulnessRating} <= 5)`),
]);

export const lists = pgTable("lists", {
  id: serial("id").primaryKey(),
  githubListId: text("github_list_id"),
  name: text("name").notNull(),
  description: text("description"),
  isPrivate: boolean("is_private").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const listItems = pgTable("list_items", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull(),
  repoId: integer("repo_id").notNull(),
  position: integer("position").notNull().default(0),
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => [
  unique("list_repo_unique").on(table.listId, table.repoId),
]);

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#00d47e"),
});

export const repoTags = pgTable("repo_tags", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id").notNull(),
  tagId: integer("tag_id").notNull(),
}, (table) => [
  unique("repo_tag_unique").on(table.repoId, table.tagId),
]);
