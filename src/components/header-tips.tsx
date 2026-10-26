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
  return (
    <HeaderTip label="Sort with an AI agent" icon={<Bot className="h-4 w-4" />}>
      <p className="font-medium">Sort with an AI agent</p>
      <p className="text-muted-foreground">
        Claude Code, Codex or any agent that runs <code>curl</code> can suggest Lists for your stars and sort them once you agree.
      </p>
      {APP_MODE === "demo" ? (
        <p className="text-muted-foreground">Run <code>npx github-stars-organizer</code> to use one with your own stars.</p>
      ) : (
        <>
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{prompt}</pre>
          {APP_MODE === "server" && signInEnabled && (
            <p className="text-xs text-muted-foreground">The agent also needs this install's <code>AGENT_API_TOKEN</code>.</p>
          )}
          <div className="flex items-center gap-3">
            <CopyButton text={prompt} />
            <a href={AGENT_GUIDE_URL} target="_blank" rel="noopener" className="text-primary hover:underline">API guide</a>
          </div>
        </>
      )}
    </HeaderTip>
  );
}
