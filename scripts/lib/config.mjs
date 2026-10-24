import { randomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const TEMPLATE_SLUG = "cloudflare-website-template";
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,50}[a-z0-9])?$/;

/** @param {string} s */
export function isValidSlug(s) {
  return typeof s === "string" && SLUG_RE.test(s);
}

/**
 * Remove comments (outside strings) and trailing commas.
 * @param {string} text
 * @returns {string}
 */
function stripJsonc(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      out += " ";
    } else {
      out += c;
      i++;
    }
  }
  // Trailing commas: a comma followed only by whitespace then } or ].
  let res = "";
  i = 0;
  while (i < out.length) {
    const c = out[i];
    if (c === '"') {
      let j = i + 1;
      while (j < out.length && out[j] !== '"') j += out[j] === "\\" ? 2 : 1;
      res += out.slice(i, j + 1);
      i = j + 1;
    } else if (c === ",") {
      let j = i + 1;
      while (j < out.length && /\s/.test(out[j])) j++;
      if (out[j] !== "}" && out[j] !== "]") res += c;
      i++;
    } else {
      res += c;
      i++;
    }
  }
  return res;
}

/** @param {string} text @returns {any} */
export function parseJsonc(text) {
  return JSON.parse(stripJsonc(text));
}

/**
 * Replace the first `"key": "<anything>"`, or insert it after the top-level
 * `"name"` line when absent. Everything else is preserved byte-for-byte.
 * @param {string} text @param {string} key @param {string} value
 */
export function setJsoncString(text, key, value) {
  const keyRe = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = new RegExp(`("${keyRe}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`);
  const json = JSON.stringify(value);
  if (existing.test(text)) return text.replace(existing, (_m, p1) => `${p1}${json}`);
  const nameLine = /^([ \t]*)"name"\s*:.*$/m.exec(text);
  if (!nameLine) throw new Error('wrangler.jsonc has no top-level "name" line to insert after');
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const at = nameLine.index + nameLine[0].length;
  const insert = `${eol}${nameLine[1]}"${key}": ${json},`;
  return text.slice(0, at) + insert + text.slice(at);
}

/** @param {string} [root] */
export function readWrangler(root = process.cwd()) {
  return parseJsonc(readFileSync(join(root, "wrangler.jsonc"), "utf8"));
}

/**
 * @param {string} version @param {string} [floor]
 */
export function meetsNodeFloor(version, floor = "26.0.0") {
  const parse = (/** @type {string} */ v) =>
    v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(version);
  const b = parse(floor);
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

/** 24 URL-safe characters (18 random bytes). */
export function generatePassword() {
  return randomBytes(18).toString("base64url");
}

/**
 * Write a secrets file readable only by its owner. `mode` only applies when the
 * file is created, so chmod afterwards to tighten a pre-existing file too.
 * @param {string} path @param {string} content
 */
export function writeOwnerOnly(path, content) {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/**
 * What setup prints after generating a password. The password itself is shown only
 * on an interactive terminal, so it never lands in piped output or CI logs.
 * @param {string} password @param {boolean | undefined} isTTY
 * @returns {string[]}
 */
export function generatedPasswordMessage(password, isTTY) {
  if (isTTY === true) {
    return [
      `Generated staging password: ${password}`,
      "Store it in a password manager; it is not shown again.",
    ];
  }
  return ["Generated a staging password and saved it to .dev.vars.staging (owner-read-only)."];
}

/**
 * Replace the `title: "…",` line in src/site.config.ts.
 * @param {string} text @param {string} title
 */
export function setSiteTitle(text, title) {
  return text.replace(/^([ \t]*title\s*:\s*).*$/m, (_m, p1) => `${p1}${JSON.stringify(title)},`);
}

/**
 * Current value of the `title: "…"` line, or undefined when absent.
 * @param {string} text
 * @returns {string | undefined}
 */
export function getSiteTitle(text) {
  const m = /^[ \t]*title\s*:\s*("(?:[^"\\]|\\.)*")/m.exec(text);
  if (!m) return undefined;
  try {
    return JSON.parse(m[1]);
  } catch {
    return undefined;
  }
}

/**
 * Value of `KEY=value` in dotenv text, or undefined when missing or empty.
 * @param {string} text @param {string} key
 * @returns {string | undefined}
 */
export function getEnvValue(text, key) {
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim() || undefined;
  }
  return undefined;
}
