// Docs consistency check: every `npm run <script>` mentioned in AGENTS.md,
// README.md and docs/**/*.md (excluding docs/superpowers/) must exist in package.json.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Script names mentioned as `npm run <name>` that package.json does not define.
 * @param {string[]} texts
 * @param {Record<string, string>} scripts
 * @returns {string[]}
 */
export function findMissingScripts(texts, scripts) {
  /** @type {Set<string>} */
  const missing = new Set();
  for (const text of texts) {
    for (const m of text.matchAll(/npm run ([a-z0-9:_-]+)/g)) {
      if (!Object.hasOwn(scripts, m[1])) missing.add(m[1]);
    }
  }
  return [...missing];
}

/**
 * @param {string} dir
 * @param {string} skip absolute directory to exclude
 * @returns {string[]}
 */
function markdownFiles(dir, skip) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== skip) out.push(...markdownFiles(full, skip));
    } else if (entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

/** @param {string} root */
export function docFiles(root) {
  const files = ["AGENTS.md", "README.md"].map((f) => join(root, f)).filter((f) => existsSync(f));
  const docs = join(root, "docs");
  if (existsSync(docs)) files.push(...markdownFiles(docs, join(docs, "superpowers")));
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {};
  const files = docFiles(root);
  const missing = findMissingScripts(
    files.map((f) => readFileSync(f, "utf8")),
    scripts,
  );
  if (missing.length) {
    console.error(`Docs mention npm scripts that package.json does not define: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`Docs OK: ${files.length} files, every \`npm run\` script exists.`);
  for (const f of files) console.log(`  ${relative(root, f)}`);
}
