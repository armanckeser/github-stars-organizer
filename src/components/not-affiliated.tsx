import { APP_MODE } from "@/lib/mode";

/** The demo's privacy notice: what the public demo reads, keeps and counts. */
export const PRIVACY_URL = "https://armanckeser.com/privacy#stard";

/** The small print under the start form and a team: Stard is not GitHub's. The privacy link is the public demo's; a self-hosted install has its own owner. */
export function NotAffiliated() {
  return (
    <p className="text-xs text-white/45">
      Not affiliated with or endorsed by GitHub.
      {APP_MODE === "demo" && (
        <>
          {" "}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">Privacy</a>
        </>
      )}
    </p>
  );
}
