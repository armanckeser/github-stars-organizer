import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import { APP_MODE } from "../lib/mode";
import { fetchTokenInfo } from "../lib/github-extras";
import type { TokenResponse } from "../lib/local-api";
import { agentPrompt, AGENT_GUIDE_URL } from "../lib/agent-prompt";
import { useSignInEnabled } from "../lib/session";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

const NEW_TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo&description=Stars%20Organizer";

// What the app does with the token, so a self-hoster can judge the scope it asks for.
const TOKEN_USES = [
  "Reads your stars and your Lists",
  "Creates, renames and deletes Lists, and adds or removes repos in them",
  "Unstars a repo when you ask",
  "Searches GitHub when you look for similar repos",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function TokenSection() {
  const [info, setInfo] = useState<TokenResponse | null | "loading">("loading");
  useEffect(() => {
    fetchTokenInfo().then(setInfo).catch((error) => setInfo({ connected: false, error: String(error) }));
  }, []);

  if (APP_MODE === "demo") {
    return (
      <Section title="GitHub token">
        <p className="text-sm text-muted-foreground">
          The demo needs no token. With your own stars, Stars Organizer uses your GitHub CLI login
          (<code>npx github-stars-organizer</code>), or a{" "}
          <a href={NEW_TOKEN_URL} target="_blank" rel="noopener" className="text-primary hover:underline">classic token with the repo scope</a>{" "}
          when self-hosted.
        </p>
      </Section>
    );
  }

  const missingRepo = info !== "loading" && info?.scopes && !info.scopes.includes("repo");
  return (
    <Section title="GitHub token">
      {info === "loading" && <p className="text-sm text-muted-foreground">Checking the token...</p>}
      {info !== "loading" && info?.connected && (
        <div className="space-y-2 text-sm">
          <p>Signed in to GitHub as <span className="font-medium">{info.login}</span>{APP_MODE === "local" ? ", through the GitHub CLI." : "."}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">Scopes:</span>
            {info.scopes == null
              ? <span className="text-muted-foreground">not listed (a fine-grained token)</span>
              : info.scopes.map((s) => <Badge key={s} variant={s === "repo" ? "default" : "secondary"}>{s}</Badge>)}
          </div>
          {missingRepo && (
            <p className="text-amber-500">
              Lists and unstars need the <code>repo</code> scope.{" "}
              <a href={NEW_TOKEN_URL} target="_blank" rel="noopener" className="underline">Create a token with it</a>.
            </p>
          )}
        </div>
      )}
      {info !== "loading" && !info?.connected && (
        <p className="text-sm text-muted-foreground">
          No working token{info?.error ? ` (${info.error})` : ""}.{" "}
          <a href={NEW_TOKEN_URL} target="_blank" rel="noopener" className="text-primary hover:underline">Create a classic token</a>{" "}
          with the <code>repo</code> scope, set it as <code>GITHUB_TOKEN</code> and restart the app.
        </p>
      )}
      <div className="text-sm text-muted-foreground">
        <p className="mb-1">Stars Organizer uses the token only to talk to GitHub:</p>
        <ul className="list-disc pl-5 space-y-0.5">
          {TOKEN_USES.map((u) => <li key={u}>{u}</li>)}
        </ul>
        <p className="mt-2">
          The <code>repo</code> scope also allows changes to your repositories. Stars Organizer never reads or changes code.
        </p>
      </div>
    </Section>
  );
}

function AgentSection() {
  const signInEnabled = useSignInEnabled();
  return (
    <Section title="Sort your stars with an AI agent">
      <p className="text-sm text-muted-foreground">
        An AI agent such as Claude Code or Codex can read your stars, suggest Lists for the ones in no List,
        and sort them once you agree. The agent talks to Stars Organizer over its HTTP API. Stars Organizer
        itself sends nothing to an AI service.
      </p>
      {APP_MODE === "demo" ? (
        <p className="text-sm text-muted-foreground">
          Run <code>npx github-stars-organizer</code> to try this with your own stars.
        </p>
      ) : (
        <>
          <p className="text-sm">Paste this into your agent:</p>
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{agentPrompt(signInEnabled)}</pre>
          <div className="flex items-center gap-3">
            <CopyButton text={agentPrompt(signInEnabled)} />
            <a href={AGENT_GUIDE_URL} target="_blank" rel="noopener" className="text-sm text-primary hover:underline">Read the API guide</a>
          </div>
          {APP_MODE === "server" && signInEnabled && (
            <p className="text-xs text-muted-foreground">
              The agent needs this install's <code>AGENT_API_TOKEN</code>: the value you set, or the one generated on first
              start in the <code>instance_secret</code> table.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-display font-bold tracking-tight">AI agents &amp; token</h1>
      <AgentSection />
      <TokenSection />
    </div>
  );
}
