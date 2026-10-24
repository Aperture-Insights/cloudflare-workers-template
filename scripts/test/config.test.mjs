import { describe, expect, it } from "vitest";
import {
  TEMPLATE_SLUG,
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
