# Staging login

Staging is protected by one shared password. There are no user accounts. The code is in `worker/index.ts`, `worker/auth.ts` and `worker/login.ts`.

## How it works

Every staging request runs the Worker (`run_worker_first: true`). The Worker skips the password only when `AUTH_MODE` is exactly `"off"` (production). Any other value, including a missing one, is treated as staging, so a misconfigured staging stays closed. In order:

1. **No password configured.** If `STAGING_PASSWORD` is missing or empty, every path returns `503` with `Staging password not configured.`. Staging fails closed: it never serves content in this state.
2. **`/robots.txt`** returns `200` with `User-agent: *` / `Disallow: /`, overriding the production file. No session is needed.
3. **`/__auth/login`**
   - `GET` or `HEAD`: the login page, `200`. A `?next=` query sets where to go after login.
   - `POST`: reads the form fields `password` and `next`. A correct password sets the session cookie and returns `303` to `next`. A wrong password returns the login page with `Incorrect password.` and status `401`.
   - Any other method: `405` with `Allow: GET, POST`.
4. **`/__auth/logout`**
   - `GET`: clears the cookie and returns `303` to `/`.
   - Any other method: `405` with `Allow: GET`.
5. **Other `/__auth/*` files** (a custom login page's CSS, fonts, logo) are served **without a session**, so the login page can load them. This applies only to plain paths. A path containing `%`, `\`, `..` or `//` needs a session like any other page, so give these files plain names.
6. **Everything else:** with a valid session cookie, the file is served from `dist/`. Without one, the login page is returned **in place** with status `401`. The URL stays the same, and `next` is set to the requested path and query, so the visitor lands back on the same page after logging in.
7. **Errors:** an unexpected error returns `500` with `Internal error.`. It never falls back to content.

Headers on staging:

- Every response has `X-Robots-Tag: noindex, nofollow`.
- Pages and files have `Cache-Control: private, no-store`, so shared caches never keep protected content.
- The login page, `401`, `503`, `405`, `500` and redirect responses have `Cache-Control: no-store`.

### Session cookie

- Name `site_auth`, with `HttpOnly`, `SameSite=Lax`, `Path=/` and `Max-Age` equal to the session length.
- `Secure` is added when the request is `https:`. It is left off on `http://localhost`, so local preview works.
- The value is `v1.<expiry>.<signature>`: an HMAC-SHA256 signature over the expiry time, keyed from the password.

### Where you go after logging in

`next` must be a path on the same site. It must start with `/`, must not start with `//`, and must not contain `\` or control characters. Anything else becomes `/`, which prevents open redirects.

## Change the password

Changing the password logs everyone out, because existing cookies were signed with the old one.

1. Run `npm run setup`. Keep your other answers, answer **no** to "Keep the existing staging password", then type a new password or press Enter to generate one. Answer **yes** to the upload.

   Or by hand: run `npx wrangler secret put STAGING_PASSWORD --env staging`, type the password at the prompt, and update `STAGING_PASSWORD=` in `.dev.vars.staging`.
2. `wrangler secret put` deploys the new password immediately. No publish is needed.
3. Verify: `npx wrangler secret list --env staging` lists `STAGING_PASSWORD`, and the new password works at the staging URL.

Never pass the password as a command argument.

## Session length

`AUTH_SESSION_HOURS` in `env.staging.vars` in `wrangler.jsonc` sets how long a login lasts. The default is `"168"` (7 days). Change it, then run `npm run publish:staging`. New logins get the new length.

Verify: after logging in, the `Set-Cookie` header shows `Max-Age=<hours × 3600>`.

## Custom login page

The default login page is `worker/login.html`: plain and unbranded, with inline CSS and no external requests. Each site can replace it without touching the Worker.

### The override contract

- **Location:** `public/__auth/login.html`. It must be in `public/`, **not `src/pages/`**. Astro ignores entries starting with `_` in `src/pages/`, so a page there would never be built. (With another framework, make sure the build output contains `__auth/login.html`.)
- **Required content:**
  - `<form method="POST" action="/__auth/login">`
  - `<input type="password" name="password">`
  - `<input type="hidden" name="next" value="{{NEXT}}">`
- **Optional:** `{{ERROR}}` where the error should appear. It becomes `Incorrect password.` after a wrong password, and an empty string otherwise.
- The Worker HTML-escapes the values it puts in `{{NEXT}}` and `{{ERROR}}`.
- **Assets:** load CSS, fonts and images from `/__auth/...` (put them in `public/__auth/`), or inline them. Anything else is behind the password, so the login page can't load it. Use plain file names.
- **Clean URL:** the file is served at `/__auth/login`, not `/__auth/login.html`; a request for the `.html` URL gets a `307` redirect to the clean one. The Worker fetches `/__auth/login` from the built files and uses the override only when that returns `200`. Otherwise it uses the default page.
- **Production:** the override and its files are not served at `/__auth/…` on production (the Worker returns `404` there).

### Example

Save this as `public/__auth/login.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in</title>
<link rel="stylesheet" href="/__auth/login.css">
</head>
<body>
<main class="card">
  <img src="/__auth/logo.svg" alt="" width="48" height="48">
  <h1>Preview site</h1>
  <p>Enter the shared password to continue.</p>
  <form method="POST" action="/__auth/login">
    <label for="password">Password</label>
    <input id="password" type="password" name="password" autocomplete="current-password" required autofocus>
    <input type="hidden" name="next" value="{{NEXT}}">
    <p class="error" role="alert">{{ERROR}}</p>
    <button type="submit">Sign in</button>
  </form>
</main>
</body>
</html>
```

And this as `public/__auth/login.css`:

```css
body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
.card { width: 100%; max-width: 340px; margin: 1rem; padding: 2rem; background: #1e293b; border-radius: 12px; }
h1 { font-size: 1.25rem; margin: 1rem 0 0.25rem; }
label { display: block; margin: 1rem 0 0.25rem; }
input, button { width: 100%; box-sizing: border-box; padding: 0.6rem; font: inherit; border-radius: 6px; border: 1px solid #475569; }
button { margin-top: 0.75rem; background: #38bdf8; color: #0f172a; border: 0; cursor: pointer; }
.error { color: #fca5a5; margin: 0.5rem 0 0; }
.error:empty { display: none; }
```

Add your own `public/__auth/logo.svg`, or remove the `<img>` line.

### Check it

1. `npm run build`, then `ls dist/__auth/` shows `login.html` and `login.css`.
2. Run `npm run preview:staging`.
3. In a second terminal:
   ```sh
   curl -s http://localhost:8787/ | grep -c 'Preview site'          # 1: your page is used
   curl -si http://localhost:8787/__auth/login.css | head -1      # HTTP/1.1 200 OK, no session needed
   ```
4. Open `http://localhost:8787`, enter a wrong password to see the error, then the right one.

To go back to the default page, delete `public/__auth/login.html`.

## Security notes

- **One shared password.** Everyone uses the same password, and there is no per-person access or audit trail. To remove someone's access, change the password, which logs everyone out.
- **No rate limiting.** The Worker does not limit login attempts, so password guessing is limited only by the password's strength.
- **Offline guessing from a cookie.** The session cookie is signed with a key derived from the password. Anyone holding a leaked cookie can try to guess the password offline, with no request limits. Use the generated password (24 random characters) or one at least as long and random.
- **Changing the password logs everyone out.** Old cookies no longer verify.
- **Staging is hidden from search engines** by `X-Robots-Tag` and `robots.txt`, but that is not access control. The password is.
- **Fails closed.** With no password set, staging returns `503`, not content. Don't change the Worker in a way that weakens this.
- The password is compared in constant time, and the cookie is `HttpOnly` and `SameSite=Lax`.
