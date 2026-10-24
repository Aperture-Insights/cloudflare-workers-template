import { describe, expect, it } from "vitest";
import {
  clearSessionCookie,
  escapeHtml,
  passwordMatches,
  readCookie,
  safeNext,
  sessionCookie,
  signSession,
  verifySession,
} from "../auth";

describe("signSession / verifySession", () => {
  it("round trips", async () => {
    const t = await signSession("pw", 2000);
    expect(await verifySession("pw", t, 1000)).toBe(true);
  });
  it("rejects expired tokens", async () => {
    const t = await signSession("pw", 2000);
    expect(await verifySession("pw", t, 2001)).toBe(false);
  });
  it("rejects a token signed with another password", async () => {
    const t = await signSession("old", 2000);
    expect(await verifySession("new", t, 1000)).toBe(false);
  });
  it("rejects a flipped signature character", async () => {
    const t = await signSession("pw", 2000);
    const last = t.slice(-1);
    const bad = t.slice(0, -1) + (last === "A" ? "B" : "A");
    expect(await verifySession("pw", bad, 1000)).toBe(false);
  });
  it.each([null, "", "v2.1.x", "v1.notanumber.sig"])("rejects malformed %j", async (t) => {
    expect(await verifySession("pw", t, 1000)).toBe(false);
  });
});

describe("passwordMatches", () => {
  it("matches exactly, without trimming", async () => {
    expect(await passwordMatches("  pä ss=word ", "  pä ss=word ")).toBe(true);
  });
  it("does not match a trimmed input", async () => {
    expect(await passwordMatches("pä ss=word", "  pä ss=word ")).toBe(false);
  });
  it("rejects empty input", async () => {
    expect(await passwordMatches("", "x")).toBe(false);
  });
});

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/a?b=1")).toBe("/a?b=1");
  });
  it.each(["//evil.com", "https://evil.com", "/\\evil", "evil", "", null])(
    "falls back to / for %j",
    (v) => {
      expect(safeNext(v)).toBe("/");
    },
  );
});

describe("readCookie", () => {
  it("reads the exact name", () => {
    expect(readCookie("site_auth_old=x; site_auth=y; other=z", "site_auth")).toBe("y");
  });
  it("returns null when absent", () => {
    expect(readCookie("a=b", "site_auth")).toBeNull();
    expect(readCookie(null, "site_auth")).toBeNull();
  });
});

describe("cookies", () => {
  it("builds a secure session cookie", () => {
    const c = sessionCookie("t", 604800, true);
    for (const p of ["site_auth=t", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=604800", "Secure"]) {
      expect(c).toContain(p);
    }
  });
  it("omits Secure when not secure", () => {
    expect(sessionCookie("t", 604800, false)).not.toContain("Secure");
  });
  it("clears the cookie", () => {
    expect(clearSessionCookie(true)).toContain("Max-Age=0");
  });
});

describe("escapeHtml", () => {
  it("escapes special characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});
