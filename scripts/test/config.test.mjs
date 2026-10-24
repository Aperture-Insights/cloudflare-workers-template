import { describe, expect, it } from "vitest";
import {
  TEMPLATE_SLUG,
  generatePassword,
  getEnvValue,
  getSiteTitle,
  setSiteTitle,
  isValidSlug,
  meetsNodeFloor,
  parseJsonc,
  setJsoncString,
} from "../lib/config.mjs";

describe("isValidSlug", () => {
  it("accepts valid slugs", () => {
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("acme-site")).toBe(true);
    expect(isValidSlug("a".repeat(52))).toBe(true);
  });
  it("rejects invalid slugs", () => {
    for (const s of ["A-site", "-site", "site-", "site_x", "a".repeat(53), ""]) {
      expect(isValidSlug(s)).toBe(false);
    }
  });
  it("exposes the template slug", () => {
    expect(TEMPLATE_SLUG).toBe("cloudflare-website-template");
  });
});

describe("parseJsonc", () => {
  it("handles comments, strings with // and trailing commas", () => {
    const text = `{
      // line
      "a": 1, /* block */
      "url": "https://x",
      "list": [1, 2,],
    }`;
    expect(parseJsonc(text)).toEqual({ a: 1, url: "https://x", list: [1, 2] });
  });
});

describe("setJsoncString", () => {
  const text = `{\n  // keep me\n  "name": "old", /* c */\n  "url": "https://x"\n}\n`;
  it("replaces an existing key and preserves the rest", () => {
    const out = setJsoncString(text, "name", "new");
    expect(out).toBe(text.replace('"old"', '"new"'));
  });
  it("inserts a missing key after name with matching indentation", () => {
    const out = setJsoncString(text, "account_id", "abc123");
    expect(out).toBe(
      `{\n  // keep me\n  "name": "old", /* c */\n  "account_id": "abc123",\n  "url": "https://x"\n}\n`,
    );
    expect(parseJsonc(out).account_id).toBe("abc123");
  });
});

describe("meetsNodeFloor", () => {
  it("compares versions", () => {
    expect(meetsNodeFloor("26.0.0")).toBe(true);
    expect(meetsNodeFloor("v26.12.1")).toBe(true);
    expect(meetsNodeFloor("25.9.0")).toBe(false);
    expect(meetsNodeFloor("24.22.1")).toBe(false);
  });
});

describe("generatePassword", () => {
  it("is 24 url-safe characters and random", () => {
    const a = generatePassword();
    expect(a).toHaveLength(24);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generatePassword()).not.toBe(a);
  });
});

describe("setSiteTitle", () => {
  it("replaces the title line with an escaped string", () => {
    const out = setSiteTitle('export const SITE = {\n  title: "Old",\n  description: "d",\n};', 'Acme "Co"');
    expect(out).toContain('  title: "Acme \\"Co\\"",');
    expect(out).toContain('description: "d"');
    expect(out).not.toContain("Old");
  });
});

describe("getSiteTitle", () => {
  it("reads the current title, round-tripping setSiteTitle", () => {
    const src = setSiteTitle('export const SITE = {\n  title: "Old",\n};', 'Acme "Co"');
    expect(getSiteTitle(src)).toBe('Acme "Co"');
  });
  it("returns undefined when there is no title line", () => {
    expect(getSiteTitle("export const SITE = {};")).toBeUndefined();
  });
  it("setSiteTitle leaves text unchanged on no match", () => {
    const src = "export const SITE = {};";
    expect(setSiteTitle(src, "X")).toBe(src);
  });
});

describe("getEnvValue", () => {
  it("reads a key's value", () => {
    expect(getEnvValue("A=1\nSTAGING_PASSWORD=abc_-9\n", "STAGING_PASSWORD")).toBe("abc_-9");
  });
  it("returns undefined when missing or empty", () => {
    expect(getEnvValue("A=1\n", "STAGING_PASSWORD")).toBeUndefined();
    expect(getEnvValue("STAGING_PASSWORD=\n", "STAGING_PASSWORD")).toBeUndefined();
  });
});
