// Repos like a given one, found through GitHub search. GitHub has no "related
// repositories" API, so this asks search a few narrow questions about the repo
// (its most specific topics, the words of its description) and ranks the pooled
// answers by how much each candidate actually shares with it.
//
// Search allows 30 requests a minute per token, so one lookup makes at most
// MAX_QUERIES of them and runs only when someone asks for it.

export type SimilarSource = {
  full_name: string;
  description: string | null;
  language: string | null;
  /** Comma-separated, as stored on a repo row. */
  topics: string | null;
  stars: number;
  /** The README's opening, when it could be read; see readmeLead. */
  readme?: string | null;
};

export type SearchItem = {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  pushed_at: string | null;
  archived: boolean;
  fork: boolean;
};

export type SearchFn = (q: string, sort: "stars" | "best-match") => Promise<SearchItem[]>;

type QueryKind = "topic" | "words" | "readme";
export type Query = { kind: QueryKind; q: string; sort: "stars" | "best-match" };
export type QueryResult = { kind: QueryKind; items: SearchItem[] };

export type SimilarRepo = {
  full_name: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  pushed_at: string | null;
  /** Topics it shares with the source repo, most specific first. */
  shared_topics: string[];
  score: number;
};

export const MAX_QUERIES = 3;
const README_LEAD_CHARS = 4000;
const PER_PAGE_LIMIT = 30;
const RESULT_LIMIT = 8;
const MIN_STARS = 10;
const DAY_MS = 86_400_000;
const MIN_SCORE = 2.5;
const LIST_NAME = /awesome|dotfiles|^\.?config|examples|templates|cookbook|tips|resources|curated|^free-for/i;
const LIST_DESCRIPTION = /curated list|list of|collection of|my (dotfiles|config|setup)/i;

// Topics that say little about what a repo does: languages, platforms and
// labels that thousands of unrelated repos carry. Searching on these alone
// returns whatever is most popular (lazygit's "cli, git, terminal" gets bat and ohmyzsh).
const BROAD_TOPICS = new Set([
  "javascript", "typescript", "python", "python3", "go", "golang", "rust", "java", "kotlin", "swift",
  "c", "cpp", "c-plus-plus", "csharp", "dotnet", "php", "ruby", "scala", "elixir", "haskell", "lua",
  "shell", "bash", "zsh", "nodejs", "node", "node-js", "deno", "react", "reactjs", "vue", "vuejs",
  "svelte", "sveltekit", "nextjs", "angular", "flutter", "dart", "html", "css", "tailwindcss",
  "cli", "terminal", "command-line", "command-line-tool", "tool", "tools", "library", "framework",
  "api", "rest-api", "app", "application", "core", "main", "web", "webapp", "website", "server", "client",
  "linux", "macos", "windows", "android", "ios", "mobile", "mobile-app", "desktop", "cross-platform",
  "docker", "kubernetes", "self-hosted", "selfhosted", "open-source", "opensource", "free",
  "hacktoberfest", "awesome", "awesome-list", "list", "github", "git", "productivity", "utility",
  "ai", "llm", "machine-learning", "deep-learning", "artificial-intelligence", "chatgpt", "openai",
  "browser", "database", "backend", "frontend", "fullstack", "devops", "security", "automation",
  "javascript-library", "typescript-library", "python-library", "npm", "pypi", "crate", "plugin",
]);

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "for", "of", "to", "in", "on", "with", "by", "from", "as", "at",
  "is", "are", "be", "it", "its", "that", "this", "your", "you", "into", "via", "using", "use",
  "based", "written", "simple", "fast", "blazing", "modern", "lightweight", "tiny", "small",
  "powerful", "easy", "minimal", "beautiful", "highly", "customizable", "open", "source", "free",
  "high", "performance", "best", "new", "awesome", "official", "library", "tool", "tools", "app",
  "project", "framework", "implementation", "collection", "solution", "way", "just", "like",
  "clone", "alternative", "replacement", "supercharge", "even", "works", "entire", "made",
  "command-line", "command", "line", "cli", "user-friendly", "cross-platform", "fancy",
  "system", "platform", "code", "elements", "linux", "macos", "windows", "can", "will", "also", "all", "any", "get", "make", "run", "running", "see", "more", "other", "one",
  "software", "support", "supports", "feature", "features", "install", "installation", "using",
  "about", "how", "what", "which", "when", "there", "here", "they", "them", "their", "our", "we",
  "has", "have", "not", "but", "if", "so", "up", "out", "only", "most", "some", "such", "than",
  "then", "these", "those", "very", "well", "want", "need", "needs", "please", "note", "help",
  "docs", "documentation", "license", "contributing", "contributors", "release", "releases",
  "version", "download", "build", "github", "com", "www", "readme",
]);

