import { mkdtempSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generatedPasswordMessage, writeOwnerOnly } from "../lib/config.mjs";

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
