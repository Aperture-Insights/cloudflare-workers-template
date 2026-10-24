# Local development

There are three ways to run the site locally. Pick the one that matches what you are checking.

| Command | URL | Runs the Worker? | Login? | Use it for |
|---|---|---|---|---|
| `npm run dev` | `http://localhost:4321` | No | No | Editing content and styles, with hot reload |
| `npm run preview` | `http://localhost:8787` | Yes, as production | No | Checking the built site behaves like production, including 404s |
| `npm run preview:staging` | `http://localhost:8787` | Yes, as staging | Yes | Checking the password login and staging headers |

## `npm run dev`

Runs `astro dev`. It is fast and reloads as you edit. **It does not run the Worker and has no login**, so it cannot show you staging behaviour. Use it for day-to-day content work.

## `npm run preview`

Runs `npm run build`, then `wrangler dev --env production`. It serves `dist/` in Cloudflare's local Workers runtime with the production settings.

Verify, in a second terminal:

```sh
curl -si http://localhost:8787/ | head -1        # HTTP/1.1 200 OK
curl -si http://localhost:8787/nope | head -1    # HTTP/1.1 404 Not Found
```

## `npm run preview:staging`

Runs `npm run build`, then `wrangler dev --env staging`, with the real login. Wrangler loads `STAGING_PASSWORD` from `.dev.vars.staging`.

Verify, in a second terminal:

```sh
curl -si http://localhost:8787/ | head -1   # HTTP/1.1 401 Unauthorized (the login page)
```

Open `http://localhost:8787` in a browser and log in with the password from `.dev.vars.staging`. The `Secure` cookie flag is left off on plain `http://`, so the login works locally in every browser.

To log in with curl without putting the password in a command argument:

```sh
jar="$(mktemp)"
sed -n 's/^STAGING_PASSWORD=//p' .dev.vars.staging | tr -d '\n' \
  | curl -si -c "$jar" --data-urlencode password@- http://localhost:8787/__auth/login | head -1   # HTTP/1.1 303 See Other
curl -si -b "$jar" http://localhost:8787/ | head -1   # HTTP/1.1 200 OK
rm "$jar"
```

Stop either preview with `x` or Ctrl+C.

## `.dev.vars.staging`

This file holds the local copy of the staging password:

```
STAGING_PASSWORD=<your password>
```

- `npm run setup` writes it, readable only by you (mode `600`). Git ignores it, so never commit it.
- `.dev.vars.staging.example` is the committed example (`STAGING_PASSWORD=change-me`).
- Without it, or with an empty value, local staging answers every request with `503 Staging password not configured.`.
- To create it by hand: `cp .dev.vars.staging.example .dev.vars.staging && chmod 600 .dev.vars.staging`, then edit the value.
- Changing this file changes only your local preview. To change the deployed password, see [staging-login.md](staging-login.md#change-the-password).

Verify: `ls -l .dev.vars.staging` shows `-rw-------`.

## Before publishing

Run these in order and make sure each passes before the next:

```sh
npm test
npm run check
npm run preview:staging   # builds, then check the site in a browser or with curl
npm run publish:staging   # or publish:production
```

This is the same sequence as in [publishing.md](publishing.md#recommended-flow).
