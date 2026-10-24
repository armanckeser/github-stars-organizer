import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Context, Hono, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { getAuth, initOidcAuthMiddleware, oidcAuthMiddleware, revokeSession } from "@hono/oidc-auth";

// Sign-in for a self-hosted install, off unless configured. A self-hoster picks one:
// - AUTH_PASSWORD: one shared password, for a server with no OIDC provider (CasaOS,
//   Unraid, a bare port on the LAN). The session is a signed cookie `<expiry>.<hmac>`
//   keyed by SESSION_SECRET, so nothing is stored per login and a restart keeps
//   everyone signed in.
// - AUTH_ENABLED=1 and OIDC_*: sign in with Authentik, Authelia, Pocket ID, Cosmos...
//   OIDC wins when both are set.
// AGENT_API_TOKEN lets a script or agent call /api/* with `Authorization: Bearer`.
// With neither set, every route is open, which is right behind a proxy that already
// decides who gets in. boot.ts generates SESSION_SECRET, OIDC_AUTH_SECRET and
// AGENT_API_TOKEN once per install when the environment doesn't set them.

export type AuthConfig = {
  password?: string;
  sessionSecret?: string;
  agentToken?: string;
  oidc?: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    authSecret: string;
    /** The callback path or full URL registered at the provider. */
    redirectUri: string;
    scopes: string;
    /** The public URL the app is reached at, e.g. https://stars.example.com. */
    externalUrl?: string;
  };
};

const readEnv = (value: string | undefined): string | undefined =>
  value !== undefined && value.length > 0 ? value : undefined;

export function authConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const oidcOn = env.AUTH_ENABLED === "1";
  return {
    password: readEnv(env.AUTH_PASSWORD),
    sessionSecret: readEnv(env.SESSION_SECRET),
    agentToken: readEnv(env.AGENT_API_TOKEN),
    oidc: oidcOn
      ? {
          issuer: env.OIDC_ISSUER ?? "",
          clientId: env.OIDC_CLIENT_ID ?? "",
          clientSecret: env.OIDC_CLIENT_SECRET ?? "",
          authSecret: env.OIDC_AUTH_SECRET ?? "",
          redirectUri: readEnv(env.OIDC_REDIRECT_URI) ?? "/auth/callback",
          scopes: readEnv(env.OIDC_SCOPES) ?? "openid email profile",
          externalUrl: readEnv(env.OIDC_AUTH_EXTERNAL_URL),
        }
      : undefined,
  };
}

export const signInConfigured = (config: AuthConfig): boolean => config.password !== undefined || config.oidc !== undefined;

const COOKIE = "stars-session";
const SESSION_DAYS = 180;

const sameText = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const digest = (text: string) => createHash("sha256").update(text).digest("hex");

const isHttps = (c: Context) =>
  (c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(c.req.url).protocol.replace(":", "")) === "https";

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

const loginPage = (error: string | null) => `<!doctype html>
<html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0d1117"><title>Sign in · Stars Organizer</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100dvh; display:grid; place-items:center; background:#0d1117; color:#e6edf3; font:16px/1.5 system-ui, sans-serif; padding:16px; }
  form { width:100%; max-width:320px; display:grid; gap:12px; text-align:center; }
  h1 { font-size:22px; margin:0 0 8px; font-weight:600; }
  input { font:inherit; padding:12px 14px; border-radius:10px; border:1px solid #30363d; background:#161b22; color:inherit; }
  button { font:inherit; font-weight:600; padding:12px; border-radius:10px; border:0; background:#e3b341; color:#0d1117; cursor:pointer; }
  p { margin:0; color:#f85149; font-size:14px; }
</style></head>
<body><form method="post" action="/auth/login">
  <h1>Stars Organizer</h1>
  <input type="password" name="password" placeholder="Password" aria-label="Password" autocomplete="current-password" autofocus required>
  <button type="submit">Sign in</button>
  ${error ? `<p>${escapeHtml(error)}</p>` : ""}
</form></body></html>`;

export type Auth = {
  enabled: boolean;
  /** Adds /auth/* and /api/me, and guards /api/*. Register before the API routes. */
  register: (app: Hono) => void;
  /** Whether a page load may get the app, or should go to /auth/login first. */
  isSignedIn: (c: Context) => Promise<boolean>;
};

const passThrough: MiddlewareHandler = async (_c, next) => {
  await next();
};

