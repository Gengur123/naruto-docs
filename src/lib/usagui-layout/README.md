# usagui-layout

Built files. Do not edit them.

They come from the dandori-skills repository (https://github.com/Gengur123/dandori-dex): the sources are `tools/dandori-usagui/` and `tools/dandori/layout` there, and `tools/dandori-usagui/build.sh` there rebuilds and copies the two files. A project that took this folder from the starter site has the built files and none of those sources, so it cannot rebuild them. To get newer ones, copy `island.js` and `kernel.js` from a newer build in that repository. Nothing else in the site needs a build step for them: the site builds as it is.

- `island.js` is the UsaGui guest that `src/components/StructLayout.astro` loads in the browser. It lays a struct out, declares one UsaGui button per byte, hit-tests the pointer and writes a UsaGui frame that the component paints on a 2D canvas.
- `kernel.js` is the layout code alone. The component imports it while the site builds, for the caption, the table and the plain-text byte map.

Both hold the layout code of `tools/dandori/layout`, so they give the numbers `dandori layout` gives.

## Built from

- Source: `tools/dandori-usagui/` (packages `island` and `kernel`) and `tools/dandori/layout`.
- usagui: `main` at ed95e378a5d3683cc464247e441708340f601c19, clean working tree.
- lite-space: the working tree of `C:/DevSync/.worktrees/lite-space-main` at 3a61121826744d4a8963bac9a260a8000a398f63 on 2026-10-11. `git status` there lists 136 files as modified and `git diff --shortstat` is empty, so the difference from the commit is line endings. The build was not tried against a fresh clone of the commit.
- Toolchain: moon 0.1.20260920 (914d7da).
- Command: `tools/dandori-usagui/build.sh`, which runs `moon test --target js island` and `moon build --target js --release island kernel` and copies the two files here.

`tools/dandori-usagui/build.sh --check` rebuilds and compares with these files without copying. On 2026-10-11 a build against scratch copies of the two checkouts and a build against the checkouts themselves were byte-identical.

The site builds without a usagui checkout because these files are committed. What is below was written in the dandori-skills repository and names paths inside it.
