import { describe, expect, it, vi } from "vitest";
import { preflight } from "../preflight.mjs";

function makeDeps(over = {}) {
  const calls = [];
  const deps = {
    readWrangler: () => ({ name: "acme", account_id: "abc" }),
    nodeVersion: "26.12.0",
    envVars: {},
    run: vi.fn(async (cmd, args) => {
      calls.push(args.join(" "));
      if (args.includes("whoami")) return { code: 0, stdout: '{"loggedIn":true}', stderr: "" };
      if (args.includes("secret"))
        return { code: 0, stdout: '[{"name":"STAGING_PASSWORD","type":"secret_text"}]', stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    }),
    ...over,
  };
  return { deps, calls };
}

describe("preflight", () => {
  it("returns [] when everything is good", async () => {
    const { deps } = makeDeps();
    expect(await preflight("staging", deps)).toEqual([]);
    expect(await preflight("production", deps)).toEqual([]);
  });

  it("flags an unrenamed template", async () => {
    const { deps } = makeDeps({
      readWrangler: () => ({ name: "cloudflare-website-template", account_id: "abc" }),
    });
    const msgs = await preflight("production", deps);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("npm run setup");
  });

  it("flags a missing account_id", async () => {
    const { deps } = makeDeps({ readWrangler: () => ({ name: "acme" }) });
    const msgs = await preflight("production", deps);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("account_id");
  });

  it("flags unauthenticated (non-zero exit)", async () => {
    const { deps } = makeDeps({
      run: vi.fn(async () => ({ code: 1, stdout: '{"loggedIn":false}', stderr: "" })),
    });
    const msgs = await preflight("production", deps);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("wrangler login");
  });

  it("flags unauthenticated (loggedIn false with exit 0)", async () => {
    const { deps } = makeDeps({
      run: vi.fn(async () => ({ code: 0, stdout: '{"loggedIn":false}', stderr: "" })),
    });
    expect(await preflight("production", deps)).toHaveLength(1);
  });

  it("treats CLOUDFLARE_API_TOKEN as authenticated and skips whoami", async () => {
    const { deps, calls } = makeDeps({ envVars: { CLOUDFLARE_API_TOKEN: "t" } });
    expect(await preflight("production", deps)).toEqual([]);
    expect(calls.some((c) => c.includes("whoami"))).toBe(false);
  });

  it("staging: flags a missing STAGING_PASSWORD", async () => {
    const { deps } = makeDeps({
      run: vi.fn(async (cmd, args) =>
        args.includes("whoami")
          ? { code: 0, stdout: '{"loggedIn":true}', stderr: "" }
          : { code: 0, stdout: "[]", stderr: "" },
      ),
    });
    const msgs = await preflight("staging", deps);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("STAGING_PASSWORD");
  });

  it("staging: a not-found Worker points at setup", async () => {
    const { deps } = makeDeps({
      run: vi.fn(async (cmd, args) =>
        args.includes("whoami")
          ? { code: 0, stdout: '{"loggedIn":true}', stderr: "" }
          : { code: 1, stdout: "", stderr: 'Worker "acme-staging" not found.' },
      ),
    });
    const msgs = await preflight("staging", deps);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("npm run setup");
    expect(msgs[0]).toContain("creates the staging Worker");
  });

  it("production never calls secret list", async () => {
    const { deps, calls } = makeDeps();
    await preflight("production", deps);
    expect(calls.some((c) => c.includes("secret"))).toBe(false);
  });

  it("flags an old Node", async () => {
    const { deps } = makeDeps({ nodeVersion: "24.1.0" });
    const msgs = await preflight("production", deps);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("Node");
  });
});
