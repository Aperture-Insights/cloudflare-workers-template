# Environments

Every project has exactly two environments, `staging` and `production`. Both are defined under `env` in `wrangler.jsonc`, and each deploys as its own Worker.

| | Staging | Production |
|---|---|---|
| Worker name | `<slug>-staging` | `<slug>-production` |
| Default URL | `https://<slug>-staging.<subdomain>.workers.dev` | `https://<slug>-production.<subdomain>.workers.dev` |
| Who can see it | Anyone with the shared password | Everyone |
| Publish | `npm run publish:staging` | `npm run publish:production` (asks for confirmation) |
| Local preview | `npm run preview:staging` | `npm run preview` |
| `vars` | `AUTH_MODE: "password"`, `AUTH_SESSION_HOURS: "168"` | `AUTH_MODE: "off"` |
| Secrets | `STAGING_PASSWORD` (required) | none |
| `run_worker_first` | `true`: every request goes through the Worker | `["/__auth/*"]`: only `/__auth/*` |
| Search engines | `X-Robots-Tag: noindex, nofollow` on every response, and `/robots.txt` disallows everything | `public/robots.txt` (allow all) |
| GitHub branch (if CI is on) | `staging` | `main` |

`<slug>` is the `name` in `wrangler.jsonc`, which `npm run setup` sets. `<subdomain>` is your account's `workers.dev` subdomain.

## The top-level Worker is never deployed

The top level of `wrangler.jsonc` has a `name` but no assets or vars. Every script passes `--env staging` or `--env production`. Never run `wrangler deploy` without `--env`.

## What each environment does

**Staging:** every request runs the Worker in `worker/index.ts`. The Worker checks the session cookie and serves files only after a correct password. If `STAGING_PASSWORD` is missing, every request gets `503 Staging password not configured.`. Details: [staging-login.md](staging-login.md).

**Production:** files are served directly by Cloudflare's asset layer, and no Worker code runs for page requests. A browser visiting a missing page gets `404.html` with status `404` straight from the asset layer. The Worker runs only for `/__auth/*` (which returns `404`, so a custom login page is never public) and for non-browser requests that match no file (which it hands back to the asset layer for the 404 page). If you add Worker code that a browser must reach on production, add its path to production's `run_worker_first` list.

## Vars and secrets are per environment

`vars` and `secrets` are **not inherited** from the top level of `wrangler.jsonc`. Declare them in each environment that needs them.

- **Vars** are plain values committed in `wrangler.jsonc`. Add a var to `env.staging.vars` and `env.production.vars`.
- **Secrets** are set on the deployed Worker with `npx wrangler secret put <NAME> --env <env>`, typing the value at the prompt. They are never in the repo. `secrets.required` lists the secrets a deploy needs; `wrangler deploy` fails if one is missing. For local preview, put the value in `.dev.vars.<env>` (for example `.dev.vars.staging`). With `secrets.required` set, `wrangler dev` loads only the listed keys from that file.
- If Worker code reads a new var or secret, add it to `Env` in `worker/env.d.ts`.

Only the Worker can read vars and secrets. The pages are static files built before deploy.

Verify a change: `npm run check:worker && npm test`.

## Session length

`AUTH_SESSION_HOURS` sets how long a staging login lasts (default `168`, which is 7 days). Change it in `env.staging.vars`, then run `npm run publish:staging`.

## URLs and custom domains

Both environments start on `*.workers.dev`. `workers_dev` is set to `true` in each environment, and `preview_urls` is `false`. To use your own domain, see [custom-domains.md](custom-domains.md).
