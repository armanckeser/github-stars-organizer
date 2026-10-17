import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { serve } from "@hono/node-server";
import { createGitHubClient, type GitHubClient } from "../../server/github.ts";
import { LOCAL_APP_SIGNATURE, type PingResponse } from "../../src/lib/local-api.ts";
import { defaultHome } from "./backup-store.ts";
import { BackupFailedError, launch } from "./launch.ts";

// `npx github-stars-organizer`: serves the app on 127.0.0.1 with the user's own
// GitHub login, opens it, and stops on Ctrl-C. The data lives in the browser,
// keyed to this origin, which is why the port is fixed rather than random.

const DEFAULT_PORT = 5185;
const EXIT_FAILURE = 1;

const HELP = `Usage: npx github-stars-organizer [--port <number>] [--no-open]

Opens Stars Organizer on http://127.0.0.1:${DEFAULT_PORT} using your GitHub
login from the gh CLI (or GITHUB_TOKEN, if set). Tags, ratings and notes are
saved in this browser; Lists and unstars are written to GitHub.

  --port <number>  Serve on another port. Each port keeps its own saved data.
  --no-open        Print the address without opening a browser.
  --help           Show this message.`;

class CliError extends Error {}

async function resolveToken(): Promise<string> {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const { stdout } = await promisify(execFile)("gh", ["auth", "token"]);
    const token = stdout.trim();
    if (token) return token;
  } catch {
    // Not installed, or not logged in: both end in the same advice below.
  }
  throw new CliError("No GitHub login found. Run `gh auth login` (or set GITHUB_TOKEN) and try again.");
}

async function signedInAs(github: GitHubClient): Promise<string> {
  try {
    const data = await github.graphql<{ viewer: { login: string } }>("{ viewer { login } }");
    return data.viewer.login;
  } catch (error) {
    throw new CliError(`GitHub rejected the token: ${error instanceof Error ? error.message : error}`);
  }
}

type PortState = "free" | "ours" | "taken";

async function checkPort(port: number): Promise<PortState> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/local/ping`, { signal: AbortSignal.timeout(1000) });
    const body = (await response.json().catch(() => null)) as PingResponse | null;
    return body?.app === LOCAL_APP_SIGNATURE ? "ours" : "taken";
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code;
    return code === "ECONNREFUSED" ? "free" : "taken";
  }
}

function openBrowser(url: string) {
  const [command, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  // A missing xdg-open (a server, WSL, a container) fails asynchronously; the
  // address is already printed, so there is nothing more to do.
  child.on("error", () => undefined);
  child.unref();
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CliError(`--port must be a number from 1 to 65535, got "${value}".`);
  return port;
}

async function main() {
  const { values } = parseArgs({
    options: { port: { type: "string" }, "no-open": { type: "boolean" }, help: { type: "boolean" } },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const port = parsePort(values.port);
  const url = `http://127.0.0.1:${port}`;
  const shouldOpen = !values["no-open"] && !process.env.CI;

  const portState = await checkPort(port);
  if (portState === "ours") {
    console.log(`Stars Organizer is already running at ${url}`);
    if (shouldOpen) openBrowser(url);
    return;
  }
  if (portState === "taken") throw new CliError(`Port ${port} is in use by something else. Try --port ${port + 1}.`);

  const github = createGitHubClient(await resolveToken());
  const login = await signedInAs(github);
  const appDir = fileURLToPath(new URL("./app/", import.meta.url));
  console.log(`Signed in as ${login}. Backing up your stars and Lists before anything else...`);
  const { app, store, launchBackup } = await launch({ github, login, home: defaultHome(), appDir, port });
  console.log(`Backed up ${launchBackup.stars} stars and ${launchBackup.lists} Lists to ${store.directory}`);

  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, () => {
    console.log(`Stars Organizer at ${url} (Ctrl-C to quit)`);
    if (shouldOpen) openBrowser(url);
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(error.code === "EADDRINUSE" ? `Port ${port} is in use. Try --port ${port + 1}.` : error.message);
    process.exit(EXIT_FAILURE);
  });
  process.on("SIGINT", () => {
    server.close();
    process.exit(0);
  });
}

main().catch((error: unknown) => {
  const expected = error instanceof CliError || error instanceof BackupFailedError;
  console.error(expected ? error.message : error);
  process.exit(EXIT_FAILURE);
});
