# Cloudflare Website Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clone-rename-publish template for static websites on Cloudflare Workers. It has an Astro site, a staging and a production environment, a cookie-based shared-password login guarding staging, laptop and GitHub Actions publishing, and complete docs, including `AGENTS.md`.

**Architecture:**
- Astro builds a static `dist/`.
- One small Worker (`worker/`) is attached to Workers Static Assets. On staging it runs first for every request and enforces the login. On production it runs only for `/__auth/*`, so every page and every 404 is served by the asset layer without running code.
- Node scripts (`scripts/`) handle setup, preflight checks, and publishing. Docs are the primary deliverable.

**Tech Stack:** every version below was verified against the npm registry and current docs on 2026-10-23, and test-installed on Node 26.12.0.
- Node 26 and npm
- `astro@7.4.2` (static output)
- `@astrojs/check@0.9.12`
- `typescript@6.0.3`. `astro check` refuses TS 7.
- `wrangler@4.152.0`
- `vitest@5.0.5` with `@cloudflare/vitest-plugin@1.4.7`
- GitHub Actions: `actions/checkout@v7` and `actions/setup-node@v7`

**Spec:** `docs/superpowers/specs/2026-10-23-cloudflare-website-template-design.md`. Read it before starting any task. Section numbers below (§x.y) refer to it.

## Global Constraints

