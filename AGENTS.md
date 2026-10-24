# AGENTS.md

This is the guide for AI coding sessions. It is complete enough for any routine job, so you should not need to read the rest of the repo first. Humans should start with `README.md` and the guides in `docs/`.

## 1. What this repo is

This is a clone-rename-publish template for a static website on **Cloudflare Workers with Static Assets** (not Pages). Astro builds the site into `dist/`. Every project has two environments, `staging` and `production`. They deploy as two Workers named `<slug>-staging` and `<slug>-production`, and each starts on a `*.workers.dev` URL. Staging sits behind one shared password. Production serves plain files. You publish from a laptop with `npm run publish:staging` and `npm run publish:production`. A GitHub Actions workflow ships too, switched off until you enable it.

### Mental model

- **Build:** `npm run build` runs `astro build` and writes `dist/`. Both Workers serve `dist/` through the `ASSETS` binding.
- **Staging** (`AUTH_MODE: "password"`): `run_worker_first: true`, so every request goes through `worker/index.ts`.
  - `STAGING_PASSWORD` missing or empty: `503` with `Staging password not configured.` on every path. Staging fails closed.
  - `/robots.txt`: `200`, `User-agent: *` / `Disallow: /`. No session needed.
  - `GET` or `HEAD /__auth/login`: the login page, `200`. `POST /__auth/login`: checks the password. A match sets the `site_auth` cookie and returns `303` to `next`. A miss returns `401` with the login page showing `Incorrect password.`. Any other method returns `405` with `Allow: GET, POST`.
  - `GET /__auth/logout`: clears the cookie and returns `303` to `/`. Any other method returns `405` with `Allow: GET`.
  - Other `/__auth/*` files, such as a custom login page's CSS, are public without a session, but **only for plain paths**. A path that contains `%`, `\`, `..` or `//` needs a session.
  - Anything else: a valid session cookie serves the asset. Otherwise the login page is returned **in place** with `401`. The URL does not change, and `next` is set to the requested path and query.
  - Every staging response has `X-Robots-Tag: noindex, nofollow`. Content responses have `Cache-Control: private, no-store`. Login, 401, 503 and redirect responses have `Cache-Control: no-store`. An unexpected error returns `500` `Internal error.` and never content.
- **Production** (`AUTH_MODE: "off"`): the asset layer serves pages and 404s. Worker code does not run for page requests. The Worker runs only for:
  - `/__auth/*`, which is listed in `run_worker_first` and returns a plain `404` `Not found`. The login override is never public.
  - **non-navigation** requests that match no file (fetch, XHR, curl). The Worker hands them to `env.ASSETS.fetch()`, which returns `404.html` with status `404`.
  - Browser **navigation** requests that match no file get `404.html` straight from the asset layer, without the Worker. So a route that the browser must reach in Worker code on production has to be added to `run_worker_first`.

## 2. Commands

Run everything from the repo root. Node 26 is required (`.nvmrc` is `26`, `engines.node` is `>=26`). Use npm only.

| Command | What it does |
|---|---|
| `npm run dev` | `astro dev`: fast editing with hot reload at `http://localhost:4321`. **No Worker and no login.** Framework-specific. |
| `npm run build` | `astro build`, writing to `dist/`. Framework-specific. |
| `npm run preview` | Builds, then runs `wrangler dev --env production`: the built site in Cloudflare's local runtime at `http://localhost:8787`, behaving like production. |
| `npm run preview:staging` | Builds, then runs `wrangler dev --env staging`: the same, with the password login enforced. Reads `STAGING_PASSWORD` from `.dev.vars.staging`. |
| `npm test` | `vitest run`: Worker tests in the real Workers runtime (`worker/test/`) and Node tests for the scripts (`scripts/test/`). |
| `npm run check` | Runs `check:worker`, then `check:site`, then `check:docs`. CI runs it. |
| `npm run check:worker` | `tsc` type check of `worker/` and `scripts/`. Framework-neutral. |
| `npm run check:site` | `astro check`. Framework-specific: a framework swap replaces or removes it. |
| `npm run check:docs` | `node scripts/check-docs.mjs`: fails if `AGENTS.md`, `README.md` or `docs/` mention an `npm run` script that `package.json` does not define. |
| `npm run setup` | Interactive first-run setup and rename: slug, site title, Cloudflare login, `account_id`, staging password, password upload. Safe to re-run. |
| `npm run publish:staging` | `node scripts/publish.mjs staging`: preflight, `npm run build`, `wrangler deploy --env staging`. |
| `npm run publish:production` | `node scripts/publish.mjs production`: preflight, a `Deploy <slug> to PRODUCTION? (y/N)` prompt, build, `wrangler deploy --env production`. Add `-- --yes` to skip the prompt. |
| `npm run types` | `wrangler types worker/worker-configuration.d.ts --include-env=false`: regenerates the Workers runtime types. Run it after changing `compatibility_date` or flags. The `Env` interface is hand-written in `worker/env.d.ts`. |

