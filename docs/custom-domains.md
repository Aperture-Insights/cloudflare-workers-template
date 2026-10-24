# Custom domains

Both environments start on `*.workers.dev`. You can give each environment its own domain, for example `example.com` for production and `staging.example.com` for staging. This uses Workers [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), and Cloudflare creates the DNS record and certificate for you.

## Requirements

- The domain must be an **active zone** in the same Cloudflare account as `account_id` in `wrangler.jsonc`. To add one, go to the dashboard, choose **Add a domain**, and point the domain's nameservers at Cloudflare.
- The hostname must **not already have a CNAME record**. Delete it first.
- If you deploy from GitHub Actions, the API token needs access to that zone (Zone → Workers Routes → Edit). See [github-actions.md](github-actions.md#narrower-token-optional).

## Steps

1. In `wrangler.jsonc`, add `routes` inside the environment. Routes are per environment. Production example:
   ```jsonc
   "production": {
     "workers_dev": true,
     "routes": [
       { "pattern": "example.com", "custom_domain": true },
       { "pattern": "www.example.com", "custom_domain": true }
     ],
     "assets": { ... },
     "vars": { "AUTH_MODE": "off" }
   }
   ```
   Staging example:
   ```jsonc
   "staging": {
     "workers_dev": true,
     "routes": [{ "pattern": "staging.example.com", "custom_domain": true }],
     ...
   }
   ```
   The pattern is a bare hostname: no `https://`, no path and no `*`.
2. Decide whether to keep the `*.workers.dev` URL. The template sets `"workers_dev": true` explicitly, so it stays on. Set it to `false` in that environment to turn it off. Keeping it on for staging is harmless, because it is password-protected either way.
3. Publish that environment: `npm run publish:staging` or `npm run publish:production`.
4. Wait a minute or two for the certificate.
5. Verify:
   ```sh
   curl -sI https://example.com/ | head -1                                  # HTTP/2 200
   curl -sI https://staging.example.com/ | grep -i -E '^HTTP|x-robots-tag'  # 401 and noindex, nofollow
   ```

## Notes

- The staging login works the same on a custom domain. The session cookie is set for whichever host you log in on, so logging in on `workers.dev` does not log you in on `staging.example.com`.
- Production's `public/robots.txt` allows everything. Staging's `/robots.txt` always disallows everything, whatever the domain.
- To remove a domain, delete its `routes` entry and publish again. Cloudflare does not delete the certificate it created; remove it under **SSL/TLS → Edge Certificates** if you want to.
