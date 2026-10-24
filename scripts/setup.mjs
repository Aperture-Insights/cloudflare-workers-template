import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import {
  TEMPLATE_SLUG,
  generatePassword,
  isValidSlug,
  parseJsonc,
  setJsoncString,
  setSiteTitle,
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
  const pkg = JSON.parse(readText("package.json"));
  pkg.name = slug;
  writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

  // 2. Site title
  if (existsSync("src/site.config.ts")) {
    const title = await ask("Site title:", titleCase(slug));
    writeFileSync("src/site.config.ts", setSiteTitle(readText("src/site.config.ts"), title));
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
  /** @type {string} */
  let accountId = "";
  if (who.accounts.length === 1) {
    const a = who.accounts[0];
    if (await confirm(`Use Cloudflare account "${a.name ?? a.id}" (${a.id})?`)) accountId = a.id;
  } else if (who.accounts.length > 1) {
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
    const entered = (await ask("Cloudflare account ID (32 hex characters):")).toLowerCase();
    if (ID_RE.test(entered)) accountId = entered;
    else console.log("  Must be 32 lowercase hex characters.");
  }
  wrangler = setJsoncString(wrangler, "account_id", accountId);
  writeFileSync("wrangler.jsonc", wrangler);

  // 5. Staging password
  const typed = (await ask("Staging password (Enter to generate one):")).trim();
  const generated = !typed;
  const password = typed || generatePassword();
  writeFileSync(".dev.vars.staging", `STAGING_PASSWORD=${password}\n`, { mode: 0o600 });
  console.log("Wrote .dev.vars.staging (git-ignored).");
  if (generated) {
    console.log(`Generated staging password: ${password}`);
    console.log("Store it in a password manager; it is not shown again.");
  }
  let uploaded = false;
  if (await confirm("Upload it to Cloudflare now (wrangler secret put STAGING_PASSWORD --env staging)?")) {
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
