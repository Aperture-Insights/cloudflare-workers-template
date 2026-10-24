# Cloudflare Workers website template

Start a new website on Cloudflare in minutes. Copy this template, give it your site's name, add your content, and publish. You get a password-protected **staging** site for review and a public **production** site, both on Cloudflare's free plan.

> AI coding assistants: read [`AGENTS.md`](AGENTS.md). It is the complete guide to working in this repo.

## How it works

| | Staging | Production |
|---|---|---|
| Who can see it | Only people with the shared password | Everyone |
| Search engines | Blocked | Allowed |
| Publish with | `npm run publish:staging` | `npm run publish:production` (asks you to confirm) |
| Web address | `https://<your-site>-staging.<account>.workers.dev` | `https://<your-site>-production.<account>.workers.dev`, or your own domain |

- The site is built with [Astro](https://astro.build), a static site generator. You write pages; Astro turns them into plain files in `dist/`.
- Cloudflare serves those files. On staging, a small Worker asks for the password first. On production, files are served directly.
- You can try everything on your own computer before anything goes live.
- If staging is ever misconfigured, it refuses all traffic instead of going public.

## What you need

- **Node.js 26** and npm. If you use nvm, run `nvm use` in the project folder.
- **Git**.
- A free **Cloudflare account**. No payment method is needed. See [docs/cloudflare-account.md](docs/cloudflare-account.md).
- A **GitHub account**, to host your site's code and, optionally, to deploy automatically.

## Start a new site

### 1. Make your own copy

Every site gets its own repository. Never build a site inside the template repository itself.

**Easiest:** on the [template's GitHub page](https://github.com/Aperture-Insights/cloudflare-workers-template), choose **Use this template → Create a new repository**, then clone your new repository:

```sh
git clone git@github.com:<your-org>/<your-site>.git
cd <your-site>
```

**Or by hand:** create an empty repository for your site on GitHub, then:

```sh
git clone git@github.com:Aperture-Insights/cloudflare-workers-template.git <your-site>
cd <your-site>
git remote set-url origin git@github.com:<your-org>/<your-site>.git
git push -u origin HEAD:main
```

Check it: `git remote -v` must show **your site's** repository, not `cloudflare-workers-template`.

### 2. Install

```sh
npm install
```

npm may print warnings about install scripts (`allowScripts`). They are harmless; see [Troubleshooting](docs/troubleshooting.md).

### 3. Name your site and connect Cloudflare

```sh
npm run setup
```

Setup asks a few questions:

1. **Project name**: lowercase letters, numbers and hyphens, such as `acme-site`. Your Workers will be named `acme-site-staging` and `acme-site-production`.
2. **Site title**: shown in the browser tab.
3. **Cloudflare login**: if you aren't logged in, it offers to open your browser.
4. **Cloudflare account**: pick one if you have several.
5. **Staging password**: press Enter to generate a strong one. It is shown once, so **save it in your password manager**. It is also stored in `.dev.vars.staging` on your computer. That file is private to you, and git ignores it.
6. **Upload the password to Cloudflare?** Answer **yes**. Staging can't be published until you do.

Setup is safe to run again: it shows your current answers as defaults and changes nothing until you've answered everything.

Then save the renamed files to your repository:

```sh
git add package.json package-lock.json wrangler.jsonc src/site.config.ts
git commit -m "Set up site"
git push
```

### 4. Look at it on your computer

```sh
npm run preview:staging
```

Open <http://localhost:8787> and log in with your staging password. Press Ctrl+C to stop.

### 5. Publish staging

```sh
npm run publish:staging
```

When it finishes, Wrangler prints your staging address. Share it, along with the password, with your reviewers.

### 6. Publish production

When staging looks right:

```sh
npm run publish:production
```

It asks you to type `y` to confirm. Your site is now live.

## Working on your site

**Where things go:**

| To change… | Edit… |
|---|---|
| Pages | `src/pages/`. Each file is a page: `src/pages/about.astro` becomes `/about/`. |
| Shared layout and styles | `src/layouts/Base.astro` |
| Site title | `src/site.config.ts` |
| Images, fonts, downloads | `public/`. Files are copied as-is: `public/logo.png` becomes `/logo.png`. |
| The staging login page | `public/__auth/login.html`. See [Staging login](docs/staging-login.md). |

You normally don't touch `worker/`, `scripts/` or `wrangler.jsonc`.

**While editing:** `npm run dev` gives a fast preview with live reload at <http://localhost:4321>. It skips the staging login.

**Before every publish**, run the same sequence: `npm test`, then `npm run check`, then `npm run preview:staging`, then `npm run publish:staging` or `npm run publish:production`.

**Something went wrong in production?** See [rolling back](docs/publishing.md#roll-back).

## All commands

| Command | What it does |
|---|---|
| `npm run dev` | Fast editing with live reload at `http://localhost:4321`. No login. |
| `npm run build` | Builds the site into `dist/`. |
| `npm run preview` | Builds, then serves it like production at `http://localhost:8787`. |
| `npm run preview:staging` | Builds, then serves it like staging, with the password login. |
| `npm test` | Runs the automated tests. |
| `npm run check` | Type checks and checks the docs (`check:worker`, `check:site`, `check:docs`). |
| `npm run setup` | Names the site and connects Cloudflare. Safe to re-run. |
| `npm run publish:staging` | Checks, builds and deploys staging. |
| `npm run publish:production` | Checks, asks for confirmation, builds and deploys production. |
| `npm run types` | Regenerates the Workers runtime types. Rarely needed. |

## Guides

| Guide | Read it when you want to… |
|---|---|
| [Cloudflare account](docs/cloudflare-account.md) | Sign up, log in, find your account ID, or create an API token |
| [Environments](docs/environments.md) | Understand staging and production, their names, addresses and settings |
| [Local development](docs/local-development.md) | Pick between `dev`, `preview` and `preview:staging` |
| [Staging login](docs/staging-login.md) | Change the password, brand the login page, or read the security notes |
| [Publishing](docs/publishing.md) | Understand the publish checks, or roll back a bad deploy |
| [GitHub Actions](docs/github-actions.md) | Deploy automatically when you push to GitHub |
| [Custom domains](docs/custom-domains.md) | Put staging or production on your own domain |
| [Swapping the framework](docs/swapping-the-framework.md) | Use something other than Astro |
| [Troubleshooting](docs/troubleshooting.md) | Fix an error |

## Maintaining this template

- **Enable "Use this template":** on GitHub, open the repository's **Settings** and tick **Template repository**.
- **Updating versions:** tool versions are pinned in `package.json` and Node in `.nvmrc`. Check each tool's current documentation before upgrading (never rely on memory), then run `npm test`, `npm run check` and both previews.
- **Design history:** the original design and build plan are in `docs/superpowers/`.
