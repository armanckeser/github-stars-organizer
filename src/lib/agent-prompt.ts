import { APP_MODE } from "./mode";

// The copy-paste prompt (the robot icon beside Import Stars) that points an AI agent at this install's API.
// AGENT-API.md documents both versions; the prompt names the right one.

export const AGENT_GUIDE_URL = "https://github.com/armanckeser/github-stars-organizer/blob/main/AGENT-API.md";

const ASK = "Suggest which List each repo in no List belongs in, and any new Lists worth creating. Show me the plan as a table and wait for my OK before changing anything.";

export function agentPrompt(signInEnabled: boolean): string {
  const origin = window.location.origin;
  if (APP_MODE === "local") {
    return `Stars Organizer is running at ${origin}. Read ${AGENT_GUIDE_URL}, then fetch my stars and Lists with POST /api/local/import. ${ASK}`;
  }
  const auth = signInEnabled
    ? " Send every request with the header Authorization: Bearer <AGENT_API_TOKEN> (I'll give you the token)."
    : "";
  return `Stars Organizer is self-hosted at ${origin}. Read ${AGENT_GUIDE_URL}#self-hosted, then fetch my stars and Lists with GET /api/agent/stars.${auth} ${ASK}`;
}
