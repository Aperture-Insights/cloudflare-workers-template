import { escapeHtml } from "./auth";
import defaultLogin from "./login.html";

export async function renderLogin(
  env: Env,
  origin: string,
  opts: { next: string; error: boolean },
  status: number,
): Promise<Response> {
  // Override lives at /__auth/login.html but is served at the clean URL.
  let template = defaultLogin;
  try {
    const res = await env.ASSETS.fetch(`${origin}/__auth/login`);
    if (res.status === 200) template = await res.text();
  } catch {
    // fall back to the default page
  }
  const next = escapeHtml(opts.next);
  const error = opts.error ? escapeHtml("Incorrect password.") : "";
  const body = template.split("{{NEXT}}").join(next).split("{{ERROR}}").join(error);
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
