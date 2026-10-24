# GitHub Actions

The repo ships an opt-in workflow, `.github/workflows/deploy.yml`. **It does nothing until you enable it.** Its job only runs when the repository variable `DEPLOY_ENABLED` is `true`.

## What the workflow does

| Trigger | Deploys to |
|---|---|
| Push to `main` | `production` |
| Push to `staging` | `staging` |
| **Run workflow** (manual `workflow_dispatch`) | The environment you choose (default `staging`) |

The steps are `actions/checkout@v7`, then `actions/setup-node@v7` (Node from `.nvmrc`, with an npm cache), then `npm ci`, `npm test`, `npm run check`, and finally `npm run publish:staging -- --yes` or `npm run publish:production -- --yes`. The publish step runs the same preflight checks as on a laptop. `--yes` skips the production prompt.

- The job runs in the GitHub Environment of the same name (`staging` or `production`), so you can add protection rules there.
- One concurrency group per environment means deploys to the same environment run one at a time and are never cancelled half-way.
- The workflow's `GITHUB_TOKEN` has only `contents: read`.
- GitHub stores only `CLOUDFLARE_API_TOKEN`. The account comes from `account_id` in `wrangler.jsonc`. The staging password is **not** stored in GitHub: it is set once on the staging Worker and stays there across deploys.

## Enable it

### 1. Check you are in your site's repository

Run `git remote -v`. `origin` must be your site's own GitHub repository, **not the template**. If it shows the template, point it at your repository first with `git remote set-url origin <your-site-repo-url>` (see the [README quickstart](../README.md#quickstart)). Otherwise the steps below would push your site and a `staging` branch into the template.

Verify: `git remote -v` shows your site's repository for both fetch and push.

### 2. Create the staging Worker first

The staging Worker must exist, with its password, before the first CI deploy. Otherwise preflight stops with `The staging Worker does not exist yet.`.

1. From a laptop, run `npm run setup` once and answer **yes** to uploading the password.
2. Commit and push the files setup changed (`package.json`, `package-lock.json`, `wrangler.jsonc`, `src/site.config.ts`). CI needs your slug and `account_id`.
3. Verify: `npx wrangler secret list --env staging` lists `STAGING_PASSWORD`.

### 3. Create a Cloudflare API token

1. In the Cloudflare dashboard, go to **My Profile → API Tokens → Create Token**.
2. Choose the **Edit Cloudflare Workers** template.
3. Under **Account Resources**, select your one account (not all accounts). Under **Zone Resources**, select the zone(s) you use for custom domains, or all zones in that account.
4. Create the token and copy it. Cloudflare shows it only once.
5. Verify: run `curl -s https://api.cloudflare.com/client/v4/user/tokens/verify -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"` with the token in the `CLOUDFLARE_API_TOKEN` environment variable (for example `read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN`, then paste). The response contains `"status": "active"`.

#### Narrower token (optional)

The template grants more than deploys need: Workers KV, R2, Tail and Workers Routes, as well as Workers Scripts. Cloudflare does not document a minimum for `wrangler deploy`. This narrower set is **inferred; verify with a test deploy**:

- Account → **Workers Scripts** → Edit
- Account → **Account Settings** → Read
- Zone → **Workers Routes** → Edit, only if you use custom domains

References: [API token templates](https://developers.cloudflare.com/fundamentals/api/reference/template/), [Wrangler in GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

### 4. Add the secret and the variable to GitHub

In the repository, go to **Settings → Secrets and variables → Actions**:

1. On the **Secrets** tab, add `CLOUDFLARE_API_TOKEN` with the token.
2. On the **Variables** tab, add `DEPLOY_ENABLED` with the value `true`.

Or, with the GitHub CLI (`gh secret set` reads the value from a prompt, not an argument):

```sh
gh secret set CLOUDFLARE_API_TOKEN
gh variable set DEPLOY_ENABLED --body true
```

Verify: `gh secret list` shows `CLOUDFLARE_API_TOKEN`, and `gh variable list` shows `DEPLOY_ENABLED  true`.

To turn deploys off again, set `DEPLOY_ENABLED` to anything else, or delete it. Runs are then skipped.

### 5. Protect production (recommended)

The workflow creates the `staging` and `production` GitHub Environments on its first run. You can also create them first in **Settings → Environments**. In the `production` environment:

1. **Deployment branches and tags:** choose **Selected branches and tags** and add `main`. Without this, anyone who can run the workflow by hand could pick `production` from any branch and deploy that branch to production.
2. **Required reviewers** (optional): add yourself or your team. Each production deploy then waits for approval.

Verify: in **Settings → Environments → production**, the rules are listed.

### 6. Create the `staging` branch

```sh
git push origin HEAD:staging
```

From now on, push or merge to `staging` to deploy staging, and to `main` to deploy production.

Verify: `gh run list --workflow deploy.yml --limit 1` shows the run, and `gh run watch` follows it to a green finish.

## Running a deploy by hand

In GitHub, open **Actions → Deploy → Run workflow**, then choose the branch and environment. Or:

```sh
gh workflow run deploy.yml -f environment=staging
```

## Alternative: Workers Builds

Cloudflare also offers its own Git integration, [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), which you connect to the repository in the dashboard. It builds and deploys on push without GitHub Actions. This template does not set it up or test it. If you use it, set its deploy command to deploy one environment explicitly (never a bare `wrangler deploy`), make sure the staging password was uploaded first, and leave `DEPLOY_ENABLED` unset so the two don't both deploy.
