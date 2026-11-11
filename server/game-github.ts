import { GitHubError, type GitHubClient } from "./github.ts";

// The writes a battle needs (issue #47), made with the player's own GitHub login:
// opening the thread for a challenge, and posting a comment for each move. A thread
// lives in the challenger's profile repo, the one named after their username, as a
// Discussion. Reading a match is the Worker's job (worker/src/game.ts).

type GraphQL = GitHubClient["graphql"];

type RepoNode = {
  id: string;
  hasDiscussionsEnabled: boolean;
  discussionCategories: { nodes: { id: string; slug: string; isAnswerable: boolean }[] };
};

const REPO_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) { id hasDiscussionsEnabled discussionCategories(first: 25) { nodes { id slug isAnswerable } } }
}`;

async function findRepo(graphql: GraphQL, owner: string, name: string): Promise<RepoNode | null> {
  try {
    return (await graphql<{ repository: RepoNode | null }>(REPO_QUERY, { owner, name })).repository;
  } catch (error) {
    // GitHub answers a missing repo with an error, not a null.
    if (error instanceof GitHubError && /not resolve to a Repository/i.test(error.message)) return null;
    throw error;
  }
}

export type OpenedThread = { repo: string; number: number; url: string };

/**
 * Opens the thread for a challenge in the challenger's profile repo, turning Discussions
 * on there if needed. `repoName` is the profile repo unless a test points somewhere else.
 */
export async function openBattleThread(graphql: GraphQL, login: string, title: string, body: string, repoName = login): Promise<OpenedThread> {
  let repo = await findRepo(graphql, login, repoName);
  if (!repo) {
    throw new GitHubError(404, `Battles live in your profile repo, ${login}/${login}. Create that repo on GitHub first (the README in it is the one that shows on your profile page).`);
  }
  if (!repo.hasDiscussionsEnabled) {
    await graphql(`mutation($id: ID!) { updateRepository(input: { repositoryId: $id, hasDiscussionsEnabled: true }) { repository { id } } }`, { id: repo.id });
    // GitHub adds the default categories when Discussions are turned on.
    repo = (await findRepo(graphql, login, repoName)) ?? repo;
  }
  const categories = repo.discussionCategories.nodes;
  // General takes any kind of post; a Q&A category would ask for an accepted answer.
  const category = categories.find((c) => c.slug === "general") ?? categories.find((c) => !c.isAnswerable && c.slug !== "announcements") ?? categories[0];
  if (!category) throw new GitHubError(409, `${login}/${repoName} has Discussions on but no category to post in. Add one in the repo's Discussions tab.`);
  const created = await graphql<{ createDiscussion: { discussion: { number: number; url: string } } }>(
    `mutation($repo: ID!, $category: ID!, $title: String!, $body: String!) {
      createDiscussion(input: { repositoryId: $repo, categoryId: $category, title: $title, body: $body }) { discussion { number url } }
    }`,
    { repo: repo.id, category: category.id, title, body },
  );
  return { repo: `${login}/${repoName}`, ...created.createDiscussion.discussion };
}

/** Posts a comment in a battle's thread: an answer to a challenge, a move, or a line of chat. */
export async function postBattleComment(graphql: GraphQL, repo: string, number: number, body: string): Promise<{ id: string; url: string }> {
  const [owner, name] = repo.split("/");
  const found = await graphql<{ repository: { discussion: { id: string } | null } | null }>(
    `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { discussion(number: $number) { id } } }`,
    { owner, name, number },
  );
  const discussion = found.repository?.discussion;
  if (!discussion) throw new GitHubError(404, "That battle's thread is gone from GitHub.");
  const added = await graphql<{ addDiscussionComment: { comment: { id: string; url: string } } }>(
    `mutation($discussion: ID!, $body: String!) { addDiscussionComment(input: { discussionId: $discussion, body: $body }) { comment { id url } } }`,
    { discussion: discussion.id, body },
  );
  return added.addDiscussionComment.comment;
}

const REPO = /^[\w.-]{1,39}\/[\w.-]{1,100}$/;
const MAX_BODY = 60_000;

/** Checks what the app sent before anything is posted in the player's name. */
export function parseChallenge(input: unknown): { title: string; body: string } {
  const { title, body } = (input ?? {}) as { title?: unknown; body?: unknown };
  if (typeof title !== "string" || !title.startsWith("Stard battle: ") || title.length > 200) throw new GitHubError(400, "That isn't a battle challenge.");
  if (typeof body !== "string" || !body.includes("<!-- stard:battle ") || body.length > MAX_BODY) throw new GitHubError(400, "That isn't a battle challenge.");
  return { title, body };
}

export function parseBattleComment(input: unknown): { repo: string; number: number; body: string } {
  const { repo, number, body } = (input ?? {}) as { repo?: unknown; number?: unknown; body?: unknown };
  if (typeof repo !== "string" || !REPO.test(repo) || !Number.isInteger(number) || (number as number) < 1) throw new GitHubError(400, "A battle is a repo and a thread number.");
  if (typeof body !== "string" || !body.trim() || body.length > MAX_BODY) throw new GitHubError(400, "A comment needs some text.");
  return { repo, number: number as number, body };
}
