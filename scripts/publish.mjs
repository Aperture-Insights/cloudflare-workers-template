import { createInterface } from "node:readline/promises";
import { readWrangler } from "./lib/config.mjs";
import { run } from "./lib/run.mjs";
import { preflight } from "./preflight.mjs";

const [env, ...flags] = process.argv.slice(2);
if (env !== "staging" && env !== "production") {
  console.error("Usage: node scripts/publish.mjs <staging|production> [--yes]");
  process.exit(1);
}

const problems = await preflight(env);
if (problems.length) {
  console.error(`Preflight failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}

if (env === "production" && !flags.includes("--yes") && !process.env.CI) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Deploy ${readWrangler().name} to PRODUCTION? (y/N) `);
  rl.close();
  if (!["y", "yes"].includes(answer.trim().toLowerCase())) {
    console.log("Aborted.");
    process.exit(1);
  }
}

const build = await run("npm", ["run", "build"]);
if (build.code !== 0) process.exit(build.code);

const deploy = await run("npx", ["wrangler", "deploy", "--env", env]);
process.exit(deploy.code);
