import { describe, expect, it } from "vitest";
import { escapeHtml } from "../auth";
import { renderLogin } from "../login";

function fakeEnv(status: number, body = "") {
  const urls: string[] = [];
  const env = {
    ASSETS: {
      fetch: async (input: RequestInfo | URL) => {
        urls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        return new Response(body, { status });
      },
    },
  } as unknown as Env;
  return { env, urls };
}

const origin = "https://example.test";

describe("renderLogin", () => {
  it("uses the default page when no override exists, fetching the clean URL", async () => {
    const { env, urls } = fakeEnv(404);
    const res = await renderLogin(env, origin, { next: "/", error: false }, 200);
    expect(await res.text()).toContain('action="/__auth/login"');
    expect(urls).toEqual([`${origin}/__auth/login`]);
  });

  it("uses the override body when ASSETS returns 200", async () => {
    const { env } = fakeEnv(200, "<form>custom {{NEXT}} {{ERROR}}</form>");
    const res = await renderLogin(env, origin, { next: "/a", error: true }, 200);
    expect(await res.text()).toBe("<form>custom /a Incorrect password.</form>");
  });

  it("falls back to default on 307", async () => {
    const { env } = fakeEnv(307);
    const res = await renderLogin(env, origin, { next: "/", error: false }, 200);
    expect(await res.text()).toContain("Password required");
  });

  it("escapes next", async () => {
    const { env } = fakeEnv(404);
    const html = await (await renderLogin(env, origin, { next: '/x?a="1"&b', error: false }, 200)).text();
    expect(html).toContain("/x?a=&quot;1&quot;&amp;b");
  });

  it("substitutes every occurrence and the error text", async () => {
    const { env } = fakeEnv(200, "{{NEXT}}|{{NEXT}}|{{ERROR}}|{{ERROR}}");
    expect(await (await renderLogin(env, origin, { next: "/n", error: true }, 200)).text()).toBe(
      "/n|/n|Incorrect password.|Incorrect password.",
    );
    expect(await (await renderLogin(env, origin, { next: "/n", error: false }, 200)).text()).toBe("/n|/n||");
  });

  it("preserves status and sets headers", async () => {
    const { env } = fakeEnv(404);
    const res = await renderLogin(env, origin, { next: "/", error: true }, 401);
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  });

  it.each(["{{ERROR}}", "/{{ERROR}}", "$&", "$1$`"])("treats next %j as inert text", async (next) => {
    const { env } = fakeEnv(200, "[{{NEXT}}][{{ERROR}}]");
    const body = await (await renderLogin(env, origin, { next, error: true }, 200)).text();
    expect(body).toBe(`[${escapeHtml(next)}][Incorrect password.]`);
  });
});
