# Troubleshooting

## Install

### Warnings about install scripts for `esbuild` or `workerd`

npm 11 can warn during `npm install` or `npm ci` that packages have install scripts not covered by `allowScripts` (for example `esbuild` and `workerd`, both `postinstall: node install.js`).

**This is harmless for this template.** Wrangler, `wrangler dev` and the Worker tests were verified to run with these warnings. Do nothing unless something actually fails.

If `npm run preview`, `npm test` or `npm run build` fails because `esbuild` or `workerd` is missing its binary:

1. See which packages are pending: `npm approve-scripts --allow-scripts-pending`.
2. Approve them: `npm approve-scripts esbuild workerd`. `npm help install-scripts` and `npm help approve-scripts` describe the options.
3. Reinstall: `rm -rf node_modules && npm install`.
4. Verify: `npm test`.

### `Unsupported engine` or `Node ... is too old`

The template needs Node 26. Run `nvm use` (it reads `.nvmrc`), or install Node 26. Verify: `node -v` prints `v26.x`.

## Setup and publishing

| Message or symptom | Cause | Fix |
|---|---|---|
| `The project is not renamed (still "cloudflare-website-template")` | Setup hasn't run | `npm run setup` |
| `wrangler.jsonc has no account_id` | Setup hasn't run, or didn't finish | `npm run setup` |
| `Not logged in to Cloudflare` | No `wrangler login` session and no `CLOUDFLARE_API_TOKEN` | `npx wrangler login` |
| `The staging Worker does not exist yet` (wrangler: `Worker "..." not found`) on `npm run publish:staging` | The password was never uploaded, so the staging Worker doesn't exist | `npm run setup` and answer **yes** to the upload |
| `STAGING_PASSWORD is not set on the staging Worker` | The Worker exists but has no password | `npx wrangler secret put STAGING_PASSWORD --env staging`, or `npm run setup` |
| `Could not list staging secrets (wrangler exited ...)` | Network, auth or permission problem | Run `npx wrangler secret list --env staging` to see wrangler's own error |
| Deploy fails saying a required secret is missing | `secrets.required` blocks deploys until `STAGING_PASSWORD` is set | Upload the password as above |
| Setup printed `Staging can't be published until the password is uploaded` | The upload was skipped or failed | Re-run `npm run setup` and answer yes to the upload |
| `Upload failed.` during setup | Not logged in, wrong account, or a network error | `npx wrangler whoami`, then re-run `npm run setup` |
| `publish:production` printed `Aborted.` | You didn't answer `y` | Run it again and answer `y` |
| CI waits at the production prompt | Should not happen: CI passes `--yes` | If you call publish elsewhere, add `-- --yes` or set `CI=true` (exactly `true`) |
| Wrangler asks you to register a `workers.dev` subdomain | The account has none yet | Choose one, or set it in the dashboard under **Workers & Pages** |
| Deployed to the wrong account | `account_id` in `wrangler.jsonc` | Re-run `npm run setup` and pick the right account |

## Local preview

| Message or symptom | Cause | Fix |
|---|---|---|
| Every request returns `503 Staging password not configured.` | `.dev.vars.staging` is missing or `STAGING_PASSWORD` is empty | `npm run setup`, or `cp .dev.vars.staging.example .dev.vars.staging && chmod 600 .dev.vars.staging` and set a value |
| `wrangler dev` warns about the compatibility date and falls back to an older one | `compatibility_date` in `wrangler.jsonc` is newer than the runtime bundled with the installed wrangler | Set it back to `2026-10-19` (the newest date wrangler 4.152.0 supports), or upgrade wrangler after checking current docs |
| `npm run dev` shows no login | Expected: `dev` is plain Astro with no Worker | Use `npm run preview:staging` |
| Port `8787` already in use | Another `wrangler dev` is running | Stop it, or run `npx wrangler dev --env staging --port 8788` after `npm run build` |

## Staging login

| Message or symptom | Cause | Fix |
|---|---|---|
| Custom login page not used | The file isn't at `dist/__auth/login.html` | Put it in `public/__auth/login.html`, not `src/pages/` (Astro ignores `_`-prefixed entries there) |
| Custom login page has no styles or images | Its files are outside `/__auth/`, or their paths contain `%`, `..`, `\` or `//` | Put them in `public/__auth/` with plain names, or inline them |
| `Incorrect password.` with the right password | `.dev.vars.staging` and the deployed secret differ | Upload the password again (see `docs/staging-login.md`) |
| Everyone was logged out | The password changed | Expected |
| `405 Method not allowed.` | The wrong HTTP method on `/__auth/login` or `/__auth/logout` | Login is `GET` or `POST`; logout is `GET` |
| `500 Internal error.` | An unexpected error in the Worker | Run `npx wrangler tail --env staging` and reproduce it |

## Production

| Message or symptom | Cause | Fix |
|---|---|---|
| `/__auth/...` returns `404 Not found` | Expected: the login page and its files are never public on production | None |
| A new Worker route works with curl but browsers get the 404 page | Browser navigation misses skip the Worker on production | Add the path to production's `run_worker_first` in `wrangler.jsonc` |
| Custom domain doesn't resolve | The zone isn't active in this account, or a CNAME already exists | See `docs/custom-domains.md` |

## Something went wrong after a deploy

Roll back: `npx wrangler deployments list --env <env>`, then `npx wrangler rollback --env <env>`. See [publishing.md](publishing.md#roll-back).
