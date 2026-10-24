// Web-standard APIs only (no node: imports).
import {
  clearSessionCookie,
  COOKIE_NAME,
  passwordMatches,
  readCookie,
  safeNext,
  sessionCookie,
  signSession,
  verifySession,
} from "./auth";
import { renderLogin } from "./login";

const AUTH_PREFIX = "/__auth/";
const LOGIN_PATH = "/__auth/login";
const LOGOUT_PATH = "/__auth/logout";
const ROBOTS_BODY = "User-agent: *\nDisallow: /\n";
const DEFAULT_SESSION_HOURS = 168;

function withNoindex(response: Response): Response {
  // Copy so the headers are mutable (asset and redirect responses may be immutable).
  const copy = new Response(response.body, response);
  copy.headers.set("X-Robots-Tag", "noindex, nofollow");
  return copy;
}

function privateNoStore(response: Response): Response {
  // Staging content must never be cached by shared caches, whatever ASSETS set.
  const copy = new Response(response.body, response);
  copy.headers.set("Cache-Control", "private, no-store");
  return copy;
}

function plain(body: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

// A public /__auth/ path must be plain: no percent-encoding, backslashes, dot segments
// or empty segments, so it cannot be decoded or normalised into a path outside /__auth/.
function isPlainAuthAssetPath(pathname: string): boolean {
  return !/%|\\|\.\.|\/\//.test(pathname);
}

function redirect(location: string, setCookie: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Set-Cookie": setCookie, "Cache-Control": "no-store" },
  });
}

async function readLoginForm(request: Request): Promise<{ password: string | null; next: string | null }> {
  try {
    const data = await request.formData();
    const password = data.get("password");
    const next = data.get("next");
    return {
      password: typeof password === "string" ? password : null,
      next: typeof next === "string" ? next : null,
    };
  } catch {
    return { password: null, next: null };
  }
}

async function handleStaging(request: Request, env: Env, password: string): Promise<Response> {
  const url = new URL(request.url);
  const { pathname, origin } = url;
  const secure = url.protocol === "https:";

  if (pathname === "/robots.txt") {
    return plain(ROBOTS_BODY, 200, { "Cache-Control": "private, no-store" });
  }

  if (pathname === LOGIN_PATH && (request.method === "GET" || request.method === "HEAD")) {
    return renderLogin(env, origin, { next: safeNext(url.searchParams.get("next")), error: false }, 200);
  }

  if (pathname === LOGIN_PATH && request.method === "POST") {
    const form = await readLoginForm(request);
    const next = safeNext(form.next);
    if (form.password !== null && (await passwordMatches(form.password, password))) {
      const hours = Number(env.AUTH_SESSION_HOURS) || DEFAULT_SESSION_HOURS;
      const maxAge = Math.floor(hours * 3600);
      const token = await signSession(password, Math.floor(Date.now() / 1000) + maxAge);
      return redirect(next, sessionCookie(token, maxAge, secure));
    }
    return renderLogin(env, origin, { next, error: true }, 401);
  }

  if (pathname === LOGIN_PATH) {
    return plain("Method not allowed.", 405, { Allow: "GET, POST" });
  }

  if (pathname === LOGOUT_PATH) {
    if (request.method === "GET") return redirect("/", clearSessionCookie(secure));
    return plain("Method not allowed.", 405, { Allow: "GET" });
  }

  // Other plain /__auth/* files (override CSS, logo, ...) are public so the login page can load them.
  if (pathname.startsWith(AUTH_PREFIX) && isPlainAuthAssetPath(pathname)) {
    return privateNoStore(await env.ASSETS.fetch(request));
  }

  const token = readCookie(request.headers.get("Cookie"), COOKIE_NAME);
  if (await verifySession(password, token, Math.floor(Date.now() / 1000))) {
    return privateNoStore(await env.ASSETS.fetch(request));
  }

  return renderLogin(env, origin, { next: pathname + url.search, error: false }, 401);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.AUTH_MODE !== "password") {
      // Production: the Worker only runs for /__auth/* and non-navigation asset misses.
      if (new URL(request.url).pathname.startsWith(AUTH_PREFIX)) {
        return new Response("Not found", { status: 404 });
      }
      return env.ASSETS.fetch(request);
    }

    const password = env.STAGING_PASSWORD;
    if (!password) {
      return withNoindex(plain("Staging password not configured.", 503));
    }

    try {
      return withNoindex(await handleStaging(request, env, password));
    } catch {
      // Never fall back to content and never echo the error.
      return withNoindex(plain("Internal error.", 500));
    }
  },
};
