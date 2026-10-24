import { mkdtempSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  SHORT_PASSWORD_WARNING,
  generatedPasswordMessage,
  isShortPassword,
  renamePackageLock,
  writeOwnerOnly,
} from "../lib/config.mjs";

describe("writeOwnerOnly", () => {
  it("tightens a pre-existing world-readable file to 0600", () => {
    const f = join(mkdtempSync(join(tmpdir(), "cwt-")), ".dev.vars.staging");
    writeFileSync(f, "old\n", { mode: 0o644 });
    writeOwnerOnly(f, "STAGING_PASSWORD=x\n");
    expect(statSync(f).mode & 0o777).toBe(0o600);
    expect(readFileSync(f, "utf8")).toBe("STAGING_PASSWORD=x\n");
  });

  it("creates a new file as 0600", () => {
    const f = join(mkdtempSync(join(tmpdir(), "cwt-")), ".dev.vars.staging");
    writeOwnerOnly(f, "x\n");
    expect(statSync(f).mode & 0o777).toBe(0o600);
  });
});

describe("generatedPasswordMessage", () => {
  it("shows the password on a TTY", () => {
    expect(generatedPasswordMessage("pw-123", true).join("\n")).toContain("pw-123");
  });

  it("never shows the password when not a TTY", () => {
    for (const isTTY of [false, undefined]) {
      const lines = generatedPasswordMessage("pw-123", isTTY);
      expect(lines.join("\n")).not.toContain("pw-123");
      expect(lines).toEqual([
        "Generated a staging password and saved it to .dev.vars.staging (owner-read-only).",
      ]);
    }
  });
});

describe("renamePackageLock", () => {
  it("renames the top-level name and packages[\"\"].name, leaving the rest alone", () => {
    const lock = {
      name: "cloudflare-website-template",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": { name: "cloudflare-website-template", devDependencies: { astro: "7.4.2" } },
        "node_modules/astro": { name: "astro", version: "7.4.2" },
      },
    };
    const out = JSON.parse(renamePackageLock(JSON.stringify(lock, null, 2) + "\n", "acme"));
    expect(out.name).toBe("acme");
    expect(out.packages[""].name).toBe("acme");
    expect(out.packages["node_modules/astro"].name).toBe("astro");
    expect(out.lockfileVersion).toBe(3);
    expect(out.packages[""].devDependencies).toEqual({ astro: "7.4.2" });
  });

  it("keeps 2-space formatting and a trailing newline", () => {
    const text = renamePackageLock('{\n  "name": "x",\n  "packages": {\n    "": {\n      "name": "x"\n    }\n  }\n}\n', "acme");
    expect(text).toBe('{\n  "name": "acme",\n  "packages": {\n    "": {\n      "name": "acme"\n    }\n  }\n}\n');
  });

  it("tolerates a lockfile without packages[\"\"]", () => {
    const out = JSON.parse(renamePackageLock('{"name":"x"}', "acme"));
    expect(out).toEqual({ name: "acme" });
  });
});

describe("isShortPassword", () => {
  it("flags passwords under 16 characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(16);
    expect(isShortPassword("a".repeat(15))).toBe(true);
    expect(isShortPassword("short")).toBe(true);
  });

  it("accepts 16 or more characters", () => {
    expect(isShortPassword("a".repeat(16))).toBe(false);
    expect(isShortPassword("correct horse battery staple")).toBe(false);
  });

  it("counts characters, not UTF-16 code units", () => {
    expect(isShortPassword("😀".repeat(8))).toBe(true);
  });

  it("has the exact warning text", () => {
    expect(SHORT_PASSWORD_WARNING).toBe(
      "Passwords shorter than 16 characters can be guessed from a leaked session cookie. Use the generated one or a longer passphrase.",
    );
  });
});
