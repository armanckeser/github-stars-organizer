import { useState, type ReactNode } from "react";
import { Bot, KeyRound } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import { APP_MODE } from "@/lib/mode";
import { fetchTokenInfo } from "@/lib/github-extras";
import type { TokenResponse } from "@/lib/local-api";
import { agentPrompt, AGENT_GUIDE_URL } from "@/lib/agent-prompt";
import { useSignInEnabled } from "@/lib/session";

// Small icons beside Import Stars that open on hover: which GitHub token the
// app uses, and how to hand the sorting to an AI agent.

const NEW_TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo&description=Stars%20Organizer";

function HeaderTip({ label, icon, children, onOpen }: { label: string; icon: ReactNode; children: ReactNode; onOpen?: () => void }) {
  return (
    <Popover onOpenChange={(open) => open && onOpen?.()}>
      <PopoverTrigger openOnHover delay={150}
        render={<button type="button" aria-label={label} title={label} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" />}>
        {icon}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 p-3 text-sm">{children}</PopoverContent>
    </Popover>
  );
}

export function TokenTip() {
  // Read when first opened, not on every page load.
  const [info, setInfo] = useState<TokenResponse | null | "loading" | "idle">("idle");
  function load() {
    if (info !== "idle") return;
    setInfo("loading");
    fetchTokenInfo().then(setInfo).catch((error) => setInfo({ connected: false, error: String(error) }));
  }

  const missingRepo = typeof info === "object" && info?.scopes && !info.scopes.includes("repo");
  return (
    <HeaderTip label="GitHub token" icon={<KeyRound className="h-4 w-4" />} onOpen={load}>
      {(info === "idle" || info === "loading") && <p className="text-muted-foreground">Checking the token...</p>}
      {typeof info === "object" && info?.connected && (
        <>
          <p>Signed in to GitHub as <span className="font-medium">{info.login}</span>{APP_MODE === "local" ? " through the GitHub CLI." : "."}</p>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground">Scopes:</span>
            {info.scopes == null
              ? <span className="text-muted-foreground">not listed (fine-grained token)</span>
              : info.scopes.map((s) => <Badge key={s} variant={s === "repo" ? "default" : "secondary"}>{s}</Badge>)}
          </div>
          {missingRepo && <p className="text-amber-500">Lists and unstars need the <code>repo</code> scope.</p>}
        </>
      )}
      {typeof info === "object" && !info?.connected && (
        <p>
          No working token{info?.error ? ` (${info.error})` : ""}. Set <code>GITHUB_TOKEN</code> to a{" "}
          <a href={NEW_TOKEN_URL} target="_blank" rel="noopener" className="text-primary hover:underline">classic token with the repo scope</a>{" "}
          and restart the app.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        The <code>repo</code> scope lets Stars Organizer read your stars, edit your Lists and unstar repos. It never reads or changes code.
      </p>
    </HeaderTip>
  );
}

export function AgentTip() {
  const signInEnabled = useSignInEnabled();
  const prompt = agentPrompt(signInEnabled);
  const where = APP_MODE === "server" ? "that can reach this address" : "on this computer";
  return (
    <HeaderTip label="Sort with an AI agent" icon={<Bot className="h-4 w-4" />}>
      <p className="font-medium">Sort your stars with an AI agent</p>
      <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
        {APP_MODE === "demo" && (
          <li>
            Run <code className="text-foreground">npx github-stars-organizer</code> and leave it running. It signs in with
            your GitHub CLI login.
          </li>
        )}
        <li>Paste this prompt into Claude Code, Codex or another agent that can run commands {where}:</li>
      </ol>
      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{prompt}</pre>
      <div className="flex items-center gap-3">
        <CopyButton text={prompt} />
        <a href={AGENT_GUIDE_URL} target="_blank" rel="noopener" className="text-primary hover:underline">API guide</a>
      </div>
      {APP_MODE === "server" && signInEnabled && (
        <p className="text-xs text-muted-foreground">
          Give the agent this install's <code>AGENT_API_TOKEN</code> when it asks: the value you set, or the one in
          the <code>instance_secret</code> table.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        The agent reads your stars and shows its plan as a table. Nothing changes until you say OK; then it sorts the
        repos into your GitHub Lists.
      </p>
    </HeaderTip>
  );
}
