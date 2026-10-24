import { describe, expect, it } from "vitest";
import { signSession } from "../auth";
import worker from "../index";

const NOINDEX = "noindex, nofollow";
const PW = "s3cret";

function fakeAssets(): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname === "/__auth/login") return new Response("not found", { status: 404 });
      return new Response(`asset:${url.pathname}`, { status: 200 });
    },
  } as unknown as Fetcher;
}

function prodEnv(): Env {
  return { ASSETS: fakeAssets(), AUTH_MODE: "off" };
}

function stagingEnv(password = PW): Env {
  return { ASSETS: fakeAssets(), AUTH_MODE: "password", AUTH_SESSION_HOURS: "168", STAGING_PASSWORD: password };
}

function req(path: string, init?: RequestInit, origin = "http://localhost"): Request {
  return new Request(`${origin}${path}`, init);
}

function form(fields: Record<string, string>): RequestInit {
  const body = new URLSearchParams(fields);
  return {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  };
}

async function login(env: Env, origin = "http://localhost"): Promise<Response> {
  return worker.fetch(req("/__auth/login", form({ password: PW, next: "/docs" }), origin), env);
}

function cookieValue(setCookie: string | null): string {
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0];
}

describe("production (AUTH_MODE off)", () => {
  it("serves assets for /", async () => {
    const res = await worker.fetch(req("/"), prodEnv());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("asset:/");
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("hands non-navigation misses to ASSETS", async () => {
    const res = await worker.fetch(req("/nope"), prodEnv());
    expect(await res.text()).toBe("asset:/nope");
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("returns 404 for /__auth/login", async () => {
    const res = await worker.fetch(req("/__auth/login"), prodEnv());
    expect(res.status).toBe(404);
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("returns 404 for other /__auth/* even when ASSETS would serve them", async () => {
    const res = await worker.fetch(req("/__auth/logo.svg"), prodEnv());
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("asset:");
  });

  it("treats a missing AUTH_MODE as production", async () => {
    const res = await worker.fetch(req("/"), { ASSETS: fakeAssets() } as Env);
    expect(await res.text()).toBe("asset:/");
  });
});

describe("staging: missing password", () => {
  for (const path of ["/", "/robots.txt", "/__auth/login"]) {
    it(`returns 503 for ${path}`, async () => {
      const res = await worker.fetch(req(path), stagingEnv(""));
      expect(res.status).toBe(503);
      expect(await res.text()).toBe("Staging password not configured.");
      expect(res.headers.get("X-Robots-Tag")).toBe(NOINDEX);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });
  }

  it("returns 503 when STAGING_PASSWORD is absent", async () => {
    const env = { ASSETS: fakeAssets(), AUTH_MODE: "password" } as Env;
    const res = await worker.fetch(req("/"), env);
    expect(res.status).toBe(503);
  });
});

describe("staging: unauthenticated", () => {
  it("GET / responds 401 with the form", async () => {
    const res = await worker.fetch(req("/"), stagingEnv());
    expect(res.status).toBe(401);
    expect(await res.text()).toContain('action="/__auth/login"');
    expect(res.headers.get("X-Robots-Tag")).toBe(NOINDEX);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("HEAD /a?b=1 responds 401 and GET carries next", async () => {
    const head = await worker.fetch(req("/a?b=1", { method: "HEAD" }), stagingEnv());
    expect(head.status).toBe(401);
    expect(head.headers.get("X-Robots-Tag")).toBe(NOINDEX);
    const get = await worker.fetch(req("/a?b=1"), stagingEnv());
    expect(get.status).toBe(401);
    expect(await get.text()).toContain('value="/a?b=1"');
  });

  it("GET /__auth/login responds 200 with the form and sanitised next", async () => {
    const res = await worker.fetch(req("/__auth/login?next=//evil.com"), stagingEnv());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('value="/"');
    expect(res.headers.get("X-Robots-Tag")).toBe(NOINDEX);
  });
});

describe("staging: robots.txt", () => {
  it("returns the disallow body", async () => {
    const res = await worker.fetch(req("/robots.txt"), stagingEnv());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("User-agent: *\nDisallow: /\n");
    expect(res.headers.get("X-Robots-Tag")).toBe(NOINDEX);
  });
});

describe("staging: login POST", () => {
  it("wrong password responds 401 with the error", async () => {
    const res = await worker.fetch(req("/__auth/login", form({ password: "nope", next: "/docs" })), stagingEnv());
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Incorrect password.");
    expect(res.headers.get("X-Robots-Tag")).toBe(NOINDEX);
  });

  it("right password redirects 303 to next with a session cookie", async () => {
    const res = await login(stagingEnv());
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/docs");
    expect(res.headers.get("Set-Cookie")).toContain("site_auth=v1.");
    expect(res.headers.get("X-Robots-Tag")).toBe(NOINDEX);
  });

  it("rejects an open redirect in next", async () => {
    const res = await worker.fetch(req("/__auth/login", form({ password: PW, next: "//evil.com" })), stagingEnv());
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("a JSON body responds 401", async () => {
    const res = await worker.fetch(
      req("/__auth/login", {
        method: "POST",
        body: JSON.stringify({ password: PW }),
        headers: { "Content-Type": "application/json" },
      }),
      stagingEnv(),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("a form with no password field responds 401", async () => {
    const res = await worker.fetch(req("/__auth/login", form({ next: "/" })), stagingEnv());
    expect(res.status).toBe(401);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });
});

describe("staging: session cookie", () => {
  it("a cookie from a successful login serves assets", async () => {
    const env = stagingEnv();
    const cookie = cookieValue((await login(env)).headers.get("Set-Cookie"));
    const res = await worker.fetch(req("/docs", { headers: { Cookie: cookie } }), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("asset:/docs");
    expect(res.headers.get("X-Robots-Tag")).toBe(NOINDEX);
  });

  it("the same cookie is rejected after the password changes", async () => {
    const cookie = cookieValue((await login(stagingEnv())).headers.get("Set-Cookie"));
    const res = await worker.fetch(req("/docs", { headers: { Cookie: cookie } }), stagingEnv("rotated"));
    expect(res.status).toBe(401);
  });

  it("an expired token is rejected", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const token = await signSession(PW, past);
    const res = await worker.fetch(req("/docs", { headers: { Cookie: `site_auth=${token}` } }), stagingEnv());
    expect(res.status).toBe(401);
  });

  it("Max-Age follows AUTH_SESSION_HOURS", async () => {
    const env = { ...stagingEnv(), AUTH_SESSION_HOURS: "2" };
    const res = await login(env);
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=7200");
  });
});

describe("staging: Secure flag", () => {
  it("is absent over http://localhost", async () => {
    const res = await login(stagingEnv(), "http://localhost");
    expect(res.headers.get("Set-Cookie")).not.toContain("Secure");
  });

  it("is present over https", async () => {
    const res = await login(stagingEnv(), "https://x.workers.dev");
    expect(res.headers.get("Set-Cookie")).toContain("; Secure");
  });
});

describe("staging: public auth assets and logout", () => {
  it("serves /__auth/logo.svg without a session", async () => {
    const res = await worker.fetch(req("/__auth/logo.svg"), stagingEnv());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("asset:/__auth/logo.svg");
    expect(res.headers.get("X-Robots-Tag")).toBe(NOINDEX);
  });

  it("logout redirects 303 to / and clears the cookie", async () => {
    const res = await worker.fetch(req("/__auth/logout"), stagingEnv());
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/");
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(res.headers.get("X-Robots-Tag")).toBe(NOINDEX);
  });
});
