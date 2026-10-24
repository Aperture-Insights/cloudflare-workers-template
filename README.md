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

1. **Make your own copy** of the template, in a new repository for your site. Do not work in a plain clone of the template: `origin` would still point at the template, and pushes would go there. Either:
   - on GitHub, choose **Use this template → Create a new repository** (if the template repo offers it), then clone your new repository:
     ```sh
     git clone <your-site-repo-url> my-site
     cd my-site
     ```
   - or create an empty repository for your site, then clone the template and point `origin` at your repository:
     ```sh
     git clone <template-repo-url> my-site
     cd my-site
     git remote set-url origin <your-site-repo-url>
     git push -u origin HEAD:main
     ```
     If your copy has no `origin` at all (`git remote -v` prints nothing), add it instead: `git remote add origin <your-site-repo-url>`.

   Verify: `git remote -v` shows your site's repository, not the template.
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
   - whether to run `wrangler login`, if you are not logged in to Cloudflare (it asks first, then opens your browser);
   - which Cloudflare account to use;
   - a staging password. Press Enter to generate a strong one (24 random characters). If you type one shorter than 16 characters, setup warns you and asks you to confirm. A generated password is printed once, and only in an interactive terminal, so save it in a password manager straight away. It is also saved to `.dev.vars.staging`, readable only by you.

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
   Wrangler prints the URL, which looks like `https://my-site-staging.<account-subdomain>.workers.dev`, where `<account-subdomain>` is your account's `workers.dev` subdomain. You can also find it in the Cloudflare dashboard under **Workers & Pages** → the Worker.

When staging looks right, run `npm run publish:production`. It asks you to confirm first.

Before every publish, run the same sequence: `npm test`, then `npm run check`, then `npm run preview:staging`, then `npm run publish:staging` or `npm run publish:production`. See [Publishing](docs/publishing.md#recommended-flow).

Commit the files that setup changed (`package.json`, `package-lock.json`, `wrangler.jsonc`, `src/site.config.ts`) and push them to your site's repository. `.dev.vars.staging` holds your password; setup makes it readable only by you (mode `600`), and git ignores it. Never commit it.

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
