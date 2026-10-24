import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import {
  TEMPLATE_SLUG,
  generatePassword,
  generatedPasswordMessage,
  getEnvValue,
  getSiteTitle,
  isValidSlug,
  parseJsonc,
  setJsoncString,
  setSiteTitle,
  writeOwnerOnly,
} from "./lib/config.mjs";
import { run } from "./lib/run.mjs";

const rl = createInterface({ input: process.stdin, output: process.stdout });

/** @param {string} q @param {string} [def] */
async function ask(q, def) {
  const a = (await rl.question(def ? `${q} [${def}] ` : `${q} `)).trim();
  return a || def || "";
}

/** @param {string} q @param {boolean} [def] */
async function confirm(q, def = true) {
  const a = (await rl.question(`${q} (${def ? "Y/n" : "y/N"}) `)).trim().toLowerCase();
  return a ? a === "y" || a === "yes" : def;
}

/** @param {string} slug */
const titleCase = (slug) =>
  slug.split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/** @returns {Promise<{ loggedIn: boolean, accounts: { id: string, name: string }[] }>} */
async function whoami() {
  try {
    const r = await run("npx", ["wrangler", "whoami", "--json"], { capture: true });
    if (r.code !== 0) return { loggedIn: false, accounts: [] };
    const j = JSON.parse(r.stdout);
    const accounts = Array.isArray(j.accounts)
      ? j.accounts.filter((/** @type {any} */ a) => a && typeof a.id === "string")
      : [];
    return { loggedIn: j.loggedIn !== false, accounts };
  } catch {
    return { loggedIn: false, accounts: [] };
  }
}

const ID_RE = /^[0-9a-f]{32}$/;
const readText = (/** @type {string} */ f) => readFileSync(f, "utf8");

try {
  let wrangler = readText("wrangler.jsonc");
  const current = parseJsonc(wrangler).name;

  // 1. Slug
  let slug = "";
  const slugDefault = current !== TEMPLATE_SLUG ? current : undefined;
  for (;;) {
    slug = await ask("Project slug (lowercase letters, digits, hyphens; max 52):", slugDefault);
    if (!isValidSlug(slug)) console.log("  Invalid slug.");
    else if (slug === TEMPLATE_SLUG) console.log("  Choose a name other than the template's.");
    else break;
  }
  wrangler = setJsoncString(wrangler, "name", slug);

  // 2. Site title (existing title is the default; files are written after all prompts)
  /** @type {string | undefined} */
  let siteConfig;
  if (existsSync("src/site.config.ts")) {
    const src = readText("src/site.config.ts");
    const title = await ask("Site title:", getSiteTitle(src) ?? titleCase(slug));
    siteConfig = setSiteTitle(src, title);
    if (getSiteTitle(src) === undefined) {
      console.log("  Warning: no `title: \"...\"` line found in src/site.config.ts; title not changed.");
      siteConfig = undefined;
    }
  } else {
    console.log("Site title: skipped (no src/site.config.ts)");
  }

  // 3. Login
  let who = await whoami();
  if (!who.loggedIn) {
    console.log("Not logged in to Cloudflare.");
    if (await confirm("Run `wrangler login` now?")) {
      await run("npx", ["wrangler", "login"]);
      who = await whoami();
    }
  }

  // 4. Account ID
  const existingId = parseJsonc(wrangler).account_id;
  /** @type {string} */
  let accountId = "";
  if (typeof existingId === "string" && ID_RE.test(existingId)) {
    if (await confirm(`Keep existing account_id ${existingId}?`)) accountId = existingId;
  }
  if (!accountId && who.accounts.length === 1) {
    const a = who.accounts[0];
    if (await confirm(`Use Cloudflare account "${a.name ?? a.id}" (${a.id})?`)) accountId = a.id;
  } else if (!accountId && who.accounts.length > 1) {
    who.accounts.forEach((a, i) => console.log(`  ${i + 1}) ${a.name ?? a.id} (${a.id})`));
    for (;;) {
      const n = parseInt(await ask("Pick an account number (blank to enter an ID manually):"), 10);
      if (Number.isNaN(n)) break;
      if (n >= 1 && n <= who.accounts.length) {
        accountId = who.accounts[n - 1].id;
        break;
      }
      console.log("  Not a valid choice.");
    }
  }
  while (!accountId) {
    const entered = (await ask("Cloudflare account ID (32 hex characters):", typeof existingId === "string" && ID_RE.test(existingId) ? existingId : undefined)).toLowerCase();
    if (ID_RE.test(entered)) accountId = entered;
    else console.log("  Must be 32 lowercase hex characters.");
  }
  wrangler = setJsoncString(wrangler, "account_id", accountId);

  // 5. Staging password
  const existingPw = existsSync(".dev.vars.staging")
    ? getEnvValue(readText(".dev.vars.staging"), "STAGING_PASSWORD")
    : undefined;
  let password = "";
  let generated = false;
  if (existingPw && (await confirm("Keep the existing staging password from .dev.vars.staging?"))) {
    password = existingPw;
  } else {
    const typed = (await ask("Staging password (Enter to generate one):")).trim();
    generated = !typed;
    password = typed || generatePassword();
  }
  const upload = await confirm(
    "Upload it to Cloudflare after saving (wrangler secret put STAGING_PASSWORD --env staging)?",
  );

  // All prompts done: write everything in one place.
  const pkg = JSON.parse(readText("package.json"));
  pkg.name = slug;
  writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
  writeFileSync("wrangler.jsonc", wrangler);
  if (siteConfig !== undefined) writeFileSync("src/site.config.ts", siteConfig);
  writeOwnerOnly(".dev.vars.staging", `STAGING_PASSWORD=${password}\n`);
  console.log("Wrote .dev.vars.staging (git-ignored, owner-read-only).");
  if (generated) {
    for (const line of generatedPasswordMessage(password, process.stdout.isTTY)) console.log(line);
  }
  let uploaded = false;
  if (upload) {
    const r = await run("npx", ["wrangler", "secret", "put", "STAGING_PASSWORD", "--env", "staging"], {
      input: password,
    });
    uploaded = r.code === 0;
    if (!uploaded) console.log("Upload failed.");
  }
  if (!uploaded) {
    console.log("Staging can't be published until the password is uploaded. Re-run npm run setup.");
  }

  // 6. Summary
  console.log(`\nSetup complete for "${slug}".\nNext:`);
  console.log("  npm run dev                 # local development");
  console.log("  npm run preview:staging     # local staging with the password gate");
  console.log("  npm run publish:staging     # deploy staging");
  console.log("  npm run publish:production  # deploy production");
} finally {
  rl.close();
}
