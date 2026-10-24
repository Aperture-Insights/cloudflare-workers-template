# Cloudflare Website Template — Design

Date: 2026-10-23
Status: Draft for approval

## 1. Intent

A reusable starter repository for any website hosted on Cloudflare. The workflow is: clone it, rename it, fill in content (or replace the site with a custom build), and publish with very little effort.

It is not built around any particular site. It is a generic, repeatable starting point for every future site.

Three things matter most, in this order:

1. **Clear documentation.** This includes an `AGENTS.md` that tells future AI coding sessions exactly how to work with the package.
2. **Two environments by default.** Staging and production. Staging sits behind a shared password.
3. **Low-effort publishing.** It works from a laptop out of the box, and through GitHub Actions as an opt-in.

## 2. Goals, non-goals, anti-goals

### Goals
- Create a new Cloudflare-hosted site quickly from this template.
- Every project gets a `staging` and a `production` environment by default.
- The site can be built, tested, and viewed locally before publishing, including the staging login.
- Clear, step-by-step instructions for connecting publishing to a Cloudflare account.
- `npm run publish:staging` and `npm run publish:production` work from a laptop once setup and authentication are complete.
- Clear instructions, plus a ready-made workflow, for publishing from GitHub Actions.
- Staging is protected by a shared password, entered on a static, unbranded login form. Each site can override the form.
- Astro is the default site framework, and swapping it out is easy and documented.

### Non-goals
- Server-side rendering or dynamic backends. The template is a static site. A project can add these later, but the template doesn't plan for them.
- Per-user accounts, roles, or SSO on staging. It uses one shared password.
- Cloudflare Zero Trust / Access. It was explicitly rejected because it requires a credit card, even on the free tier.
- Pull-request preview environments (Workers Previews). Two fixed environments are enough.
- Multi-site monorepo support. One repository is one site.
- Supporting package managers other than npm.

### Anti-goals (failure even if it "works")
- **Staging goes public by accident.** If the password is missing or misconfigured, staging must refuse traffic, not serve it.
- **Production is slowed or metered by the auth layer.** Production page requests must not run Worker code.
- **Secrets in the repo.** Passwords, API tokens, and `.dev.vars*` files must never be committed.
- **Documentation that drifts.** `AGENTS.md`, `README.md`, and `docs/` must describe the same commands and structure. `CLAUDE.md` must not hold a second copy of the content.
- **Framework lock-in.** Replacing Astro must not require touching the Worker, the publish/setup scripts, or the Worker tests. The framework-specific surface is exactly: the `dev`, `build`, and `check:site` scripts, `assets.directory`, `astro.config.mjs`/`tsconfig.json`, and `src/` + `public/`.
- **Accidental production deploys.** A bare `wrangler deploy` (top-level, no env) or an unconfirmed production publish from a laptop must not happen by accident.

## 3. Constraints

