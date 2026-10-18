// A Deno Desktop window that shows one loopback URL.
// Usage: DocsShell.exe [<http://127.0.0.1:PORT/path>] [title]
// With no address it opens the sprints index on the port in DANDORI_DOCS_PORT (4331 when that
// is not set), the same default scripts/live.mjs uses; live.mjs always passes the address.
// The close listener matters: without it the window cannot be closed and the process stays.
let port = "4331";
try {
  const fromEnv = (Deno.env.get("DANDORI_DOCS_PORT") ?? "").trim();
  if (/^[0-9]+$/.test(fromEnv) && Number(fromEnv) >= 1 && Number(fromEnv) <= 65535) port = fromEnv;
} catch { /* no permission to read the environment: keep the default port */ }
const raw = Deno.args[0] ?? `http://127.0.0.1:${port}/llms/index.md`;
let url: URL;
try { url = new URL(raw); } catch { console.error(`bad url: ${raw}`); Deno.exit(2); }
if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
  console.error(`refusing non-loopback url: ${raw}`);
  Deno.exit(2);
}
const win = new Deno.BrowserWindow({ title: Deno.args[1] ?? "Docs", width: 1280, height: 800 });
Deno.serve(() => Response.redirect(url.href, 302));
win.addEventListener("close", () => Deno.exit(0));