export function parseTopics(topics: string | null): string[] {
  return topics?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
}

// The repo's own name ("ripgrep", "uptime-kuma"). Topics and descriptions that
// carry it point at add-ons for the repo (backup scripts, plugins, translations),
// not at alternatives to it.
function ownNames(source: SimilarSource): string[] {
  const [owner, name] = source.full_name.toLowerCase().split("/");
  // httpie/cli, cli/cli: a generic repo name is the owner's project.
  const project = BROAD_TOPICS.has(name) ? owner : name;
  const joined = project.replace(/[-_.]/g, "");
  return joined === project ? [project] : [project, joined];
}

function mentionsOwnName(text: string, names: string[]): boolean {
  const lower = text.toLowerCase();
  return names.some((n) => new RegExp(`(^|[^a-z0-9])${n.replace(/[.]/g, "\\.")}([^a-z0-9]|$)`).test(lower));
}

function hasWord(words: string[], part: string): number {
  return words.findIndex((w) => w === part || w === `${part}s` || w === part.replace(/s$/, "") || w.split("-").includes(part));
}

// The topics that best say what the repo does, best first: topics its own
// description uses, the description's lead noun first ("whiteboard" before
// "diagrams" in "Virtual whiteboard for sketching hand-drawn like diagrams"),
// compound topics ("html-to-markdown") over the single words inside them.
// A topic the description never mentions ("fish", "neovim" on fzf) says where
// the repo runs, not what it is, so it is left out.
export function specificTopics(source: SimilarSource): string[] {
  const language = source.language?.toLowerCase();
  const names = ownNames(source);
  const words = descriptionWords(source.description);
  const scored = parseTopics(source.topics)
    .filter((t) => !BROAD_TOPICS.has(t) && t !== language && !mentionsOwnName(t, names))
    .map((topic) => {
      const parts = topic.split("-").filter((part) => !STOPWORDS.has(part)); // "html-to-markdown"
      const positions = parts.map((part) => hasWord(words, part)).filter((i) => i >= 0);
      const fraction = positions.length / parts.length;
      const first = positions.length > 0 ? Math.min(...positions) : words.length;
      return { topic, fraction, relevance: 3 * fraction + 0.3 * Math.min(parts.length, 3) - 0.05 * first };
    });
  return scored
    .filter((t) => t.fraction > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .map((t) => t.topic);
}

// The prose at the top of a README, without badges, images, links' targets,
// code and HTML. Many descriptions are a slogan ("A cat(1) clone with wings");
// the README's first paragraphs say what the project is.
export function readmeLead(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .slice(0, README_LEAD_CHARS);
}

// The words that say what the repo is, best first: description words, ranked
// by how often the README's opening repeats them, then README words the
// description lacks ("syntax highlighting" for bat, "media server" for jellyfin).
export function keyWords(source: SimilarSource): string[] {
  const names = ownNames(source);
  const language = source.language?.toLowerCase();
  const described = descriptionWords(source.description).filter((w) => !mentionsOwnName(w, names) && w !== language);
  const counts = new Map<string, number>();
  for (const w of source.readme ? wordsOf(source.readme) : []) {
    if (!mentionsOwnName(w, names) && w !== language) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const fromReadme = [...counts.entries()]
    .filter(([w, n]) => n >= 3 && !described.includes(w))
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
  // A description word the README never repeats is likely a slogan ("wings").
  const rank = (w: string) => counts.get(w) ?? 0;
  const hasReadme = counts.size > 0;
  return [
    ...described.map((w, i) => ({ w, score: (hasReadme ? 2 * rank(w) + 4 : 100) - 0.1 * i })),
    ...fromReadme.map((w, i) => ({ w, score: rank(w) - 0.1 * i })),
  ]
    .sort((a, b) => b.score - a.score)
    .map(({ w }) => w);
}

// Like descriptionWords, but keeping repeats so they can be counted.
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/:[a-z0-9_+-]+:/g, " ")
    .split(/[^a-z0-9+#.-]+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((w) => w.length > 2 && /[a-z]/.test(w) && !STOPWORDS.has(w));
}

export function descriptionWords(description: string | null): string[] {
  if (!description) return [];
  const words = description
    .toLowerCase()
    .replace(/:[a-z0-9_+-]+:/g, " ") // ":cherry_blossom:"
    .replace(/\([^)]*\)/g, " ") // "cat(1)" -> "cat"
    .split(/[^a-z0-9+#.-]+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((w) => w.length > 1 && /[a-z]/.test(w) && !STOPWORDS.has(w));
  return [...new Set(words)];
}

// Scale the bar with the source: a 50k-star repo's alternatives are not 12-star
// weekend projects, but a niche repo's may well be small.
function minStars(source: SimilarSource): number {
  return Math.round(Math.min(300, Math.max(MIN_STARS, source.stars / 200)));
}

// At most MAX_QUERIES searches. Each describes the repo a different way (what it's
// tagged, what it says it does, who compares themselves to it), so a candidate
// that turns up in several is a strong match.
export function buildQueries(source: SimilarSource): Query[] {
  const filters = `fork:false archived:false stars:>=${minStars(source)}`;
  const topics = specificTopics(source);
  const names = ownNames(source);
  const topicWords = new Set(topics.flatMap((t) => t.split("-")));
  // Words the topics also use say the most; the rest keep keyWords' order.
  const words = keyWords(source)
    .map((w, i) => ({ w, rank: (topicWords.has(w) ? 0 : 10) + i }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ w }) => w)
    .slice(0, 2); // every word must match, so a third one mostly loses good results

  const queries: Query[] = [];
  // One topic, not two: tldraw tags itself "whiteboard" but not "diagrams", and
  // ranking on shared topics below sorts out how close each result is.
  if (topics.length >= 1) queries.push({ kind: "topic", q: `topic:${topics[0]} ${filters}`, sort: "stars" });
  if (words.length >= 2) queries.push({ kind: "words", q: `${words.join(" ")} in:name,description,topics ${filters}`, sort: "best-match" });
  // Alternatives tend to name the project they replace in their README
  // ("like lazygit", "faster than ripgrep").
  queries.push({ kind: "readme", q: `${names[0]} in:readme ${words[0] ?? ""} ${filters}`.replace(/\s+/g, " "), sort: "stars" });
  return queries.slice(0, MAX_QUERIES);
}

function overlap(a: string[], b: Set<string>): number {
  return a.filter((x) => b.has(x)).length;
}

export function rankSimilar(
  source: SimilarSource,
  results: QueryResult[],
  now = Date.now(),
): SimilarRepo[] {
  const self = source.full_name.toLowerCase();
  const sourceTopics = parseTopics(source.topics);
  const specific = new Set(specificTopics(source));
  const sourceWords = new Set(keyWords(source).slice(0, 12));
  const names = ownNames(source);

  const pool = new Map<string, { item: SearchItem; hits: number; comparesItself: boolean }>();
  for (const { kind, items } of results) {
    for (const item of items.slice(0, PER_PAGE_LIMIT)) {
      const key = item.full_name.toLowerCase();
      if (key === self || item.fork || item.archived) continue;
      const entry = pool.get(key) ?? { item, hits: 0, comparesItself: false };
      entry.hits++;
      if (kind === "readme") entry.comparesItself = true;
      pool.set(key, entry);
    }
  }

  const maxStars = Math.max(1, ...[...pool.values()].map(({ item }) => item.stargazers_count));
  const ranked = [...pool.values()].map(({ item, hits, comparesItself }) => {
    const topics = item.topics ?? [];
    const topicSet = new Set(topics);
    const shared = sourceTopics.filter((t) => topicSet.has(t));
    const sharedSpecific = shared.filter((t) => specific.has(t));
    const words = [...descriptionWords(item.description), ...topics.flatMap((t) => t.split("-"))];
    const wordOverlap = sourceWords.size > 0 ? overlap(words, sourceWords) / Math.sqrt(sourceWords.size * Math.max(1, words.length)) : 0;
    const days = item.pushed_at ? (now - Date.parse(item.pushed_at)) / DAY_MS : Infinity;
    // "fzf.vim", "vaultwarden-backup", "A python library for vaultwarden": built on it, not instead of it.
    const addOn = mentionsOwnName(`${item.full_name.split("/")[1]} ${item.description ?? ""}`, names);
    // Lists of links and personal setups match every topic and replace nothing.
    const roundup = LIST_NAME.test(item.full_name.split("/")[1]) || LIST_DESCRIPTION.test(item.description ?? "");

    // What the repo is for counts most; popularity and recency only break ties
    // between candidates that are equally on topic.
    const score =
      2.0 * sharedSpecific.length +
      0.5 * (shared.length - sharedSpecific.length) +
      3.0 * wordOverlap +
      1.0 * (hits - 1) +
      // Its README names the source and its description doesn't: likely a comparison.
      (comparesItself ? 1.5 : 0) +
      (source.language && item.language === source.language ? 0.5 : 0) +
      2.0 * (Math.log10(item.stargazers_count + 1) / Math.log10(maxStars + 1)) -

      (days > 730 ? 1.0 : days > 365 ? 0.4 : 0);

    return {
      full_name: item.full_name,
      url: item.html_url,
      description: item.description,
      language: item.language,
      stars: item.stargazers_count,
      pushed_at: item.pushed_at,
      shared_topics: [...sharedSpecific, ...shared.filter((t) => !specific.has(t))],
      score: Math.round(score * 100) / 100,
      // Add-ons are built on it, not instead of it; roundups replace nothing.
      related: !addOn && !roundup && (shared.some((t) => !BROAD_TOPICS.has(t)) || wordOverlap > 0),
    };
  });

  // Fewer, closer results beat a full page: past a point the scores are popularity alone.
  // A README that names the source, with no topic or word in common, is a theme
  // or a link roundup that lists it.
  const related = ranked.filter((r) => r.related).sort((a, b) => b.score - a.score);
  const cutoff = Math.max(MIN_SCORE, (related[0]?.score ?? 0) * 0.55);
  return related
    .filter((r) => r.score >= cutoff)
    .slice(0, RESULT_LIMIT)
    .map(({ related: _, ...repo }) => repo); // eslint-disable-line @typescript-eslint/no-unused-vars
}

export async function findSimilar(source: SimilarSource, search: SearchFn, now = Date.now()): Promise<SimilarRepo[]> {
  const queries = buildQueries(source);
  const results: QueryResult[] = [];
  // One at a time: parallel searches are what trips GitHub's secondary rate limit.
  for (const { kind, q, sort } of queries) results.push({ kind, items: await search(q, sort) });
  return rankSimilar(source, results, now);
}