- Hosting is **Cloudflare Workers with Static Assets**, not Pages. Workers is Cloudflare's recommended path for new projects.
- Must work on Cloudflare's **free plan** with no payment method on file.
- Wrangler config uses **`wrangler.jsonc`**. Set `compatibility_date` to the newest date the pinned Wrangler's bundled runtime supports: `2026-10-19` for wrangler 4.152.0. A later date makes `wrangler dev` warn and fall back.
- **Node 26 is required.** Ship `.nvmrc` containing `26` and set `engines.node` to `>=26`. Node 26 becomes LTS on 2026-10-28; all pinned tools support it (verified).
- `package.json` must be `"private": true` so `npm publish` cannot push the project to the npm registry by mistake.
- Verified facts this design relies on. All were checked against current docs and the installed CLIs on 2026-10-23:
  - Environments deploy as separate Workers named `<top-level-name>-<env>`.
  - `assets`, `name`, and `workers_dev` are inheritable. `vars` and `secrets` are **non-inheritable** and must be declared per environment.
  - `assets.run_worker_first` accepts a boolean or an array of route patterns (supports `*` and `!` exclusions, max 100 entries).
  - `secrets.required` (per environment) makes `wrangler deploy` fail if a listed secret isn't set on the Worker.
  - `wrangler dev --env <name>` loads `.dev.vars.<name>` exclusively (instead of `.dev.vars`) when it exists. With `secrets.required` set, only the listed keys load.
  - **Navigation vs non-navigation misses:** with `not_found_handling` set and a compatibility date of 2025-04-01 or later, *browser navigation* requests (`Sec-Fetch-Mode: navigate`) that match no asset get `404.html` straight from the asset layer, and the Worker is not invoked. *Non-navigation* misses (fetch/XHR/curl) **do** invoke the Worker. Paths the browser must reach in the Worker on production must be listed in `run_worker_first`.
  - `env.ASSETS.fetch()` applies both `html_handling` (`/x.html` → 307 to `/x`) and `not_found_handling`.
  - `secrets.required` blocks a deploy, including the very first one, when the secret is missing. `wrangler secret put` on a Worker that doesn't exist creates a draft Worker (after a prompt), so a deploy that follows passes the check.
  - `wrangler whoami --json` prints `{"loggedIn":false}` and exits 1 when unauthenticated. `wrangler secret list` outputs JSON by default and fails with "Worker … not found" for a new Worker.
  - An empty `account_id: ""` triggers a warning, so the template omits the key until setup writes it.
  - Wrangler does not validate the 63-character Worker name limit locally; the slug regex has to enforce it.

## 4. Decided design