- Hosting: Workers + Static Assets, not Pages. Free plan only. No Zero Trust.
- Config file: `wrangler.jsonc`, with `compatibility_date` set to `"2026-10-19"` (the newest date wrangler 4.152.0's bundled runtime supports). The template has **no** `account_id` key; setup inserts it.
- `package.json`: `"private": true`, `"engines": { "node": ">=26" }`. `.nvmrc` contains `26`. Pin the devDependencies with exact versions from Tech Stack.
- Template default slug: `cloudflare-website-template`. Preflight rejects it as "not renamed".
- Slug regex: `^[a-z0-9](?:[a-z0-9-]{0,50}[a-z0-9])?$`. That is at most 52 characters, so `<slug>-production` fits within the 63-character Worker name limit.
- Environment names are exactly `staging` and `production`. Worker names are `<slug>-staging` and `<slug>-production`.
- Vars:
  - staging: `AUTH_MODE: "password"` and `AUTH_SESSION_HOURS: "168"`
  - production: `AUTH_MODE: "off"`
- Secret: `STAGING_PASSWORD` (staging only). Local copy lives in `.dev.vars.staging`.
- Cookie: `site_auth`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` = session seconds. Add `Secure` only when the request URL is `https:`.
- Token: `v1.<expiryUnixSeconds>.<base64url(HMAC-SHA256(key, "v1." + expiry))>`. The key is HMAC-SHA256 key material from the UTF-8 bytes of `"site-auth-v1:" + STAGING_PASSWORD`.
- Auth routes:
  - `GET|POST /__auth/login`
  - `GET /__auth/logout`
  - other `/__auth/*` are public assets on staging and 404 on production
- Login override asset: built file `/__auth/login.html`, **fetched from `env.ASSETS` at the clean URL `/__auth/login`**. Only a `200` counts as present.
- Override placeholders: `{{NEXT}}` and `{{ERROR}}`, both HTML-escaped on substitution. The error text is exactly `Incorrect password.`
- Every staging response carries `X-Robots-Tag: noindex, nofollow`. The staging `/robots.txt` body is exactly `User-agent: *\nDisallow: /\n`.
- Login, 401, and 503 responses carry `Cache-Control: no-store`.
- Missing or empty `STAGING_PASSWORD` on staging: `503` with the body `Staging password not configured.` on every path.
- Never put secret values in command arguments or logs. Pass them through stdin.
- Worker code uses web-standard APIs only, with no `node:` imports. The test plugin silently enables `nodejs_compat`, so tests would not catch a violation.
- **No screenshots, browser automation, or visual comparison** at any step, including review. Visual design is the site author's responsibility. Verify behaviour only through tests, `curl`, command output, and file contents.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Passwords with spaces, `=`, or non-ASCII characters** must match exactly, with no trimming. A trimmed variant must not match. Pinned in Task 2.
2. **Several cookies, or a similarly named cookie** (`site_auth_old=…; site_auth=…`): only the exact `site_auth` is read. Pinned in Task 2.
3. **A POST with a non-form body or no `password` field** returns `401` with the login page, never a `500`. Pinned in Task 4.
4. **Unauthenticated `HEAD` and query-string requests:** `HEAD /a?b=1` gets `401`, and `next` keeps `/a?b=1`. Pinned in Task 4.
5. **Slug edge cases:** `A-site`, `-site`, `site-`, a 53-character slug, and the template default are all rejected, while `a` and a 52-character slug are accepted. Pinned in Task 5.
6. **A `node:` import added to the Worker** would pass the tests (`nodejs_compat` is auto-enabled there) but fail when deployed. Pinned by the guard test in Task 4, Step 7b.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `package.json`, `.nvmrc`, `.gitignore`, `astro.config.mjs`, `tsconfig.json` | project + Astro | 1 |
| `src/site.config.ts` | `export const SITE = { title: "Cloudflare Website Template" }`; setup rewrites `title` | 1 |
| `src/layouts/Base.astro`, `src/pages/index.astro`, `src/pages/404.astro`, `public/robots.txt`, `public/favicon.svg` | placeholder site | 1 |
| `vitest.config.ts`, `worker/tsconfig.json`, `worker/env.d.ts` | test + type setup | 2 |
| `worker/auth.ts` | pure auth helpers | 2 |
| `worker/login.html`, `worker/login.ts`, `worker/html.d.ts` | login page default + override loading | 3 |
| `wrangler.jsonc`, `worker/index.ts`, `.dev.vars.staging.example` | routing + environments | 4 |
| `scripts/lib/*.mjs`, `scripts/preflight.mjs`, `scripts/publish.mjs` | preflight + publish | 5 |
| `scripts/setup.mjs` | interactive setup | 6 |
| `.github/workflows/deploy.yml` | opt-in CI | 7 |
| `scripts/check-docs.mjs`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/*.md` | documentation | 8 |

Tests live in `worker/test/*.test.ts` (Workers runtime) and `scripts/test/*.test.mjs` (Node).

---

### Task 1: Repository and Astro site

**Files:**
- Create: `package.json`, `.nvmrc`, `.gitignore`, `astro.config.mjs`, `tsconfig.json`, `src/site.config.ts`, `src/layouts/Base.astro`, `src/pages/index.astro`, `src/pages/404.astro`, `public/robots.txt`, `public/favicon.svg`

**Interfaces:**
- Produces:
  - `npm run build` writes `dist/index.html` and `dist/404.html`
  - `SITE.title` in `src/site.config.ts`, written as the single line `title: "…",` so that setup can regex-replace it

- [ ] **Step 1:** Run `git init -b main` in the repo root.
- [ ] **Step 2: Create `package.json`.**
  - `name`: `cloudflare-website-template`. Also set `private`, `type: "module"`, and `engines`.
  - devDependencies, at the exact versions:
    - `astro@7.4.2`
    - `@astrojs/check@0.9.12`
    - `typescript@6.0.3`
    - `wrangler@4.152.0`
    - `vitest@5.0.5`
    - `@cloudflare/vitest-plugin@1.4.7`
  - Scripts for now: `dev: astro dev` and `build: astro build`. Later tasks add the rest. The final list is spec §4.4.
- [ ] **Step 3: Create `.gitignore`** with `node_modules/`, `dist/`, `.astro/`, `.wrangler/`, `.dev.vars*`, `!.dev.vars*.example`, `.env*`, and `.DS_Store`.
- [ ] **Step 4: Create the Astro config files.**
  - `astro.config.mjs`: `output: 'static'`.
  - `tsconfig.json`: extends `astro/tsconfigs/strict` and excludes `worker`, `scripts`, and `dist`.
- [ ] **Step 5: Create the placeholder site.**
  - `Base.astro` uses `SITE.title`. Keep the home page and 404 page minimal and neutral; the content is your call.
  - `public/robots.txt`: `User-agent: *` and `Allow: /`.
- [ ] **Step 6: Install and build.**
  - Run `npm install && npm run build && ls dist`.
  - Expected: `404.html`, `index.html`, `robots.txt`, and `favicon.svg` are listed.
- [ ] **Step 7: Commit.**
  - Run `git add -A && git commit` with the message `chore: scaffold Astro site` plus the co-author line.
  - The spec and plan docs are included in this commit.

---

### Task 2: Auth helpers

**Files:**
- Create: `vitest.config.ts`, `worker/tsconfig.json`, `worker/env.d.ts`, `worker/auth.ts`
- Test: `worker/test/auth.test.ts`

**Interfaces:**
- Produces, from `worker/auth.ts`:
  - `COOKIE_NAME = "site_auth"`
  - `signSession(password: string, expiresAtSec: number): Promise<string>`
  - `verifySession(password: string, token: string | null, nowSec: number): Promise<boolean>`
  - `passwordMatches(input: string, expected: string): Promise<boolean>`: constant-time. Compare HMACs of both under one fixed key with `crypto.subtle.timingSafeEqual`.
  - `safeNext(raw: string | null | undefined): string`
  - `readCookie(header: string | null, name: string): string | null`
  - `sessionCookie(token: string, maxAgeSec: number, secure: boolean): string`
  - `clearSessionCookie(secure: boolean): string`
  - `escapeHtml(s: string): string`
- Produces, from `worker/env.d.ts`:
  - `interface Env { ASSETS: Fetcher; AUTH_MODE?: string; AUTH_SESSION_HOURS?: string; STAGING_PASSWORD?: string }`

- [ ] **Step 1: Configure Vitest.**
  - `vitest.config.ts` uses `test.projects` with two projects:
    - `worker`: puts `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })` in **this project's own `plugins` array**, and includes `worker/test/**/*.test.ts`.
    - `scripts`: `environment: "node"`, includes `scripts/test/**/*.test.mjs`.
  - **Never put the plugin in the root `plugins`.** Vitest 5 projects inherit root config by default (`extends: true`), so the Node project would run inside the Workers runtime too.
  - Add a temporary minimal `wrangler.jsonc` (`name`, `main: "worker/index.ts"`, `compatibility_date`) and a stub `worker/index.ts` exporting `{ fetch: () => new Response("") }`. Task 4 replaces both.
  - Add scripts `test: vitest run` and `check:worker: tsc -p worker/tsconfig.json`.
  - `worker/tsconfig.json` sets `types: ["@cloudflare/vitest-plugin/types"]` and uses the Workers runtime types from `wrangler types`. Put the generated file at `worker/worker-configuration.d.ts`, add the script `types: wrangler types worker/worker-configuration.d.ts --include-env=false`, and commit the output. Keep `Env` hand-written in `env.d.ts` so it's identical for both environments.
- [ ] **Step 2: Write the failing tests in `worker/test/auth.test.ts`.**
  - `signSession`/`verifySession`:
    - a round trip returns `true`;
    - with `nowSec` past the expiry, returns `false`;
    - a token signed with `"old"` and verified with `"new"`, returns `false`;
    - a flipped signature character, returns `false`;
    - each of `null`, `""`, `"v2.1.x"`, and `"v1.notanumber.sig"`, returns `false`.
  - `passwordMatches`:
    - `("  pä ss=word ", "  pä ss=word ")` returns `true`;
    - `("pä ss=word", "  pä ss=word ")` returns `false`;
    - `("", "x")` returns `false`.
  - `safeNext`:
    - `"/a?b=1"` stays `"/a?b=1"`;
    - `"//evil.com"`, `"https://evil.com"`, `"/\\evil"`, `"evil"`, `""`, and `null` all become `"/"`.
  - `readCookie("site_auth_old=x; site_auth=y; other=z", "site_auth")` returns `"y"`. A header without the cookie, or a `null` header, returns `null`.
  - `sessionCookie("t", 604800, true)` contains `site_auth=t`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800`, and `Secure`. With `secure` set to `false`, `Secure` is absent.
  - `clearSessionCookie` contains `Max-Age=0`.
  - `escapeHtml('<a href="x">&\'')` returns `&lt;a href=&quot;x&quot;&gt;&amp;&#39;`.
- [ ] **Step 3:** Run `npx vitest run --project worker`. Expected: FAIL, because the module is missing.
- [ ] **Step 4: Implement `worker/auth.ts`.**
  - Use only `crypto.subtle` (HMAC SHA-256) and a base64url helper.
  - In `verifySession`, recompute the signature and compare with `timingSafeEqual`. Check byte lengths before comparing.
- [ ] **Step 5:** Run `npx vitest run --project worker && npm run check:worker`. Expected: all PASS, and tsc reports 0 errors.
- [ ] **Step 6:** Commit with the message `feat(worker): auth helpers`.

---

### Task 3: Login page (default and override)

**Files:**
- Create: `worker/login.html`, `worker/html.d.ts` (`declare module "*.html" { const s: string; export default s; }`), `worker/login.ts`
- Test: `worker/test/login.test.ts`

**Interfaces:**
- Consumes: `escapeHtml`, `Env`
- Produces:
  - `renderLogin(env: Env, origin: string, opts: { next: string; error: boolean }, status: number): Promise<Response>`
  - The response is HTML with `Content-Type: text/html; charset=utf-8` and `Cache-Control: no-store`.

- [ ] **Step 1: Write `worker/login.html`.**
  - Unbranded and neutral, with inline `<style>`, no external requests, and a centred card titled "Password required".
  - It must contain the contract elements verbatim:
    - `<form method="POST" action="/__auth/login">`
    - `<input type="password" name="password" autocomplete="current-password" required autofocus>`
    - `<input type="hidden" name="next" value="{{NEXT}}">`
    - `<p class="error" role="alert">{{ERROR}}</p>`, styled with `.error:empty{display:none}`
  - Include `<meta name="robots" content="noindex">`.
- [ ] **Step 2: Write the failing tests.** Use a fake `ASSETS` object whose `fetch` records the requested URLs and returns a configurable response.
  - No override (ASSETS returns 404): the body includes `action="/__auth/login"`. ASSETS was asked for exactly `<origin>/__auth/login`, **not** `/__auth/login.html`.
  - Override present (ASSETS returns 200 with `<form>…{{NEXT}}…{{ERROR}}</form>`): the override body is used.
  - Override fetch returns `307`: the default is used.
  - `next: '/x?a="1"&b'` is substituted as `/x?a=&quot;1&quot;&amp;b`.
  - `error: true` substitutes `Incorrect password.`, and `error: false` substitutes an empty string.
  - The status passed through is preserved. The headers include `Cache-Control: no-store`.
- [ ] **Step 3:** Run `npx vitest run --project worker`. Expected: FAIL.
- [ ] **Step 4: Implement `renderLogin`.**
  - `import defaultLogin from "./login.html"`. Wrangler's default module rules import `.html` as Text.
  - If the Vitest plugin doesn't apply that rule, add an explicit `rules: [{ type: "Text", globs: ["**/*.html"] }]` entry to `wrangler.jsonc` rather than inlining the HTML.
  - Replace every occurrence of each placeholder.
- [ ] **Step 5:** Run the tests and `npm run check:worker`. Expected: PASS.
- [ ] **Step 6:** Commit with the message `feat(worker): login page with per-site override`.

---

### Task 4: Worker routing and environments

**Files:**
- Modify: `wrangler.jsonc` (replace with the spec §4.2 shape, including `"account_id": ""`), `worker/index.ts` (replace the stub)
- Create: `.dev.vars.staging.example` (`STAGING_PASSWORD=change-me`)
- Test: `worker/test/index.test.ts`

**Interfaces:**
- Consumes: Task 2 helpers and `renderLogin`
- Produces: `export default { fetch(request: Request, env: Env): Promise<Response> }`

**`fetch` order (when this applies, do this):**

| # | When | Response |
|---|---|---|
| 1 | `env.AUTH_MODE !== "password"` (production) | `/__auth/*` → `404`; anything else → `env.ASSETS.fetch(request)` |
| 2 | `env.STAGING_PASSWORD` is missing or empty | `503`, body `Staging password not configured.` |
| 3 | path is `/robots.txt` | the staging robots body |
| 4 | `GET /__auth/login` | login page with `next = safeNext(query next)`, status `200` |
| 5 | `POST /__auth/login` | parse `formData()`; on any parse error, treat it as a wrong password. Correct password → `303` to `safeNext(next)` with `Set-Cookie: sessionCookie(signSession(pw, now + hours*3600), hours*3600, isHttps)`. Wrong → `renderLogin(… error:true, 401)` |
| 6 | `GET /__auth/logout` | `303` to `/` with `clearSessionCookie` |
| 7 | any other `/__auth/*` | `env.ASSETS.fetch(request)`, no session needed |
| 8 | `verifySession(pw, readCookie(...), now)` is true | `env.ASSETS.fetch(request)` |
| 9 | otherwise | `renderLogin(env, origin, { next: pathname + search, error: false }, 401)` |

Notes:
- Steps 2–9 pass through one `withNoindex(response)` wrapper. It copies the response so the headers are mutable, then sets `X-Robots-Tag`.
- `hours = Number(env.AUTH_SESSION_HOURS) || 168`.

- [ ] **Step 1: Write the failing tests.** Construct `env` objects directly and call `worker.fetch`. Use a fake `ASSETS` that returns `200 "asset:" + pathname`, except `/__auth/login`, which returns `404`.
  - **Production** (`AUTH_MODE: "off"`): `/` returns `asset:/`. A non-navigation miss `/nope` is handed to ASSETS, so it returns `asset:/nope` from the fake. `/__auth/login` returns `404`. There's no `X-Robots-Tag`.
  - **Staging:**
    - **Missing password:** with an empty password, `/`, `/robots.txt`, and `/__auth/login` each return `503` with noindex.
    - **Unauthenticated requests:**
      - `GET /` → `401` with the form.
      - `HEAD /a?b=1` → `401`, and a matching GET body would contain `value="/a?b=1"`.
      - Each of these has `X-Robots-Tag: noindex, nofollow`.
    - **`/robots.txt`:** returns the exact disallow body.
    - **Login `POST`:**
      - Wrong password → `401` with `Incorrect password.`
      - Right password with `next=/docs` → `303`, `Location: /docs`, and a `Set-Cookie` that contains `site_auth=v1.`
      - `next=//evil.com` → `Location: /`.
      - A JSON body, or a form with no password field, → `401`.
    - **Session cookie:**
      - The cookie from a successful login, sent back on `GET /docs` → `asset:/docs`.
      - The same cookie after the env password changes → `401`.
      - An expired token (signed with a past expiry) → `401`.
    - **`Secure` flag:** a `Set-Cookie` over `http://localhost` has no `Secure`; over `https://x.workers.dev` it has `Secure`.
    - **Public auth assets:** `/__auth/logo.svg` without a session → `asset:/__auth/logo.svg`.
    - **Logout:** → `303` to `/` with `Max-Age=0`.
- [ ] **Step 2:** Run `npx vitest run --project worker`. Expected: FAIL.
- [ ] **Step 3:** Implement `worker/index.ts` per the table above, and write `wrangler.jsonc` per §4.2. Name `"cloudflare-website-template"`, and set `compatibility_date` to `"2026-10-19"`.
- [ ] **Step 4:** Run `npm test && npm run check:worker`. Expected: PASS.
- [ ] **Step 5: Add the preview scripts.**
  - `preview: npm run build && wrangler dev --env production`
  - `preview:staging: npm run build && wrangler dev --env staging`
  - Copy `.dev.vars.staging.example` to `.dev.vars.staging`.
- [ ] **Step 6: Manual smoke test.** Run `npm run preview:staging` in the background, then:
  - `curl -si localhost:8787/` → `401`, the form, and the noindex header.
  - `curl -si -d password=change-me -d next=/ localhost:8787/__auth/login` → `303` and a cookie.
  - Resending that cookie to `/` → `200` with the home page.
  - `curl -si localhost:8787/nope` with the cookie → `404` with the Astro 404 page.
  - Stop the server.
  - Then run `npm run preview` and check that `curl -si localhost:8787/` returns `200` with no noindex header, and that `/__auth/login` returns `404`.
- [ ] **Step 7: Dry-run deploys.** Run `npx wrangler deploy --env staging --dry-run` and the same for `production`. Expected: both exit 0 with no warnings about `account_id`; the template has no such key.
  - A dry run does not check `secrets.required`, because that check happens against the API.
- [ ] **Step 7b: Guard test.** Add `scripts/test/worker-imports.test.mjs`. It reads every `worker/**/*.ts` file except tests and asserts that no `from "node:` or `require("node:` appears.
- [ ] **Step 8:** Commit with the message `feat(worker): staging login routing and environments`.

---

### Task 5: Preflight and publish

**Files:**
- Create:
  - `scripts/lib/config.mjs`
  - `scripts/lib/run.mjs`: `run(cmd, args, { input?, capture? }) → Promise<{ code, stdout }>`, which spawns `npx` and inherits stdio unless `capture` is set
  - `scripts/preflight.mjs`
  - `scripts/publish.mjs`
- Test: `scripts/test/config.test.mjs`, `scripts/test/preflight.test.mjs`

**Interfaces:**
- Produces, from `scripts/lib/config.mjs`:
  - `TEMPLATE_SLUG = "cloudflare-website-template"`
  - `SLUG_RE`
  - `isValidSlug(s): boolean`
  - `parseJsonc(text): any`: strips `//` and `/* */` comments outside strings, plus trailing commas
  - `setJsoncString(text, key, value): string`: replaces the first `"key": "<anything>"`. If the key is absent, it inserts `"key": "value",` on a new line directly after the top-level `"name"` line, matching that line's indentation. Everything else is preserved byte-for-byte.
  - `readWrangler(root = process.cwd()): any`
  - `meetsNodeFloor(version: string, floor = "26.0.0"): boolean`
- Produces, from `scripts/preflight.mjs`:
  - `preflight(env: "staging" | "production", deps): Promise<string[]>`, which returns a list of fix-it messages (empty means OK)
  - `deps` is `{ readWrangler, run, nodeVersion, envVars }`, injectable for tests
  - When run as a CLI (`node scripts/preflight.mjs staging`), it prints the messages and exits `1` if there are any
- Produces, from `scripts/publish.mjs`: the CLI `node scripts/publish.mjs <env> [--yes]`

- [ ] **Step 1: Write the failing tests.**
  - `isValidSlug` accepts:
    - `a`
    - `acme-site`
    - a 52-character slug
  - `isValidSlug` rejects:
    - `A-site`
    - `-site`
    - `site-`
    - `site_x`
    - a 53-character slug
  - `parseJsonc` handles all of these:
    - a line comment;
    - a block comment;
    - `"url": "https://x"`: the `//` inside a string is kept;
    - a trailing comma.
  - `setJsoncString` changes `name` and keeps comments byte-identical elsewhere. When `account_id` is absent, it inserts the key after `name`, and `parseJsonc` of the result has it.
  - `meetsNodeFloor("26.0.0")` is `true`, `("25.9.0")` is `false`, `("24.22.1")` is `false`, and `("26.12.1")` is `true`. It accepts a leading `v`.
  - `preflight` returns:
    - one message containing `npm run setup` when the name equals `TEMPLATE_SLUG`;
    - one message when `account_id` is missing;
    - one message when `whoami --json` exits non-zero (or returns `loggedIn: false`) and there's no `CLOUDFLARE_API_TOKEN`;
    - for staging only:
      - one message when `secret list` succeeds but has no `STAGING_PASSWORD`;
      - one message containing `npm run setup` and "creates the staging Worker" when `secret list` fails with `not found`;
    - `[]` when everything is good.
  - Production never calls `secret list`.
- [ ] **Step 2:** Run `npx vitest run --project scripts`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - Auth check: run `wrangler whoami --json`. Unauthenticated, it prints `{"loggedIn":false}` and exits 1 (verified on 4.152.0).
  - Secret check: run `wrangler secret list --env staging`. It prints JSON by default, `[{ "name", "type" }]`. For a new Worker it exits non-zero with `Worker "<name>" not found`.
  - `publish.mjs`:
    - runs `preflight`, printing failures and exiting `1`;
    - for production only, without `--yes` and with `CI` unset, prompts `Deploy <slug> to PRODUCTION? (y/N) ` and aborts on anything except `y`/`yes`;
    - runs `npm run build`;
    - runs `wrangler deploy --env <env>` with inherited stdio, so Wrangler prints the URL;
    - exits with Wrangler's exit code;
    - rejects an unknown env with a usage line.
- [ ] **Step 4: Add the publish scripts.**
  - `publish:staging: node scripts/publish.mjs staging`
  - `publish:production: node scripts/publish.mjs production`
  - Extend `check:worker` to also run `tsc -p scripts/jsconfig.json`, a new `checkJs` config covering `scripts/**/*.mjs`.
- [ ] **Step 5:** Run `npm test && npm run check:worker`. Then run `npm run publish:staging`. Expected: it exits `1`, listing the "not renamed" and `account_id` messages.
- [ ] **Step 6:** Commit with the message `feat(scripts): preflight checks and publish commands`.

---

### Task 6: Interactive setup

**Files:**
- Create: `scripts/setup.mjs`
- Modify: `scripts/lib/config.mjs`, adding `generatePassword(): string` (`crypto.randomBytes(18).toString("base64url")`) and `setSiteTitle(text, title): string` (replaces the `title: "…",` line)
- Test: `scripts/test/config.test.mjs` (extend it)

**Interfaces:**
- Consumes: `isValidSlug`, `setJsoncString`, `TEMPLATE_SLUG`, `run`
- Produces: the CLI `npm run setup`

- [ ] **Step 1: Write the failing tests.**
  - `generatePassword()` is 24 characters and matches `/^[A-Za-z0-9_-]+$/`. Two calls return different values.
  - `setSiteTitle('export const SITE = {\n  title: "Old",\n};', 'Acme "Co"')` gives a valid TS string with escaped quotes.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement the helpers, then `setup.mjs`.** Use `node:readline/promises`, and show current values as defaults, per spec §4.5:
  - **Slug:** loop until it's valid and not the template slug. Write it to `wrangler.jsonc` and `package.json` `name`.
  - **Site title:** the default is the slug title-cased. Update `src/site.config.ts` only if the file exists. Otherwise print "skipped (no src/site.config.ts)" so a framework swap doesn't break setup.
  - **Login:** if not logged in, offer to run `wrangler login`.
  - **Account ID:** read the accounts from `wrangler whoami --json`. Check the field name against real output once logged in, and fall back to manual entry if parsing fails. With one account, offer it; with several, show a numbered pick list. Validate manual entry against `/^[0-9a-f]{32}$/`. Write the value with `setJsoncString`, which inserts the key.
  - **Staging password:** Enter accepts a generated one, or the user types their own. Write `.dev.vars.staging`. Offer to upload it with `wrangler secret put STAGING_PASSWORD --env staging`, passing the value via the `input` stdin option. The password is printed **once**, only when it was generated, with a note to store it in a password manager.
  - **Summary:** print the next commands.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Manual check.**
  - Run `npm run setup` in a scratch copy of the repo (`cp -R`), declining the login and the upload.
  - Confirm that `wrangler.jsonc` and `package.json` names changed, comments are intact, and `.dev.vars.staging` exists.
  - Confirm that `git status` in the scratch copy doesn't list `.dev.vars.staging`.
- [ ] **Step 6:** Commit with the message `feat(scripts): interactive setup`.

**Secret upload ordering (verified):**
- `secrets.required` blocks a first deploy when the secret is missing.
- `wrangler secret put` on a Worker that doesn't exist creates a draft Worker. Wrangler prompts first; the default answer is yes, and `secret put` reads the value from stdin when stdin is piped.
- So setup's upload step is what makes the first `publish:staging` possible. Setup must print this when the user declines the upload: "Staging can't be published until the password is uploaded. Re-run npm run setup."

---

### Task 7: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write the workflow.**
  - Triggers:
    - `push` to branches `[main, staging]`;
    - `workflow_dispatch` with a choice input `environment` of `[staging, production]`.
  - One job `deploy`:
    - `if: vars.DEPLOY_ENABLED == 'true'`;
    - `environment: ${{ inputs.environment || (github.ref_name == 'main' && 'production' || 'staging') }}`;
    - `concurrency: { group: deploy-<same expression>, cancel-in-progress: false }`.
  - Steps:
    - `actions/checkout@v7`
    - `actions/setup-node@v7` with `node-version-file: .nvmrc` and `cache: npm`
    - `npm ci`
    - `npm test`
    - `npm run check`
    - `npm run publish:<env> -- --yes`, with `env: CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}`
  - There is no account ID secret.
- [ ] **Step 2: Validate.** Run `npx -y @action-validator/cli@0.6.0 .github/workflows/deploy.yml`. Expected: no errors. The tool has no `--version` flag.
- [ ] **Step 3:** Commit with the message `ci: opt-in deploy workflow`.

---

### Task 8: Documentation and docs check

**Files:**
- Create: `scripts/check-docs.mjs`, `AGENTS.md`, `CLAUDE.md`, `README.md`, and these files in `docs/`:
  - `cloudflare-account.md`
  - `environments.md`
  - `local-development.md`
  - `staging-login.md`
  - `publishing.md`
  - `github-actions.md`
  - `custom-domains.md`
  - `swapping-the-framework.md`
  - `troubleshooting.md`
- Test: `scripts/test/check-docs.test.mjs`

**Interfaces:**
- Produces: `findMissingScripts(texts: string[], scripts: Record<string,string>): string[]`. It matches `/npm run ([a-z0-9:_-]+)/g` and returns unknown names, de-duplicated. The CLI scans `AGENTS.md`, `README.md`, and `docs/**/*.md`, excluding `docs/superpowers/`.

- [ ] **Step 1: Write the failing test.**
  - `findMissingScripts(["run `npm run build` and npm run nope"], { build: "x" })` returns `["nope"]`.
  - With nothing missing, it returns `[]`.
- [ ] **Step 2: Implement and wire up the scripts.**
  - Run the test, expecting FAIL. Then implement and run it again, expecting PASS.
  - Add the scripts:
    - `check:docs: node scripts/check-docs.mjs`
    - `check:site: astro check`
    - `check: npm run check:worker && npm run check:site && npm run check:docs`
- [ ] **Step 3: Write `AGENTS.md`** with the seven sections of spec §4.8, in that order.
  - **Mental model:** state the corrected production behaviour. The asset layer serves pages and 404s, and the Worker handles only `/__auth/*`.
  - **Commands table:** must equal the final `package.json` scripts, including `types`, `check:worker`, `check:site`, and `check:docs`.
  - **Recipes:** each one is a numbered list ending in a verification command.
  - **Rollback recipe:** run `npx wrangler deployments list --env <env>`, then `npx wrangler rollback --env <env>`. Both flags are verified.
  - **Rules section:** also state that any new route the browser must reach in the Worker on production has to be added to `run_worker_first`, because navigation misses skip the Worker.
- [ ] **Step 4:** Write `CLAUDE.md`, containing exactly `@AGENTS.md` followed by one line saying all project guidance lives there.
- [ ] **Step 5: Write `README.md`** per §4.8, with the five-step quickstart.
- [ ] **Step 6: Write the `docs/*.md` files**, each covering what §4.8 lists for it.
  - `staging-login.md` includes:
    - the override contract;
    - a complete copy-paste `public/__auth/login.html` example;
    - the "must be in `public/`, not `src/pages/`" warning;
    - the clean-URL note;
    - the security notes.
  - `swapping-the-framework.md` includes the §4.8 file list and a checklist that ends with: `npm run build` produces `404.html` and `__auth/` in the output, followed by `npm run preview:staging`.
  - `github-actions.md` includes:
    - an API token built from the "Edit Cloudflare Workers" template, scoped to the one account;
    - the optional narrower set, Account → Workers Scripts Edit plus Account → Account Settings Read (add Zone → Workers Routes Edit for custom domains), labelled "inferred; verify with a test deploy";
    - a statement that the staging Worker must exist first: run `npm run setup` once from a laptop before the first CI deploy;
    - the `CLOUDFLARE_API_TOKEN` secret;
    - the `DEPLOY_ENABLED` variable;
    - creating the `staging` branch;
    - an optional required reviewer on the `production` environment;
    - a short Workers Builds alternative paragraph.
- [ ] **Step 7:** Run `npm run check`. Expected: PASS, with no missing scripts reported.
- [ ] **Step 8:** Commit with the message `docs: AGENTS.md, README, and topic guides`.

---

### Task 9: End-to-end verification

- [ ] **Step 1: Clean install and checks.** Run `rm -rf node_modules dist && npm ci && npm test && npm run check && npm run build`. Expected: all pass.
- [ ] **Step 2:** Repeat Task 4 Step 6 (both previews) and Task 4 Step 7 (both dry runs). Expected: the same results.
- [ ] **Step 3: Agent docs check.** Dispatch a fresh subagent with only this instruction: "Using only AGENTS.md, explain how you would: rename this project, add an /about page, change the login page, and deploy to staging". Every answer must be correct against the repo. Fix AGENTS.md where the answers go wrong.
- [ ] **Step 4: Real deploy (optional; ask the user first).**
  - Deploy only with their go-ahead and their account: run `npm run setup`, then `npm run publish:staging`.
  - Verify with `curl` only, no browser or screenshots:
    - `curl -si <staging-url>/` returns `401` with the form and `X-Robots-Tag`;
    - a POST with a wrong password returns `401` with `Incorrect password.`;
    - a POST with the right password returns `303` and a cookie;
    - resending that cookie returns `200`.
  - Confirm that the "Edit Cloudflare Workers" token, or the narrower inferred set, can deploy. Update `docs/github-actions.md` with the result.
  - Do not deploy production unless the user asks.
- [ ] **Step 5:** Commit any fixes with the message `chore: verification fixes`.
