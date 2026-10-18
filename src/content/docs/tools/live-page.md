---
title: Live page, window and search
description: How to open this site in a window of its own, and how to search every page at once.
sidebar:
  order: 3
---

From `docs/site`:

- `npm run live` builds the site, serves the built pages on `127.0.0.1:4331` and prints the address of the newest sprint's page: the ledger under `ledgers/sprints` with the highest leading number. With no sprint yet it prints the sprints index instead.
- `npm run live -- 02-save-format` opens that sprint instead.
- `npm run live:window` also opens the address in a window, and says which kind it opened. It takes a sprint name too.
- `npm run live -- --dev` serves with the dev server instead. Pages follow edits as you save, but the Search box does not work there.
- `DANDORI_DOCS_PORT=4400 npm run live` uses another port; 4331 is the default. `npm run dev` and `npm run preview` read the same variable.
- `npm run live:stop` stops the server. A window that is open stays open until you close it.

## Search

The Search box at the top of every page (Ctrl+K, or `/`) searches all the pages at once: sprints, trackers, glossary, lorebook and its explanations, showcase, tools and the reference. The index is written when the site is built, which is why `npm run live` builds first. It is a snapshot. After a ledger or a page changes, run `npm run live` again.

`npm run search -- <words>` asks the same index from a shell, with no window and no server, and prints each page it found with its section. `--json` prints the same list for a program. It reads the last build, so run `npm run build` or `npm run live` first.

`npm test` builds the site and fails unless one query finds pages in at least three sections and every filed explanation is found by its title.

## The window

`npm run live:window` tries two windows, in this order:

1. **Electrobun 2**, when the site's packages have `electrobun`. `npm install` brings a small bootstrap package. The first time the window is opened, that package builds the window project in `scripts/window`, and the build downloads Hutch, Electrobun and Bun, about 250 MB, into `.hutch` in your home folder, or into the folder named by `HUTCH_HOME`. Nothing is installed globally. The page is drawn by the system webview (WebView2 on Windows), so no browser engine is bundled. A link that leaves the site is refused by the window and handed to your default browser. The check below proves the refusal. Nobody has yet watched the browser open such a link.
2. **Deno Desktop**, when Electrobun is not there or its build fails. It needs `deno` on your `PATH`. A link that leaves the site is followed inside this window.

`npm run live:window -- --window=deno` or `--window=electrobun` picks one by name. If neither opens, the command says why and prints the address to use in a browser.

`npm run window:check` proves the Electrobun window with nobody watching: it opens the window on the built site, has the page run one search and then try to leave the site, prints what happened, and closes the window and the server.
