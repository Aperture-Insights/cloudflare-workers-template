import { describe, expect, it, vi } from "vitest";
import { preflight } from "../preflight.mjs";

function goodConfig(over = {}) {
  return {
    name: "acme",
    account_id: "abc",
    env: {
      staging: {
        assets: { run_worker_first: true },
        vars: { AUTH_MODE: "password", AUTH_SESSION_HOURS: "168" },
        secrets: { required: ["STAGING_PASSWORD"] },
      },
      production: {
        assets: { run_worker_first: ["/__auth/*"] },
        vars: { AUTH_MODE: "off" },
      },
    },
    ...over,
  };
}

function makeDeps(over = {}) {
  const calls = [];
  const deps = {
    readWrangler: () => goodConfig(),
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
      readWrangler: () => goodConfig({ name: "cloudflare-website-template" }),
    });
    const msgs = await preflight("production", deps);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("npm run setup");
  });

  it("flags a missing account_id", async () => {
    const { deps } = makeDeps({ readWrangler: () => goodConfig({ account_id: undefined }) });
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

describe("preflight: secret list edge cases", () => {
  function secretRun(result) {
    return vi.fn(async (cmd, args) =>
      args.includes("whoami") ? { code: 0, stdout: '{"loggedIn":true}', stderr: "" } : result,
    );
  }

  it("a generic 'not found' error is not reported as a missing Worker", async () => {
    const { deps } = makeDeps({
      run: secretRun({ code: 1, stdout: "", stderr: "A request to the Cloudflare API failed. Not found [code: 10007]" }),
    });
    const msgs = await preflight("staging", deps);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).not.toContain("does not exist");
    expect(msgs[0]).toContain("Could not list staging secrets");
  });

  it("matches 'Worker \"...\" not found' case-insensitively", async () => {
    const { deps } = makeDeps({
      run: secretRun({ code: 1, stdout: "", stderr: 'worker "acme-staging" NOT FOUND' }),
    });
    const msgs = await preflight("staging", deps);
    expect(msgs[0]).toContain("does not exist");
  });

  it("unparseable secret list stdout gets its own message", async () => {
    const { deps } = makeDeps({ run: secretRun({ code: 0, stdout: "not json", stderr: "" }) });
    const msgs = await preflight("staging", deps);
    expect(msgs).toEqual([
      'Could not read the staging secret list from wrangler; run "npx wrangler secret list --env staging" to check.',
    ]);
  });

  it("non-array JSON stdout gets the same message", async () => {
    const { deps } = makeDeps({ run: secretRun({ code: 0, stdout: '{"a":1}', stderr: "" }) });
    const msgs = await preflight("staging", deps);
    expect(msgs[0]).toContain("Could not read the staging secret list");
  });
});

describe("preflight: wrangler.jsonc auth config", () => {
  /** @param {(c: any) => void} mutate */
  function withConfig(mutate) {
    const config = goodConfig();
    mutate(config);
    return makeDeps({ readWrangler: () => config }).deps;
  }

  it("the template's own wrangler.jsonc env blocks pass", async () => {
    const { readWrangler } = await import("../lib/config.mjs");
    const real = readWrangler();
    const { deps } = makeDeps({ readWrangler: () => ({ ...real, name: "acme", account_id: "abc" }) });
    expect(await preflight("staging", deps)).toEqual([]);
    expect(await preflight("production", deps)).toEqual([]);
  });

  it("staging: flags a missing AUTH_MODE (vars replaced)", async () => {
    const deps = withConfig((c) => {
      c.env.staging.vars = { MY_VAR: "x" };
    });
    const msgs = await preflight("staging", deps);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('env.staging.vars.AUTH_MODE must be "password"');
  });

  it("staging: flags run_worker_first not true", async () => {
    const deps = withConfig((c) => {
      c.env.staging.assets.run_worker_first = ["/__auth/*"];
    });
    const msgs = await preflight("staging", deps);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("env.staging.assets.run_worker_first must be true");
  });

  it("staging: flags STAGING_PASSWORD missing from secrets.required", async () => {
    const deps = withConfig((c) => {
      delete c.env.staging.secrets;
    });
    const msgs = await preflight("staging", deps);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("env.staging.secrets.required");
  });

  it("staging: a missing env.staging block reports all three", async () => {
    const deps = withConfig((c) => {
      delete c.env.staging;
    });
    expect(await preflight("staging", deps)).toHaveLength(3);
  });

  it("production: flags AUTH_MODE not \"off\"", async () => {
    const deps = withConfig((c) => {
      c.env.production.vars = { AUTH_MODE: "Off" };
    });
    const msgs = await preflight("production", deps);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('env.production.vars.AUTH_MODE must be "off"');
  });

  it("production: flags run_worker_first without /__auth/*", async () => {
    for (const value of [undefined, true, ["/api/*"]]) {
      const deps = withConfig((c) => {
        c.env.production.assets.run_worker_first = value;
      });
      const msgs = await preflight("production", deps);
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('env.production.assets.run_worker_first must be an array that includes "/__auth/*"');
    }
  });

  it("only checks the environment being published", async () => {
    const deps = withConfig((c) => {
      c.env.production.vars = {};
    });
    expect(await preflight("staging", deps)).toEqual([]);
  });
});
