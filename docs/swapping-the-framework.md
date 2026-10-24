# Swapping the framework

Astro is the default, but the Worker, the setup and publish scripts, and the Worker tests do not depend on it. Any tool that builds a folder of static files works: another static site generator, a single-page app build, or plain HTML.

## What is framework-specific

Only these change:

| Item | Astro value | What to do |
|---|---|---|
| `dev` script in `package.json` | `astro dev` | Your tool's dev server |
| `build` script | `astro build` | Your tool's build command |
| `check:site` script | `astro check` | Your tool's checker, or remove the script and drop `npm run check:site` from `check` |
| `assets.directory` in **both** `env.staging` and `env.production` in `wrangler.jsonc` | `./dist` | Your build's output folder |
| `astro.config.mjs`, `tsconfig.json` | Astro config | Replace with your tool's config, or delete |
| `src/` | Astro pages and layout | Your source |
| `public/` | Copied as-is into `dist/` | Your static files folder, if your tool has one |
| devDependencies `astro`, `@astrojs/check` | pinned | Remove them, and add your tool pinned to an exact version |

Do **not** change `worker/`, `scripts/`, `vitest.config.ts`, the Worker tests, `preview`, `preview:staging`, `test`, `check:worker`, `check:docs`, `setup` or the `publish:*` scripts.

`npm run setup` updates the site title in `src/site.config.ts` when that file exists, and skips that step when it doesn't.

## What the build output must contain

- **`404.html` at the root of the output folder.** Both environments use `not_found_handling: "404-page"`, so this is the page for missing URLs.
- **`__auth/` copied through**, if you use a custom login page: `__auth/login.html` plus any CSS, fonts or images it loads. They must end up at `<output>/__auth/...`. Put them in the folder your tool copies verbatim (the equivalent of `public/`). Some tools skip files or folders that start with `_`, so check the output.
- Pages as `.html` files. With the default `html_handling`, `about/index.html` is served at `/about/` (and `/about` redirects there with a `307`). Check your URLs with `npm run preview`.

## Checklist

1. Update the `dev`, `build` and `check:site` scripts (or remove `check:site` and its use in `check`).
2. Set `assets.directory` in both environments.
3. Replace `astro.config.mjs`, `tsconfig.json`, `src/` and `public/`, and swap the devDependencies. Run `npm install`.
4. Add your output folder to `.gitignore` if it isn't `dist/`.
5. `npm test && npm run check` pass.
6. `npm run build` produces `404.html` and (if you use a custom login page) `__auth/` in the output folder. For example, with `./dist`: `ls dist/404.html dist/__auth/`.
7. `npm run preview:staging`, then in a second terminal `curl -si http://localhost:8787/ | head -1` returns `401`, and logging in shows your site.