Other useful commands:

| Command | What it does |
|---|---|
| `npx wrangler whoami` | Shows the Cloudflare login and account IDs. |
| `npx wrangler secret list --env staging` | Lists secret names on the staging Worker. Values are never shown. |
| `npx wrangler secret put STAGING_PASSWORD --env staging` | Sets the staging password. Type it at the prompt; never pass it as an argument. Takes effect immediately. |
| `npx wrangler deployments list --env <env>` | Lists recent deployments. |
| `npx wrangler rollback --env <env>` | Rolls back to an earlier version. |

## 3. File map

| Path | Purpose | Normally edited? |
|---|---|---|
| `src/` | The Astro site. `src/pages/` holds pages (`index.astro`, `404.astro`). `src/layouts/Base.astro` is the shared layout and holds the global styles. `src/site.config.ts` holds the site title and description. | **Yes**: site authors work here. |
| `public/` | Files copied as-is into `dist/`: `robots.txt` (production, allow all) and `favicon.svg`. An optional login override goes in `public/__auth/`. | **Yes** |
| `astro.config.mjs`, `tsconfig.json` | Astro config (`output: 'static'`) and the site's TypeScript config. | Sometimes |
| `wrangler.jsonc` | Worker names, `account_id`, the two environments, vars, required secrets, asset settings and custom domains. | Rarely: setup writes `name` and `account_id`. |
| `worker/` | The Worker: `index.ts` (routing), `auth.ts` (password check, session token, cookies), `login.ts` + `login.html` (the default login page), `env.d.ts` (the `Env` type), `worker-configuration.d.ts` (generated runtime types), `test/` (Worker tests). | **No**, unless the task is about the Worker itself. |
| `scripts/` | `setup.mjs`, `preflight.mjs`, `publish.mjs`, `check-docs.mjs`, shared helpers in `lib/`, Node tests in `test/`. | **No** |
| `.github/workflows/deploy.yml` | Opt-in CI deploy, gated on the repository variable `DEPLOY_ENABLED`. | Rarely |
| `.dev.vars.staging` | Local copy of `STAGING_PASSWORD` for `npm run preview:staging`. Git-ignored and owner-read-only. Written by setup. | Only through setup |
| `.dev.vars.staging.example` | Committed example: `STAGING_PASSWORD=change-me`. | No |
| `package.json` | Scripts and exact pinned devDependencies. `"private": true`. | Rarely |
| `.nvmrc` | `26` | No |
| `vitest.config.ts` | Two test projects: `worker` (Workers runtime) and `scripts` (Node). | No |
| `AGENTS.md` | This file. The single source of AI guidance. | Yes, when behaviour changes. |
| `CLAUDE.md` | Imports this file (`@AGENTS.md`). Holds no other guidance. | No |
| `README.md`, `docs/` | Human quickstart and topic guides. `docs/superpowers/` holds the design history and is not user documentation. | Yes, when behaviour changes. |

Generated folders, all git-ignored: `node_modules/`, `dist/`, `.astro/`, `.wrangler/`.

## 4. Rules

You must:

- Run `npm run build` and `npm test`, and preview locally (`npm run preview:staging` or `npm run preview`), before publishing.
- Publish only with `npm run publish:staging` or `npm run publish:production`.
- Set `vars` and `secrets` separately in **each** environment in `wrangler.jsonc`. They are not inherited from the top level.
- Add any new route that the browser must reach in Worker code on production to the production `run_worker_first` list. Browser navigation misses skip the Worker.
- Keep Worker code to web-standard APIs only: no `node:` imports. A guard test enforces this, because the test plugin silently enables `nodejs_compat` and would hide a violation.
- Keep `AGENTS.md`, `README.md` and `docs/` in step with the code. Use the same script names, paths and env names everywhere, and run `npm run check:docs`.
- Use only the pinned versions in `package.json`. To upgrade anything, check current official docs (never memory), then re-run `npm test` and `npm run check` and preview both environments.

You must not:

- Commit secrets, API tokens or any `.dev.vars*` file (only `.dev.vars.staging.example` is committed).
- Run a bare `wrangler deploy`, or any `wrangler deploy` without `--env`. The top-level Worker is never deployed.
- Deploy to production unless the user explicitly asks for it in this session.
- Weaken the fail-closed behaviour: staging with no password must return `503`, and errors must return `500`, never content.
- Put secret values in command arguments or logs. Pass them through stdin or an interactive prompt.
- Use screenshots, browser automation or visual comparison to verify template behaviour. Verify with tests, `curl` and command output. Visual design is the responsibility of each website and its author.

## 5. Recipes

Each recipe ends with a command that verifies it worked.

