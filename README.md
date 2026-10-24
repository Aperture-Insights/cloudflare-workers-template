# Cloudflare website template

A starter repository for a static website on Cloudflare Workers. Clone it, rename it, add your content, and publish.

- **Two environments by default.** `staging` sits behind a shared password. `production` is public.
- **Static and fast.** Astro builds the site. In production, pages are served straight from Cloudflare's asset layer, and no Worker code runs for them.
- **Low-effort publishing.** Use `npm run publish:staging` and `npm run publish:production` from your laptop, or turn on the included GitHub Actions workflow.
- **Free plan.** No payment method or Zero Trust needed.

AI coding assistants should read [`AGENTS.md`](AGENTS.md). It is the complete guide to working in this repo.

## Prerequisites

- **Node 26** (`.nvmrc` is `26`; with nvm, run `nvm use`) and npm.
- A free **Cloudflare account**: see [docs/cloudflare-account.md](docs/cloudflare-account.md).
- Git. A GitHub account is needed only for automatic deploys.

## Quickstart

1. **Clone** the template into a new folder, named after your site:
   ```sh
   git clone <this-repo-url> my-site
   cd my-site
   ```
2. **Install** the dependencies:
   ```sh
   npm install
   ```
3. **Set up and rename.** This step is interactive:
   ```sh
   npm run setup
   ```
   It asks for:
   - a project slug, such as `my-site`;
   - the site title;
   - a Cloudflare login (it opens your browser if you are not logged in);
   - which Cloudflare account to use;
   - a staging password. Press Enter to generate a strong one. It is shown once, so save it in a password manager.

   When it asks whether to upload the password to Cloudflare, answer **yes**. You can't publish staging until the password is uploaded, and the upload also creates the staging Worker.

   Setup shows your current answers as defaults, so it is safe to run again. It writes nothing until you have answered every question.
4. **Preview staging locally**, with the real login:
   ```sh
   npm run preview:staging
   ```
   Open `http://localhost:8787` and log in with the staging password. Press `x` or Ctrl+C to stop.
5. **Publish staging:**
   ```sh
   npm run publish:staging
   ```
   Wrangler prints the URL, which looks like `https://my-site-staging.<your-subdomain>.workers.dev`.

When staging looks right, run `npm run publish:production`. It asks you to confirm first.

Commit the files that setup changed (`package.json`, `wrangler.jsonc`, `src/site.config.ts`). `.dev.vars.staging` holds your password, and git ignores it. Never commit it.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Fast editing with hot reload at `http://localhost:4321`. No login and no Worker. |
| `npm run build` | Builds the site into `dist/`. |
| `npm run preview` | Builds, then serves it locally like production at `http://localhost:8787`. |
| `npm run preview:staging` | Builds, then serves it locally like staging, with the password login. |
| `npm test` | Runs the Worker and script tests. |
| `npm run check` | Type checks and the docs check (`check:worker`, `check:site`, `check:docs`). |
| `npm run setup` | First-run setup and rename. Safe to re-run. |
| `npm run publish:staging` | Checks, builds and deploys staging. |
| `npm run publish:production` | Checks, asks for confirmation, builds and deploys production. |
| `npm run types` | Regenerates the Workers runtime types. |

Your content lives in `src/` (pages, layout, `site.config.ts`) and `public/` (files copied as-is). You normally don't need to touch `worker/`, `scripts/` or `wrangler.jsonc`.

## Guides

| Guide | Covers |
|---|---|
| [Cloudflare account](docs/cloudflare-account.md) | Sign-up, `wrangler login`, account ID, API token, multiple accounts |
| [Environments](docs/environments.md) | Staging and production, Worker names, URLs, vars and secrets |
| [Local development](docs/local-development.md) | `dev` vs `preview` vs `preview:staging`, `.dev.vars.staging` |
| [Staging login](docs/staging-login.md) | How the password gate works, changing the password, a custom login page, security notes |
| [Publishing](docs/publishing.md) | Laptop publishing, preflight checks, production confirmation, rollback |
| [GitHub Actions](docs/github-actions.md) | Turning on automatic deploys |
| [Custom domains](docs/custom-domains.md) | Putting each environment on your own domain |
| [Swapping the framework](docs/swapping-the-framework.md) | Replacing Astro with another static site generator |
| [Troubleshooting](docs/troubleshooting.md) | Common errors and fixes |
