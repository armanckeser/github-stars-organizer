import { useEffect, useState } from "react";
import { APP_MODE } from "./mode";

// Sign-in on a self-hosted install (server/auth.ts). The server sends a page load
// without a session to /auth/login; this covers a session that ends while the app is
// open: the API answers 401, and a full page load takes the person to sign in.

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

if (APP_MODE === "server") {
  const send = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await send(input, init);
    const url = new URL(input instanceof Request ? input.url : input.toString(), window.location.href);
    if (response.status === 401 && url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
      window.location.assign("/auth/login");
    }
    return response;
  };
}

/** True when this install has sign-in turned on, so there is something to sign out of. */
export function useSignInEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (APP_MODE !== "server") return;
    fetch(`${API_URL}/api/me`)
      .then((response) => (response.ok ? response.json() : null))
      .then((me: { authEnabled?: boolean } | null) => setEnabled(me?.authEnabled === true))
      .catch(() => {});
  }, []);
  return enabled;
}
