# Cloudflare account

This template runs on Cloudflare's free plan. You need no payment method and no Zero Trust.

## 1. Create a free account

1. Sign up at <https://dash.cloudflare.com/sign-up> and verify your email.
2. In the dashboard, open **Workers & Pages** once. If Cloudflare asks you to choose a `workers.dev` subdomain, choose one. Your sites will live at `https://<worker-name>.<account-subdomain>.workers.dev`. After a publish, Wrangler prints each site's exact URL, and the dashboard shows it under **Workers & Pages** → the Worker.
3. Verify: the **Workers & Pages** page loads without asking you to set anything up.

## 2. Log in from your laptop

`npm run setup` offers to do this for you. To do it by hand:

1. Run `npx wrangler login`. A browser window opens. Approve the request.
2. Verify: `npx wrangler whoami` shows your email and your account(s).

Wrangler stores the login on your machine, not in this repo.

## 3. Find your account ID

`npm run setup` reads the account ID from `wrangler whoami` and writes it to `account_id` in `wrangler.jsonc`. The account ID is not a secret. It is committed, so your laptop and CI always target the same account.

To find it by hand:

- Run `npx wrangler whoami`. It prints a table of account names and IDs.
- Or, in the dashboard, go to **Workers & Pages** and copy the ID from **Account Details**, or press Cmd/Ctrl+K and search for "Copy account ID". See [Find account and zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/).

Verify: `grep account_id wrangler.jsonc` shows a 32-character hex ID.

## 4. Multiple accounts

If your login has access to several accounts, `npm run setup` lists them and asks you to pick a number. You can also enter an ID by hand. To switch accounts later, re-run `npm run setup` and answer **no** to "Keep existing account_id".

The workers then deploy to the new account. The staging password is set per Worker, so upload it again in the new account (answer **yes** to the upload).

Verify: `grep account_id wrangler.jsonc`, then `npx wrangler secret list --env staging`.

## 5. API token for CI

Your laptop uses the `wrangler login` session. GitHub Actions needs an API token instead. Wrangler also uses the `CLOUDFLARE_API_TOKEN` environment variable when it is set, and preflight then skips the login check.

1. In the dashboard, go to **My Profile → API Tokens → Create Token**.
2. Use the **Edit Cloudflare Workers** template.
3. Under **Account Resources**, include only your one account. Under **Zone Resources**, include only the zones you use for custom domains, or all zones in that account.
4. Create the token and copy it. Cloudflare shows it only once.
5. Store it as the `CLOUDFLARE_API_TOKEN` secret in GitHub, as described in [github-actions.md](github-actions.md). Never put it in a file in this repo.

The template grants more than deploys need (KV, R2, Tail and Workers Routes). For a narrower token, see [github-actions.md](github-actions.md#narrower-token-optional).

References: [API token templates](https://developers.cloudflare.com/fundamentals/api/reference/template/), [Wrangler in GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).