Every item in this section was decided by the user, or proposed in conversation and accepted. Items marked *(builder's call)* in §5 were not.

### 4.1 Repository layout

```
AGENTS.md                    # source of truth for AI sessions (see 4.8)
CLAUDE.md                    # one line: "See AGENTS.md" (import/pointer only)
README.md                    # human quickstart
package.json                 # scripts in 4.4; "private": true
wrangler.jsonc               # environments in 4.2
astro.config.mjs             # output: 'static'
tsconfig.json
.nvmrc
.gitignore                   # node_modules, dist, .astro, .wrangler, .dev.vars*, .env*
.dev.vars.staging.example    # STAGING_PASSWORD=change-me  (committed example only)
src/                         # Astro site: layouts, pages (index, 404), styles
public/
  robots.txt                 # production robots (allow all)
  __auth/                    # optional per-site login override lives here (4.3)
worker/
  index.ts                   # entry: routes to auth or straight to assets
  auth.ts                    # password check, token sign/verify, cookie helpers
  login.html                 # default unbranded login form (bundled)
  test/                      # Worker tests (4.7)
scripts/
  setup.mjs                  # interactive first-run setup (4.5)
  preflight.mjs              # pre-deploy checks (4.6)
  publish.mjs                # build + preflight + deploy for an env
.github/workflows/deploy.yml # opt-in CI deploy (4.6)
docs/                        # topic guides (4.8)
```

### 4.2 Environments and Wrangler config

- The top-level `name` is the project slug (for example `acme-site`). The two environments deploy as `acme-site-staging` and `acme-site-production`.
- **The top-level (env-less) Worker is never deployed.** Scripts always pass `--env`. `AGENTS.md` forbids a bare `wrangler deploy`. The builder may add a further guard, such as a top-level config that cannot deploy successfully, if a clean one exists.
- `account_id` lives in `wrangler.jsonc`. It is not a secret, and keeping it there means the laptop and CI always target the same account.
- Shape (illustrative; the builder confirms exact keys against the installed Wrangler schema):

```jsonc
{
  "name": "acme-site",
  "account_id": "<inserted by npm run setup; absent in the template>",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-19",
  "preview_urls": false,
  "env": {
    "staging": {
      "workers_dev": true,
      "assets": {
        "directory": "./dist",
        "binding": "ASSETS",
        "not_found_handling": "404-page",
        "run_worker_first": true            // every request goes through auth
      },
      "vars": { "AUTH_MODE": "password", "AUTH_SESSION_HOURS": "168" },
      "secrets": { "required": ["STAGING_PASSWORD"] }
    },
    "production": {
      "workers_dev": true,
      "assets": {
        "directory": "./dist",
        "binding": "ASSETS",
        "not_found_handling": "404-page",
        "run_worker_first": ["/__auth/*"]   // only so the login override isn't publicly served
      },
      "vars": { "AUTH_MODE": "off" }
    }
  }
}
```

- **Production does not run Worker code for page requests.**
  - Matching assets are served directly.
  - Browser navigations to unmatched paths get `404.html` from the asset layer, without the Worker.
  - The production Worker runs only for:
    - `/__auth/*`, where it returns 404. This path is listed in `run_worker_first` so browser navigations reach the Worker too.
    - non-navigation requests that match no asset. The Worker hands these to `env.ASSETS.fetch()`, which applies `not_found_handling` and returns the 404 page.
  - Both paths must be tested.
- `preview_urls: false` keeps the surface small. It is not needed for this workflow.
- Both environments start on `*.workers.dev`. A custom domain per environment is an optional, documented step: add `routes` with `custom_domain: true` under that env.

### 4.3 Staging login

**Behaviour**
1. Every staging request enters the Worker (`run_worker_first: true`).
2. If `AUTH_MODE` is not `"password"`, pass through to assets. This only happens in production and is a safety default.
3. **Fail closed:** if `STAGING_PASSWORD` is missing or empty, return `503` with a plain "staging password not configured" message for every request. Never serve content in this state.
4. Requests under `/__auth/` are handled by the auth routes:
   - `GET /__auth/login` → login page.
   - `POST /__auth/login` → check the password. On success, set the cookie and return `303` to `next`. On failure, re-render the login page with an error and status `401`.
   - `GET /__auth/logout` → clear the cookie and `303` to `/`.
   - Any other `/__auth/*` path (for example the override's CSS or logo) is served from assets **without** requiring a session, so a custom login page can load its own files.
5. Otherwise, check the session cookie. If it's valid, serve from `env.ASSETS`. If not, respond **in place** with the login page and status `401`. The URL is unchanged, and `next` is set to the requested path and query.
6. **Every** staging response, including the login page and assets, gets `X-Robots-Tag: noindex, nofollow`. `/robots.txt` on staging is answered by the Worker with `Disallow: /`, overriding the production file.

**Session token**
- Format: `v1.<expiryUnixSeconds>.<base64url(HMAC-SHA256(key, "v1." + expiry))>`.
- The HMAC key is derived from `STAGING_PASSWORD`. **Changing the password invalidates every existing session.** That is intended.
- Lifetime comes from `AUTH_SESSION_HOURS` (default 168, which is 7 days).
- Verification checks the format, the expiry, and the signature. Use a constant-time comparison (`crypto.subtle.timingSafeEqual`, or comparing HMACs).
- The password check itself is also constant-time.

**Cookie**
- Name `site_auth`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Max-Age` equal to the session lifetime.
- `Secure` is set whenever the request is HTTPS. It is omitted for plain `http://localhost`, so local preview works in every browser.

**`next` handling**
- Accept only same-origin relative paths: must start with `/` and must not start with `//` or `/\`.
- Anything else falls back to `/`. This prevents open redirects.

**Login form (default and override)**
- The default is `worker/login.html`, bundled with the Worker. It is a static, unbranded page with neutral styling, inline CSS, no external requests, a single password field, a submit button, and an error area.
- **Override contract:** if the built site contains `/__auth/login.html` (Astro: `public/__auth/login.html`), the Worker fetches it from `env.ASSETS` and uses it instead of the default.
  - **URL trap:** with the default `html_handling` (`auto-trailing-slash`), that file is served at `/__auth/login`, and a request for `/__auth/login.html` gets a 307 redirect. The Worker must fetch the clean URL (`/__auth/login`) from `env.ASSETS` and treat only a `200` as "override present". A test must cover this.
  - The override must live in `public/`, not `src/pages/`. Astro ignores `_`-prefixed entries in `src/pages`, and the docs must say so.
  - The override must:
  - contain `<form method="POST" action="/__auth/login">`;
  - contain `<input type="password" name="password">`;
  - contain `<input type="hidden" name="next" value="{{NEXT}}">`;
  - optionally contain `{{ERROR}}` where the error message should appear (it's replaced with an empty string when there's no error);
  - load any CSS, fonts, or images from `/__auth/…` (public on staging), or inline them.
- The Worker HTML-escapes the values it substitutes into `{{NEXT}}` and `{{ERROR}}`.
- `docs/staging-login.md` documents this contract with a copy-paste example.

**Local testing of the login:** `npm run preview:staging` (4.4) builds the site and runs `wrangler dev --env staging`. That loads `STAGING_PASSWORD` from `.dev.vars.staging`, so the real login flow runs locally.

### 4.4 npm scripts

| Script | Does |
|---|---|
| `dev` | `astro dev`: fast editing with hot reload. **No Worker, no login.** The docs say so plainly. Framework-specific. |
| `build` | `astro build` → `dist/`. Framework-specific. |
| `preview` | `build`, then `wrangler dev --env production`: the built site in Cloudflare's local runtime, behaving like production. |
| `preview:staging` | `build`, then `wrangler dev --env staging`: same, with the login enforced. |
| `test` | Worker tests (4.7). |
| `check` | Runs `check:worker`, `check:site`, and `check:docs`. CI runs this. |
| `check:worker` | `tsc --noEmit` for `worker/` and `scripts/`. Framework-neutral. |
| `check:site` | `astro check`. Framework-specific; a swap replaces or removes it. |
| `check:docs` | The docs consistency check (§4.8). |
| `setup` | Interactive first-run setup (4.5). |
| `publish:staging` | `node scripts/publish.mjs staging` |
| `publish:production` | `node scripts/publish.mjs production` |

`publish.mjs <env>` runs, in order: preflight (4.6) → `npm run build` → `wrangler deploy --env <env>`. Finally it prints the deployed URL.

### 4.5 Setup script (`npm run setup`) — the "rename it" step

Interactive. Written in Node with no extra dependencies. Safe to re-run: it shows current values as defaults.

1. **Project slug:** lowercase letters, digits, and hyphens. Short enough that `<slug>-production` is a valid Worker name; the builder confirms the current limit. Writes the slug to `wrangler.jsonc` `name` and to `package.json` `name`, and updates the site title placeholder in `src/`.
2. **Cloudflare login:** if `wrangler whoami` shows no login, offer to run `wrangler login`.
3. **Account ID:** if `wrangler whoami` lists exactly one account, offer it. If it lists several, let the user pick. Writes `account_id`.
4. **Staging password:** offer a generated strong password, or let the user type one. Writes `.dev.vars.staging`, which is gitignored. Offers to upload it with `wrangler secret put STAGING_PASSWORD --env staging`, passing the value over stdin, never as an argument and never logged.
5. Prints a summary and the next commands (`npm run preview:staging`, `npm run publish:staging`).

### 4.6 Publishing

**Laptop (default)**
- Preflight checks; each failure prints a plain fix-it message and exits non-zero:
  - Node version meets `engines`.
  - The project has been renamed: the slug isn't the template's default.
  - `account_id` is set.
  - Authenticated: `wrangler whoami` succeeds, or `CLOUDFLARE_API_TOKEN` is present.
  - **Staging only:** `STAGING_PASSWORD` is set on the staging Worker. `secrets.required` also enforces this at deploy time.
- **First staging deploy:** `secrets.required` blocks a deploy to a Worker that doesn't exist yet. So the staging password must be uploaded first, through `npm run setup`, which runs `wrangler secret put`; that creates the staging Worker as a draft. Preflight detects "Worker not found" and tells the user to run setup. The docs state this order. The same applies before the first CI deploy.
- **Production confirmation:** `publish:production` asks "Deploy <slug> to PRODUCTION? (y/N)". The prompt is skipped when `CI=true` or `--yes` is passed.

**GitHub Actions (opt-in)**
- `.github/workflows/deploy.yml` ships in the repo but **does nothing until enabled**. Each job is gated on the repository variable `DEPLOY_ENABLED == 'true'`.
- Triggers:
  - push to `staging` → deploy staging;
  - push to `main` → deploy production;
  - `workflow_dispatch` with an env choice.
- Steps: `actions/checkout@v7` → `actions/setup-node@v7` (Node from `.nvmrc`) → `npm ci` → `npm test` → `npm run check` → `npm run publish:<env> -- --yes`. Use plain `npx wrangler` (via the publish script) rather than `cloudflare/wrangler-action`; both are supported by Cloudflare.
- Uses GitHub **Environments** named `staging` and `production`, so production can optionally require a reviewer. There is one `concurrency` group per environment.
- Secrets in GitHub: `CLOUDFLARE_API_TOKEN` only. The account comes from `account_id` in `wrangler.jsonc`, the single source of truth, so there is no `CLOUDFLARE_ACCOUNT_ID` secret.
  - The staging password is **not** stored in GitHub. It is set once on the Cloudflare Worker and persists across deploys.
- `docs/github-actions.md` walks through these steps:
  - **Create a token:** use the dashboard template "Edit Cloudflare Workers", scoped to the one account.
    - That template grants more than deploys need: KV, R2, Tail, and Workers Routes.
    - The docs list the inferred minimum as an option: Account → Workers Scripts Edit and Account → Account Settings Read. Add Zone → Workers Routes Edit only for custom domains.
    - Cloudflare doesn't document a minimum, so the docs must label it "verify with a test deploy".
  - Add the secret to GitHub.
  - Set `DEPLOY_ENABLED`.
  - Create the `staging` branch.
  - Optionally, add a production reviewer.
- The docs briefly mention Cloudflare's dashboard Git integration (Workers Builds) as an alternative, without supporting it as a first-class path.

### 4.7 Testing

- Worker tests use Vitest 5 with `@cloudflare/vitest-plugin`, the current replacement for `@cloudflare/vitest-pool-workers`, so they run in the real Workers runtime. The plugin silently enables `nodejs_compat` in tests, so the Worker must use web-standard APIs only. A Node-side test asserts that `worker/` has no `node:` imports. Required cases:
  - staging with no session → `401` login page, `next` populated, noindex header present;
  - wrong password → `401` and the error rendered;
  - right password → cookie set and `303` to a sanitised `next`;
  - valid cookie → asset served;
  - expired token, tampered token, and a token signed with an old password → login page;
  - missing `STAGING_PASSWORD` → `503` on every path;
  - open-redirect attempts (`//evil.com`, `https://evil.com`, `/\evil`) → redirect to `/`;
  - override present → override used, placeholders substituted and escaped; override absent → default used;
  - `/__auth/<asset>` served without a session;
  - staging `/robots.txt` → `Disallow: /`;
  - `AUTH_MODE=off` → pass-through: a non-navigation miss goes to `env.ASSETS`, and `/__auth/login` returns 404.
- `npm run check` covers types. There are no site content tests; the template has no content to test.

### 4.8 Documentation

**`AGENTS.md`** is the authoritative guide for AI sessions. It must be complete enough that a fresh session can do any routine task without reading the rest of the repo. Sections:

1. **What this repo is**, in one paragraph, plus the mental model: Astro builds `dist/`, a small Worker guards staging, and production serves files directly.
2. **Commands table**, matching §4.4 exactly.
3. **File map:** what each top-level file and folder is for, and which files a site author normally edits (`src/`, `public/`) versus which they normally don't (`worker/`, `scripts/`, `wrangler.jsonc`).
4. **Rules (must / must not):**
   - never commit secrets or `.dev.vars*`;
   - never run a bare `wrangler deploy`; always use the publish scripts;
   - never deploy to production unless the user explicitly asks;
   - always run `npm run build` and `npm test`, and preview locally, before publishing;
   - `vars` and `secrets` must be set per environment;
   - don't weaken fail-closed behaviour;
   - don't put secret values in command arguments.
5. **Recipes:** step-by-step lists for each of these:
   - first-time setup / rename;
   - add a page;
   - change site styling;
   - customise the login page;
   - change the staging password;
   - add a custom domain;
   - enable GitHub Actions;
   - swap the framework;
   - add an environment variable;
   - roll back a bad deploy.
6. **How to verify a change**, per type of change: content, Worker, config, deploy.
7. **Troubleshooting**, as a short table pointing to `docs/troubleshooting.md`.

**`CLAUDE.md`** contains `@AGENTS.md`, the documented Claude Code import syntax, and nothing else of substance. Claude Code reads `AGENTS.md` natively only when no `CLAUDE.md` exists, so the import keeps both cases working, and Claude never loads it twice.

**`README.md`**: what it is, prerequisites, the five-step quickstart (clone → `npm install` → `npm run setup` → `npm run preview:staging` → `npm run publish:staging`), and links to `docs/`.

**`docs/`**, one guide per topic:
- `cloudflare-account.md`: create a free account, `wrangler login`, find the account ID, create an API token for CI, multiple accounts.
- `environments.md`: what staging and production are, the Worker names, the URLs, per-env vars and secrets.
- `local-development.md`: `dev` vs `preview` vs `preview:staging`, and `.dev.vars.staging`.
- `staging-login.md`: how the login works, changing the password, session length, the override contract with an example, and security notes (shared password, no rate limiting, use a long password).
- `publishing.md`: the laptop flow, the preflight checks, production confirmation, and rollback (`wrangler rollback --env …`).
- `github-actions.md`: §4.6.
- `custom-domains.md`: per-env custom domain setup.
- `swapping-the-framework.md`: change `dev`, `build`, and `check:site`; change `assets.directory`; replace `astro.config.mjs`/`tsconfig.json`, `src/`, and `public/`; make sure the new build emits `404.html` and copies `__auth/` through to the output; then run the checklist.
- `troubleshooting.md`: common errors and fixes.

All docs must use the same script names, file paths, and env names. The builder should add a simple consistency check as `check:docs`: a script that asserts that every `npm run <x>` mentioned in `AGENTS.md`, `README.md`, and `docs/` exists in `package.json`.

## 5. Left to the builder

- Exact Astro starter content: a minimal, tasteful placeholder home page, 404 page, and base layout.
- Visual design of the default login page, within the stated constraints (unbranded, neutral, inline CSS, no external requests).
- How `login.html` is bundled into the Worker (a text-module import or an inlined string).
- The exact HMAC key derivation from the password (for example HMAC over a fixed label). It must meet the property that changing the password invalidates sessions.
- The template's default slug, used by the "not renamed" preflight check.
- Which GitHub Action steps to use: `cloudflare/wrangler-action` or plain `npx wrangler`.
- Whether to add a guard that makes a bare top-level `wrangler deploy` fail.

## 6. Calls made by Claude (not explicitly confirmed by the user)

- `npm run dev` is plain `astro dev` (no Worker). Real-runtime testing is `preview` / `preview:staging`. *This corrects an earlier conversational claim that `dev` ran in Cloudflare's runtime.*
- Production uses `run_worker_first: ["/__auth/*"]`, so page requests never run code.
- Fail closed with `503` when the password is missing.
- Unauthenticated staging requests get the login page **in place** with `401`, rather than a redirect.
- Token signed with a key derived from the password; 7-day default session.
- `noindex` on all staging responses plus a staging-only `robots.txt`.
- Assets under `/__auth/` are public on staging so a login override can be styled.
- `account_id` committed in `wrangler.jsonc`.
- `preview_urls: false`.
- Interactive `npm run setup` as the rename step.
- Production publish confirmation prompt (skipped in CI / with `--yes`).
- GitHub workflow shipped but gated on `DEPLOY_ENABLED`; branch mapping `staging` → staging and `main` → production; staging password not stored in GitHub.
- `CLAUDE.md` as a pointer only.
- Docs consistency check in `npm run check`.
- `check` split into `check:worker` / `check:site` / `check:docs`, so a framework swap leaves the Worker checks untouched.
- No `CLOUDFLARE_ACCOUNT_ID` GitHub secret; `wrangler.jsonc` is the only source of the account.
