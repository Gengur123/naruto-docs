---
title: Dandori-Dex
description: One page that indexes every project you register, and a page per project that indexes its documentation and artifacts.
sidebar:
  order: 6
---

Dandori-Dex is a static hub. The first page lists your projects. Each project has a page that opens with its documentation contents, then its report pages and other HTML artifacts, then its `HANDOFF.md` and `README.md` as plain text. It is plain on purpose; styling comes later.

## Use it

```bash
dandori dex add C:/DevSync/MatchaMill            # name defaults to the folder's, made URL-safe
dandori dex add ../other --name "Other Project"  # stored as other-project
dandori dex list
dandori dex build                                 # writes ~/.dandori/dex/site
dandori dex build --out ./hub                     # or anywhere you like
dandori dex remove other-project                  # takes it off the list; the folder is untouched
```

The local registry is `$DANDORI_DEX_HOME/dex.json`, or `~/.dandori/dex.json` when the variable is unset (on Windows, `%USERPROFILE%\.dandori`). The folder is stored as an absolute path. It is for building and viewing the hub on one machine; the published hub comes from the shared registry below.

## The shared registry

The published hub's project list is `dex/registry.json` in this repository (dandori-skills), so every machine builds the same list:

```json
{
  "version": 1,
  "projects": [
    {
      "name": "haredream",
      "repo": "BlankMauser/HareDream",
      "paths": { "m-omen-tai": "E:/ProjectFenrir/HareDream", "<other hostname>": "/home/.../HareDream" }
    }
  ]
}
```

`name` is the URL slug, `<name>/` on the live site, so do not rename a published project. `paths` maps a machine's hostname (as `hostname` prints it, matched without case) to its checkout there.

To add a project, add an entry with your machine's path (or add your hostname to an existing entry) and commit it to dandori-skills. `dandori dex add` alone only changes your machine's local list, which the published hub does not read.

## Publish

Publish only with the script; it is a publish, so it needs the user's permission (see the Dandori skill).

```bash
bash tools/dex-publish.sh --check     # does this machine have every registered project?
bash tools/dex-publish.sh --dry-run   # check, then build into a temp folder
bash tools/dex-publish.sh             # check, build, deploy to dandori-dex.pages.dev
```

A Pages deploy replaces the whole site: a project missing from the build loses its page. So the script refuses to build or deploy when any registered project has no path for this machine or its folder is missing, and names them. Publish from a machine that has them all, or clone the missing ones and add their paths. On 2026-10-18 a deploy from a machine whose local list lacked PiMon deleted PiMon's page; this script is the fix.

`--allow-partial` builds without the missing projects. It exists for testing the build (`--dry-run --allow-partial`). Never use it for a production deploy; a real deploy with it also needs `--i-understand-this-deletes-pages`.

The deploy runs `npx wrangler@4.42.0 pages deploy` and needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment (the token may come from the MatchaMill secret store). Never commit or print the token. The script writes a temporary `dex.json` with the resolved paths, builds with `DANDORI_DEX_HOME` pointed at a temp folder and deletes it afterwards (`--keep` keeps it).

## When a deploy loses content, roll back

Prefer rolling back to the last good deployment over building and publishing again. List the deployments, find the last good one (its commit message and time), and roll back to it:

```bash
npx wrangler@4.42.0 pages deployment list --project-name dandori-dex

curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/dandori-dex/deployments" \
  | node -e 'for (const d of JSON.parse(require("fs").readFileSync(0)).result) console.log(d.id, d.created_on, d.deployment_trigger.metadata.commit_message)'

curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/dandori-dex/deployments/$DEPLOYMENT_ID/rollback"
```

The rollback is a publish too: ask the user first.

## What the hub shows

For each project the hub row has the name, the date of the newest git commit, and a sprint summary such as `2 active, 5 done`, read from `docs/site/ledgers/sprints/*.json`. A sprint is done when it has tracks and every one is merged. A piece that cannot be found shows as a dash and never stops the build.

The project page lists the pages of the built site under `docs/site/dist`, grouped by their first folder: sprints, trackers, lorebook, explanations, showcase, tools, reference, then any other folder. Artifacts are `reports/*.html` and every `.html` under `docs/` outside `docs/site`.

If `docs/site/dist` does not exist the page says `site not built: run npm run build in docs/site` and the build prints a warning. Dex does not run npm.

## The output folder

```
index.html              the hub
<name>/index.html       the project page
<name>/site/            a copy of docs/site/dist
<name>/artifacts/       the HTML artifacts, HANDOFF.md and README.md
```

Every link is relative, so the folder opens from disk, from a phone through any static host, or as one upload. Astro writes links from the root of a site (`/_astro/x.css`); the copy rewrites them to relative paths so the pages still style and link inside the hub. A rebuild overwrites files but removes none, so delete the folder yourself to drop a project that was taken off the list.

Not carried over: search (it loads Pagefind by an address from the site root) and the pages' scripts, which need the site served from its own root. The page text, styles and links work.

## In a window

`bash tools/dex-window.sh [<hub folder>]` opens the hub in the Wails window from `docs/site/scripts/wails-window`, the one `npm run live:window` uses. It reuses the same built program from the same cache and builds it the same way (Go only, no downloads) when it is missing.

## Not yet

Styling, search across projects, and a Wails app of its own. The hub is rebuilt by running `dandori dex build` again, or `bash tools/dex-publish.sh --dry-run` from the shared registry.
