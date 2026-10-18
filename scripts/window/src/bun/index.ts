// One Electrobun window that shows the documentation site on a loopback address.
// scripts/live.mjs passes the address in DANDORI_DOCS_URL and the title in DANDORI_DOCS_TITLE.
//
// A link that leaves the site is not followed in this window. The navigation rules below
// refuse it, and the handler hands it to the default browser with Utils.openExternal. The
// refusal is proved by `npm run window:check`; the hand-over has not been watched yet.
//
// DANDORI_WINDOW_SELF_CHECK=1 is for `npm run window:check`: the page runs one search, then
// tries to leave the site with the answer in the address. This process prints what it saw
// and exits. In that mode nothing is opened in the browser.
import Electrobun, { BrowserWindow, Utils } from "electrobun/main";

const raw = process.env.DANDORI_DOCS_URL ?? "http://127.0.0.1:4331/";
let home: URL;
try {
  home = new URL(raw);
} catch {
  console.error(`bad url: ${raw}`);
  process.exit(2);
}
if (home.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(home.hostname)) {
  console.error(`refusing non-loopback url: ${raw}`);
  process.exit(2);
}
const selfCheck = process.env.DANDORI_WINDOW_SELF_CHECK === "1";
const checkQuery = process.env.DANDORI_WINDOW_CHECK_QUERY ?? "dandori";

const win = new BrowserWindow({
  title: process.env.DANDORI_DOCS_TITLE ?? "Docs",
  url: home.href,
  frame: { width: 1280, height: 800, x: 80, y: 60 },
});
// Rules are read in order and the last match wins: refuse everything, then allow the site.
win.webview.setNavigationRules(["^*", `${home.origin}/*`]);
console.log(`window open on ${home.href}`);

function addressOf(event: any): { url: string; allowed: boolean } | null {
  const detail = event?.data?.detail;
  try {
    const parsed = typeof detail === "string" ? JSON.parse(detail) : detail;
    if (parsed && typeof parsed.url === "string") return { url: parsed.url, allowed: parsed.allowed !== false };
  } catch { /* a plain address, not JSON */ }
  return typeof detail === "string" ? { url: detail, allowed: true } : null;
}

function leaves(address: string): boolean {
  try {
    return new URL(address).origin !== home.origin;
  } catch {
    return false;
  }
}

function outside(address: string, how: string) {
  const target = new URL(address);
  if (selfCheck && target.hostname === "dandori.invalid") {
    console.log(`self-check ${how}: ${target.search.slice(1)}`);
    process.exit(0);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    console.log(`not opened (${how}): ${address}`);
    return;
  }
  if (selfCheck) {
    console.log(`would open in the browser (${how}): ${address}`);
    return;
  }
  Utils.openExternal(address);
  console.log(`opened in the browser (${how}): ${address}`);
}

Electrobun.events.on("will-navigate", (event: any) => {
  const seen = addressOf(event);
  if (seen && leaves(seen.url)) outside(seen.url, seen.allowed ? "allowed by the window" : "refused by the window");
});
// A link with target="_blank", or a middle click.
Electrobun.events.on("new-window-open", (event: any) => {
  const seen = addressOf(event);
  if (!seen) return;
  if (leaves(seen.url)) outside(seen.url, "new window");
  else win.webview.loadURL(seen.url);
});

if (selfCheck) {
  let asked = false;
  Electrobun.events.on("dom-ready", () => {
    if (asked) return;
    asked = true;
    win.webview.executeJavascript(`
      (async () => {
        const out = new URLSearchParams();
        try {
          const pagefind = await import("/pagefind/pagefind.js");
          const found = await pagefind.search(${JSON.stringify(checkQuery)});
          const sections = new Set();
          for (const r of found.results) {
            const data = await r.data();
            sections.add(data.url.split("/").filter(Boolean)[0] ?? "overview");
          }
          out.set("query", ${JSON.stringify(checkQuery)});
          out.set("hits", String(found.results.length));
          out.set("sections", [...sections].sort().join(","));
          out.set("searchBox", String(document.querySelector("site-search") !== null));
          out.set("title", document.title);
        } catch (e) {
          out.set("error", String(e));
        }
        location.href = "https://dandori.invalid/?" + out.toString();
      })();
    `);
  });
  setTimeout(() => {
    console.log("self-check: no answer from the page within 30 s");
    process.exit(1);
  }, 30000);
}
