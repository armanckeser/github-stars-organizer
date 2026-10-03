import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { demoSnapshotUser } from "@/lib/demo";
import { loadUserStars } from "@/lib/demo-load-user";

// Demo only: stands in for "Import Stars", which needs the server and a token.
export function DemoUserForm() {
  const [username, setUsername] = useState("");
  const [showing, setShowing] = useState(demoSnapshotUser);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function handleLoad() {
    const name = username.trim().replace(/^@/, "");
    if (!name) return;
    setLoading(true);
    setStatus("Reading stars...");
    try {
      const count = await loadUserStars(name, (n) => setStatus(`Read ${n} stars...`));
      setShowing(name);
      setUsername("");
      setStatus(`${count} recent stars from @${name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Couldn't read those stars.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 sm:items-end">
      <form
        onSubmit={(e) => { e.preventDefault(); handleLoad(); }}
        className="flex w-full items-center gap-2 sm:w-auto"
      >
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Any GitHub username"
          aria-label="GitHub username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className="h-10 min-w-0 flex-1 sm:h-9 sm:w-48 sm:flex-none"
        />
        <Button type="submit" className="h-10 sm:h-9" disabled={loading || !username.trim()}>
          {loading ? "Loading..." : "Load"}
        </Button>
      </form>
      <span className="text-xs text-muted-foreground">
        {status || (showing ? `Showing @${showing}` : "")}
      </span>
    </div>
  );
}