### First-time setup / rename

1. `npm install` (Node 26; run `nvm use` if you use nvm).
2. `npm run setup` (interactive; the user must answer the prompts). It asks for:
   - the project slug: lowercase letters, digits and hyphens, at most 52 characters, and not `cloudflare-website-template`;
   - the site title;
   - a Cloudflare login, if there is none (it offers to run `wrangler login`);
   - the account (it offers the account from `wrangler whoami`, or a list if there are several);
   - the staging password: keep the existing one, type one, or press Enter to generate 24 random characters;
   - whether to upload the password to Cloudflare.

   Setup shows current values as defaults and is safe to re-run. It writes files only after the last prompt: `package.json` `name`, `wrangler.jsonc` `name` and `account_id`, the `title` in `src/site.config.ts`, and `.dev.vars.staging` (owner-read-only). A generated password is printed once, and only in an interactive terminal.
3. Answer **yes** to the upload. It runs `wrangler secret put STAGING_PASSWORD --env staging` over stdin, which also creates the staging Worker. This must happen before the first `npm run publish:staging` and before the first CI deploy.
4. Commit `package.json`, `wrangler.jsonc` and `src/site.config.ts`. Never commit `.dev.vars.staging`.
5. Verify: `npx wrangler secret list --env staging` lists `STAGING_PASSWORD`, and `grep -E '"(name|account_id)"' wrangler.jsonc` shows the new slug and account.

### Add a page

1. Create `src/pages/<name>.astro`. Astro builds it to `dist/<name>/index.html`, which is served at `/<name>/` (`/<name>` redirects there with a `307`). `src/pages/blog/post.astro` is served at `/blog/post/`. A Markdown file (`src/pages/<name>.md`) also works.
2. Use the shared layout:
   ```astro
   ---
   import Base from "../layouts/Base.astro";
   ---

   <Base title="About">
     <h1>About</h1>
     <p>Content here.</p>
   </Base>
   ```
3. Link to it from another page if needed, for example `<a href="/about/">About</a>`.
4. Verify: `npm run check:site && npm run build && ls dist/<name>/index.html`.

### Change site styling

1. Global styles live in the `<style>` block in `src/layouts/Base.astro`. Astro scopes a component's `<style>` to that component's own markup, so for rules that must reach page content, use `<style is:global>` or put a stylesheet in `public/` and link it from `Base.astro`.
2. Per-page styles go in a `<style>` block in that page.
3. The site title and description live in `src/site.config.ts`.
4. Use `npm run dev` for fast iteration.
5. Verify: `npm run check:site && npm run build`.

### Customise the login page

1. Create `public/__auth/login.html`. It must be in `public/`, not `src/pages/`: Astro ignores `_`-prefixed entries in `src/pages/`.
2. It must contain:
   - `<form method="POST" action="/__auth/login">`
   - `<input type="password" name="password">`
   - `<input type="hidden" name="next" value="{{NEXT}}">`
   - optionally `{{ERROR}}` where the error should appear (empty when there is no error).
3. Load CSS, fonts and images from `/__auth/...` (for example `public/__auth/login.css`), or inline them. Use plain file names: no `..`, `%`, `\` or `//` in paths.
4. A complete copy-paste example is in `docs/staging-login.md`.
5. Verify: `npm run build && ls dist/__auth/login.html`, then run `npm run preview:staging` and, in a second terminal, `curl -s http://localhost:8787/ | head -20` shows your page (status `401`).

### Change the staging password

1. Run `npm run setup`. Keep the other answers, answer **no** to "Keep the existing staging password", then type a new one or press Enter to generate one, and answer **yes** to the upload. This updates `.dev.vars.staging` and the staging Worker.
2. Alternatively, run `npx wrangler secret put STAGING_PASSWORD --env staging`, type the password at the prompt, and update `STAGING_PASSWORD=` in `.dev.vars.staging` by hand.
3. The change takes effect immediately with no publish needed, and it logs everyone out.
4. Verify: `npx wrangler secret list --env staging` lists `STAGING_PASSWORD`, and logging in at the staging URL with the new password works.

### Add a custom domain

1. The domain must be an active zone in the same Cloudflare account, and the hostname must not already have a CNAME record.
2. In `wrangler.jsonc`, add `routes` under the environment, for example under `env.production`:
   ```jsonc
   "routes": [{ "pattern": "example.com", "custom_domain": true }]
   ```
3. To turn off the `*.workers.dev` URL as well, set that environment's `workers_dev` to `false`. The template sets it to `true` explicitly.
4. Publish that environment, for example `npm run publish:production` (only if the user asked for production).
5. Verify: `curl -sI https://example.com/ | head -1` returns `HTTP/2 200`. For staging, expect `401` and an `x-robots-tag: noindex, nofollow` header.

Details: `docs/custom-domains.md`.