export function createAuth(config: AuthConfig): Auth {
  const { password, sessionSecret = "", agentToken, oidc } = config;
  const enabled = signInConfigured(config);
  const passwordOnly = password !== undefined && oidc === undefined;

  const sign = (payload: string) => createHmac("sha256", sessionSecret).update(payload).digest("base64url");

  const hasPasswordSession = (c: Context): boolean => {
    if (password === undefined || sessionSecret.length === 0) return false;
    const [expiry, signature] = (getCookie(c, COOKIE) ?? "").split(".");
    if (!expiry || !signature) return false;
    return sameText(signature, sign(expiry)) && Number(expiry) > Date.now();
  };

  const hasAgentToken = (c: Context): boolean => {
    if (agentToken === undefined) return false;
    const [scheme, token] = (c.req.header("Authorization") ?? "").split(" ");
    return scheme === "Bearer" && token !== undefined && sameText(token, agentToken);
  };

  async function isSignedIn(c: Context): Promise<boolean> {
    if (!enabled) return true;
    if (hasAgentToken(c) || hasPasswordSession(c)) return true;
    if (oidc === undefined) return false;
    return (await getAuth(c)) !== null;
  }

  // The provider sees the public URL, and so must the library: behind a TLS-terminating
  // proxy the request arrives as http://, the callback's origin no longer matches
  // OIDC_REDIRECT_URI, and the sign-in loops. Rewrites the origin only.
  const externalOrigin = oidc?.externalUrl ? new URL(oidc.externalUrl).origin : undefined;
  const useExternalOrigin: MiddlewareHandler = async (c, next) => {
    const url = new URL(c.req.url);
    if (externalOrigin !== undefined && url.origin !== externalOrigin) {
      const external = new URL(externalOrigin);
      url.protocol = external.protocol;
      url.host = external.host;
      c.req.raw = new Request(url.toString(), c.req.raw);
    }
    await next();
  };

  // @hono/oidc-auth sets its state, nonce and PKCE cookies with no SameSite and on the
  // callback path only; across the redirect to the provider and back, browsers dropped
  // them and the callback looped. Lax and Path=/ make them plain first-party cookies.
  const laxOidcCookies: MiddlewareHandler = async (c, next) => {
    await next();
    const cookies = c.res.headers.getSetCookie();
    if (cookies.length === 0) return;
    c.res.headers.delete("set-cookie");
    for (const cookie of cookies) {
      const widened = cookie.replace(/;\s*Path=\/auth\/callback/i, "; Path=/");
      c.res.headers.append("set-cookie", /;\s*samesite=/i.test(widened) ? widened : `${widened}; SameSite=Lax`);
    }
  };

  function register(app: Hono) {
    if (oidc !== undefined) {
      app.use("*", useExternalOrigin, laxOidcCookies);
      app.use(
        "*",
        initOidcAuthMiddleware({
          OIDC_ISSUER: oidc.issuer,
          OIDC_CLIENT_ID: oidc.clientId,
          OIDC_CLIENT_SECRET: oidc.clientSecret,
          OIDC_AUTH_SECRET: oidc.authSecret,
          OIDC_REDIRECT_URI: oidc.redirectUri,
          OIDC_SCOPES: oidc.scopes,
          OIDC_AUTH_EXTERNAL_URL: oidc.externalUrl,
        }),
      );
    }

    // /api/* is always fetch from the app, so a missing session is a 401 the app turns
    // into a trip to /auth/login, never a redirect: Electric's long-poll would read the
    // login page as a shape. The health check stays open for container healthchecks.
    app.use("/api/*", async (c, next) => {
      if (c.req.path === "/api/health" || (await isSignedIn(c))) return next();
      return c.json({ error: "Sign in first." }, 401);
    });

    app.get("/api/me", async (c) => c.json({ authEnabled: enabled, signedIn: await isSignedIn(c) }));

    const callbackPath = oidc ? new URL(oidc.redirectUri, "http://placeholder").pathname : "/auth/callback";
    const oidcLogin = oidc ? oidcAuthMiddleware() : passThrough;

    app.get("/auth/login", async (c, next) => {
      if (!passwordOnly) return next();
      return hasPasswordSession(c) ? c.redirect("/") : c.html(loginPage(null));
    }, oidcLogin, (c) => c.redirect("/"));
    if (callbackPath !== "/auth/login") app.get(callbackPath, oidcLogin, (c) => c.redirect("/"));

    app.post("/auth/login", async (c) => {
      if (!passwordOnly) return c.redirect("/auth/login");
      const form = await c.req.parseBody();
      const given = typeof form.password === "string" ? form.password : "";
      if (!sameText(digest(given), digest(password))) {
        // A slow wrong answer makes guessing over the network impractical.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return c.html(loginPage("That password is wrong."), 401);
      }
      const expiry = String(Date.now() + SESSION_DAYS * 86_400_000);
      setCookie(c, COOKIE, `${expiry}.${sign(expiry)}`, {
        httpOnly: true,
        sameSite: "Lax",
        secure: isHttps(c),
        path: "/",
        maxAge: SESSION_DAYS * 86_400,
      });
      return c.redirect("/");
    });

    const logout = async (c: Context) => {
      if (oidc !== undefined) await revokeSession(c);
      deleteCookie(c, COOKIE, { path: "/" });
      return c.redirect(enabled ? "/auth/login" : "/");
    };
    app.get("/auth/logout", logout);
    app.post("/auth/logout", logout);
  }

  return { enabled, register, isSignedIn };
}
