// The health score, shared by the server's refresh endpoint and the demo data
// script (scripts/build-demo-data.ts), so the demo shows the same numbers a real
// install would.

export type HealthRepoNode = {
  id: string;
  isArchived?: boolean;
  defaultBranchRef?: { target?: { committedDate?: string } };
  pushedAt?: string | null;
  openIssues?: { totalCount: number };
  closedIssues?: { totalCount: number };
  mentionableUsers?: { totalCount: number };
  stargazerCount: number;
  releases?: { nodes?: { createdAt: string }[] };
};
export type HealthBatchData = { nodes?: HealthRepoNode[] };

export const HEALTH_BATCH_QUERY = `
  query HealthBatch($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Repository {
        id
        isArchived
        pushedAt
        stargazerCount
        openIssues: issues(states: [OPEN]) { totalCount }
        closedIssues: issues(states: [CLOSED]) { totalCount }
        releases(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) {
          nodes { createdAt }
        }
        defaultBranchRef {
          target { ... on Commit { committedDate } }
        }
        mentionableUsers(first: 1) { totalCount }
      }
    }
  }
`;

export function computeHealthScore(repo: HealthRepoNode, storedStars: number, daysSinceLastRefresh: number | null): { score: number; data: Record<string, number | string> } {
  if (repo.isArchived) {
    return { score: 0, data: { reason: "archived", commit_recency: 0, issue_resolution: 0, contributors: 0, star_velocity: 0, release_cadence: 0 } };
  }

  const now = Date.now();

  const lastCommitDate = repo.defaultBranchRef?.target?.committedDate ?? repo.pushedAt;
  const daysSinceCommit = lastCommitDate ? (now - new Date(lastCommitDate).getTime()) / 86400000 : 999;
  const commitRecency = daysSinceCommit <= 7 ? 10 : Math.max(0, 10 - (daysSinceCommit / 365) * 10);

  const openIssues = repo.openIssues?.totalCount ?? 0;
  const closedIssues = repo.closedIssues?.totalCount ?? 0;
  const totalIssues = openIssues + closedIssues;
  const issueResolution = totalIssues > 0 ? (closedIssues / totalIssues) * 10 : 5;

  const mentionableCount = repo.mentionableUsers?.totalCount ?? 0;
  const contributors = Math.min(10, (mentionableCount / 20) * 10);

  let starVelocity: number;
  if (daysSinceLastRefresh && daysSinceLastRefresh > 0) {
    const starDelta = repo.stargazerCount - storedStars;
    const monthlyGrowth = (starDelta / daysSinceLastRefresh) * 30;
    starVelocity = Math.min(10, Math.max(0, monthlyGrowth > 0 ? Math.log10(monthlyGrowth + 1) * 5 : 0));
  } else {
    const repoCreated = repo.pushedAt ? new Date(repo.pushedAt).getTime() : now;
    const repoAgeDays = Math.max(1, (now - repoCreated) / 86400000);
    const monthlyGrowth = (repo.stargazerCount / repoAgeDays) * 30;
    starVelocity = Math.min(10, Math.log10(monthlyGrowth + 1) * 3);
  }

  const latestRelease = repo.releases?.nodes?.[0]?.createdAt;
  let releaseCadence = 0;
  if (latestRelease) {
    const daysSinceRelease = (now - new Date(latestRelease).getTime()) / 86400000;
    releaseCadence = daysSinceRelease <= 30 ? 10 : Math.max(0, 10 - (daysSinceRelease / 365) * 10);
  }

  const score = commitRecency * 0.3 + issueResolution * 0.2 + contributors * 0.2 + starVelocity * 0.15 + releaseCadence * 0.15;

  return {
    score: Math.round(score * 10) / 10,
    data: {
      commit_recency: Math.round(commitRecency * 10) / 10,
      issue_resolution: Math.round(issueResolution * 10) / 10,
      contributors: Math.round(contributors * 10) / 10,
      star_velocity: Math.round(starVelocity * 10) / 10,
      release_cadence: Math.round(releaseCadence * 10) / 10,
      last_commit: lastCommitDate ?? "unknown",
      latest_release: latestRelease ?? "none",
      mentionable_users: mentionableCount,
    },
  };
}