### Enable GitHub Actions

1. Run `npm run setup` once from a laptop and upload the password, so that the staging Worker exists.
2. Create a Cloudflare API token from the **Edit Cloudflare Workers** template, scoped to the one account.
3. In the GitHub repository, add the secret `CLOUDFLARE_API_TOKEN`, and set the repository variable `DEPLOY_ENABLED` to `true`.
4. Optionally, in the `production` GitHub Environment, add a required reviewer and a deployment-branch rule allowing only `main`.
5. Create and push the `staging` branch: `git push origin HEAD:staging`. Pushes to `staging` deploy staging; pushes to `main` deploy production.
6. Verify: `gh run list --workflow deploy.yml --limit 1` shows a successful run.

Details: `docs/github-actions.md`.

### Swap the framework

1. Change the `dev`, `build` and `check:site` scripts in `package.json`. Remove `check:site` from `check` if the new framework has no checker.
2. Set `assets.directory` in **both** environments in `wrangler.jsonc` to the new output folder.
3. Replace `astro.config.mjs`, `tsconfig.json`, `src/` and `public/`, and remove the Astro packages.
4. Make sure the build emits `404.html` at the output root and copies `__auth/` through to the output.
5. Do not touch `worker/`, `scripts/` or the Worker tests.
6. Verify: `npm run build`, then check that `404.html` and `__auth/` (if used) are in the output folder, then `npm test && npm run check`, then `npm run preview:staging`.

Details: `docs/swapping-the-framework.md`.

### Add an environment variable

Vars and secrets reach only the Worker. The static pages are built before deploy and cannot read them at runtime.

1. **Plain var:** add it to `vars` in **both** `env.staging` and `env.production` in `wrangler.jsonc`. Vars are not inherited.
2. **Secret:** run `npx wrangler secret put <NAME> --env <env>` and type the value at the prompt. For local preview, add `<NAME>=value` to `.dev.vars.<env>`. Add the name to that environment's `secrets.required`; otherwise `wrangler dev` will not load it locally, because only listed keys load. A listed secret also makes deploys fail until it is set.
3. If Worker code reads it, add it to the `Env` interface in `worker/env.d.ts`.
4. Verify: `npm run check:worker && npm test`.

### Roll back a bad deploy

1. Run `npx wrangler deployments list --env <env>` (`staging` or `production`) to see recent deployments and their version IDs.
2. Run `npx wrangler rollback --env <env>`. Pick the version at the prompt, or pass a version ID: `npx wrangler rollback <version-id> --env <env>`. A rollback restores the Worker and its static assets.
3. Fix the problem in git, and publish again when ready.
4. Verify: `npx wrangler deployments list --env <env>` shows the rollback as the latest deployment.

## 6. How to verify a change

| Change | Verify with |
|---|---|
| Content or styling (`src/`, `public/`) | `npm run check:site && npm run build`, then `npm run preview` and `curl -si http://localhost:8787/<path> \| head -5` |
| Worker (`worker/`) | `npm test && npm run check:worker`, then `npm run preview:staging` and `curl -si http://localhost:8787/` (expect `401` with `X-Robots-Tag`) |
| Scripts (`scripts/`) | `npm test && npm run check:worker` |
| Config (`wrangler.jsonc`, `package.json`) | `npm test && npm run check`, then `npm run preview` and `npm run preview:staging` |
| Docs | `npm run check:docs` |
| Deploy | Staging: `curl -si https://<slug>-staging.<subdomain>.workers.dev/ \| head -5` shows `401` and `x-robots-tag`. Production: the same URL with `-production` shows `200`. |

To log in to a local staging preview with curl, without putting the password in an argument:

```sh
sed -n 's/^STAGING_PASSWORD=//p' .dev.vars.staging | tr -d '\n' \
  | curl -si -c /tmp/jar --data-urlencode password@- http://localhost:8787/__auth/login
curl -si -b /tmp/jar http://localhost:8787/
```

The first command returns `303` with `Set-Cookie: site_auth=...`. The second returns `200`.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `Preflight failed: ... not renamed` or `... no account_id` | `npm run setup` |
| `The staging Worker does not exist yet` / `Worker ... not found` | `npm run setup` and answer yes to the upload |
| `Not logged in to Cloudflare` | `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN` |
| `STAGING_PASSWORD is not set on the staging Worker` | `npx wrangler secret put STAGING_PASSWORD --env staging` |
| Local staging returns `503 Staging password not configured.` | Create `.dev.vars.staging` (run `npm run setup`) |
| Custom login page not used | It must be `public/__auth/login.html`, not in `src/pages/` |
| `Node ... is too old` | `nvm use` (Node 26) |
| Install warnings about install scripts for `esbuild`/`workerd` | Harmless; see `docs/troubleshooting.md` |

Full list: `docs/troubleshooting.md`.
