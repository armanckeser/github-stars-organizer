import { APP_MODE } from "./mode";

// The copy-paste prompt (the robot icon beside Import Stars) that points an AI agent at this install's API.
// AGENT-API.md documents both versions; the prompt names the right one.

export const AGENT_GUIDE_URL = "https://github.com/armanckeser/github-stars-organizer/blob/main/AGENT-API.md";

const ASK = "Suggest which List each repo in no List belongs in, and any new Lists worth creating. Show me the plan as a table and wait for my OK before changing anything.";

// The npx version's address unless started with --port (cli/src/cli.ts).
const NPX_ORIGIN = "http://127.0.0.1:5185";

export function agentPrompt(signInEnabled: boolean): string {
  // The demo has no API of its own; it shows the prompt for the npx version it points people to.
  const origin = APP_MODE === "demo" ? NPX_ORIGIN : window.location.origin;
  if (APP_MODE === "local" || APP_MODE === "demo") {
    return `Stard is running at ${origin}. Read ${AGENT_GUIDE_URL}, then fetch my stars and Lists with POST /api/local/import. ${ASK}`;
  }
  const auth = signInEnabled
    ? " Send every request with the header Authorization: Bearer <AGENT_API_TOKEN> (I'll give you the token)."
    : "";
  return `Stard is self-hosted at ${origin}. Read ${AGENT_GUIDE_URL}#self-hosted, then fetch my stars and Lists with GET /api/agent/stars.${auth} ${ASK}`;
}

// The prompt on the Profile screen. The agent builds the same README the screen does,
// but gets the top four and the reviews by asking, in the person's own words.
export function profilePrompt(): string {
  return [
    "Help me make my Stard profile: a block for my GitHub profile README with my top four repos, a few reviews and my Lists, drawn as cards.",
    `Read ${AGENT_GUIDE_URL}#profile-cards first.`,
    "Then interview me, one question at a time: which four repos I would put on a poster and why, which repos I would rave about or warn people off (ask for a rating out of 5 and a sentence or two; keep my wording, don't write the reviews for me), and which of my GitHub Lists to show.",
    "Build the card links, show me the finished Markdown, and only after I say yes put the Markdown in the README of the repo named after my GitHub username.",
  ].join(" ");
}
