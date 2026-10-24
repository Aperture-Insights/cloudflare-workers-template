# Publishing

You publish from your laptop with two commands. To deploy from GitHub instead, see [github-actions.md](github-actions.md).

| Command | Deploys |
|---|---|
| `npm run publish:staging` | The `<slug>-staging` Worker |
| `npm run publish:production` | The `<slug>-production` Worker, after a confirmation prompt |

Never run `wrangler deploy` yourself, and never run it without `--env`. The top-level Worker in `wrangler.jsonc` is never deployed.

## Before the first publish

1. Run `npm run setup` (see the [README](../README.md#quickstart)). It sets the slug and `account_id` and saves the staging password to `.dev.vars.staging`.
2. When setup asks whether to upload the password, answer **yes**. This runs `wrangler secret put STAGING_PASSWORD --env staging`, passing the password over stdin.

   **The upload must happen before the first `npm run publish:staging`.** The staging config lists `STAGING_PASSWORD` in `secrets.required`, so a deploy fails if the Worker doesn't have it, and that includes the very first deploy. Uploading the secret also creates the staging Worker, so the deploy that follows passes. If the upload fails or you skip it, setup prints `Staging can't be published until the password is uploaded. Re-run npm run setup.`. The same applies before the first CI deploy.
3. Verify: `npx wrangler secret list --env staging` lists `STAGING_PASSWORD`.

Production needs no secret, so its first publish needs no extra step.

About setup:

- It shows your current values as defaults, so it is safe to re-run.
- It writes files only after the last prompt. If you stop it part-way (Ctrl+C), nothing changes.
- `.dev.vars.staging` is written readable only by you.
- A generated password is printed once, and only in an interactive terminal. When output is piped, it says only that the password was saved to `.dev.vars.staging`.

## What `publish` does

`node scripts/publish.mjs <env>` runs these steps in order and stops at the first failure:

1. **Preflight checks** (`scripts/preflight.mjs`). Every failure is listed under `Preflight failed:` with a fix:

   | Check | Message if it fails | Fix |
   |---|---|---|
   | Node is 26 or newer | `Node <version> is too old: this template needs Node 26 or newer.` | `nvm use` |
   | The project is renamed | `The project is not renamed (still "cloudflare-website-template").` | `npm run setup` |
   | `account_id` is set | `wrangler.jsonc has no account_id.` | `npm run setup` |
   | Logged in. Skipped when `CLOUDFLARE_API_TOKEN` is set. | `Not logged in to Cloudflare.` | `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN` |
   | Staging only: the staging Worker exists | `The staging Worker does not exist yet.` | `npm run setup` and upload the password |
   | Staging only: `STAGING_PASSWORD` is set on it | `STAGING_PASSWORD is not set on the staging Worker.` | `npm run setup`, or `npx wrangler secret put STAGING_PASSWORD --env staging` |

2. **Production only: confirmation.** It asks `Deploy <slug> to PRODUCTION? (y/N)`. Anything but `y` or `yes` prints `Aborted.` and exits. The prompt is skipped only when you pass `--yes` (`npm run publish:production -- --yes`) or the environment variable `CI` is exactly `true`. `CI=1` or `CI=false` still asks.
3. **Build:** `npm run build`.
4. **Deploy:** `npx wrangler deploy --env <env>`. Wrangler prints the deployed URL, for example `https://<slug>-staging.<subdomain>.workers.dev`, followed by the new version ID.

You can run the checks alone with `node scripts/preflight.mjs staging` (or `production`). It prints `Preflight OK.` when everything passes.

## Recommended flow

1. `npm run build && npm test && npm run check`
2. `npm run preview:staging`, then check the site locally.
3. `npm run publish:staging`
4. Check staging: `curl -si https://<slug>-staging.<subdomain>.workers.dev/ | head -1` returns `401` (the login page). Then log in with a browser.
5. `npm run publish:production` and answer `y`.
6. Verify: `curl -si https://<slug>-production.<subdomain>.workers.dev/ | head -1` returns `200`.

## Roll back

Every deploy creates a new version of the Worker. So does `wrangler secret put`. To go back to an earlier version:

1. List recent deployments and their version IDs:
   ```sh
   npx wrangler deployments list --env production
   ```
2. Roll back to the last good version by passing its ID:
   ```sh
   npx wrangler rollback <version-id> --env production
   ```
   Without an ID, `npx wrangler rollback --env production` uses the version uploaded before the latest one ([docs](https://developers.cloudflare.com/workers/wrangler/commands/workers/)). On staging, the version before the latest may be one a password change created, so passing an explicit ID is safer.

   Wrangler then:
   - asks for an optional rollback message (`--message "<text>"` skips this prompt and the confirmation);
   - shows the version it will deploy;
   - asks `Are you sure you want to deploy this Worker Version to 100% of traffic?`.

   If secrets changed since that version, Wrangler lists them and asks again. Bound resources (KV, R2, D1 and so on) are not rolled back.
3. Fix the problem in your code. The next publish deploys your current code again.
4. Verify: `npx wrangler deployments list --env production` shows the rollback as the newest deployment.

Use `--env staging` to roll back staging. You can roll back to any of the 100 most recent versions. See [Rollbacks](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/).
