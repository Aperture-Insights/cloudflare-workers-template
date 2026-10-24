import { fileURLToPath } from "node:url";
import { TEMPLATE_SLUG, meetsNodeFloor, readWrangler } from "./lib/config.mjs";
import { run } from "./lib/run.mjs";

/**
 * @typedef {{ code: number, stdout: string, stderr?: string }} RunResult
 * @typedef {{
 *   readWrangler: () => any,
 *   run: (cmd: string, args: string[], opts?: { input?: string, capture?: boolean }) => Promise<RunResult>,
 *   nodeVersion: string,
 *   envVars: Record<string, string | undefined>,
 * }} Deps
 */

/** @type {Deps} */
const realDeps = {
  readWrangler: () => readWrangler(),
  run,
  nodeVersion: process.versions.node,
  envVars: process.env,
};

/**
 * @param {"staging" | "production"} env
 * @param {Deps} [deps]
 * @returns {Promise<string[]>}
 */
export async function preflight(env, deps = realDeps) {
  /** @type {string[]} */
  const problems = [];

  if (!meetsNodeFloor(deps.nodeVersion)) {
    problems.push(`Node ${deps.nodeVersion} is too old: this template needs Node 26 or newer. Run \`nvm use\`.`);
  }

  const config = deps.readWrangler();
  if (config.name === TEMPLATE_SLUG) {
    problems.push(`The project is not renamed (still "${TEMPLATE_SLUG}"). Run \`npm run setup\` first.`);
  }
  if (!config.account_id) {
    problems.push("wrangler.jsonc has no account_id. Run `npm run setup` to set it.");
  }

  if (!deps.envVars.CLOUDFLARE_API_TOKEN) {
    const who = await deps.run("npx", ["wrangler", "whoami", "--json"], { capture: true });
    let loggedIn = who.code === 0;
    if (loggedIn) {
      try {
        loggedIn = JSON.parse(who.stdout).loggedIn !== false;
      } catch {
        loggedIn = true;
      }
    }
    if (!loggedIn) {
      problems.push("Not logged in to Cloudflare. Run `npx wrangler login`, or set CLOUDFLARE_API_TOKEN.");
    }
  }

  if (env === "staging") {
    const res = await deps.run("npx", ["wrangler", "secret", "list", "--env", "staging"], { capture: true });
    if (res.code !== 0) {
      if (/Worker ".*" not found/i.test(`${res.stdout}\n${res.stderr ?? ""}`)) {
        problems.push(
          "The staging Worker does not exist yet. Run `npm run setup`, which creates the staging Worker and sets STAGING_PASSWORD.",
        );
      } else {
        problems.push(
          `Could not list staging secrets (wrangler exited ${res.code}). ${(res.stderr ?? "").trim()}`.trim(),
        );
      }
    } else {
      /** @type {string[] | null} */
      let names = null;
      try {
        const list = JSON.parse(res.stdout);
        if (Array.isArray(list)) names = list.map((/** @type {{ name?: unknown }} */ s) => String(s?.name));
      } catch {
        // handled below
      }
      if (names === null) {
        problems.push(
          'Could not read the staging secret list from wrangler; run "npx wrangler secret list --env staging" to check.',
        );
      } else if (!names.includes("STAGING_PASSWORD")) {
        problems.push("STAGING_PASSWORD is not set on the staging Worker. Run `npm run setup` or `npx wrangler secret put STAGING_PASSWORD --env staging`.");
      }
    }
  }

  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.argv[2];
  if (env !== "staging" && env !== "production") {
    console.error("Usage: node scripts/preflight.mjs <staging|production>");
    process.exit(1);
  }
  const problems = await preflight(env);
  if (problems.length) {
    console.error(`Preflight failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log("Preflight OK.");
}
