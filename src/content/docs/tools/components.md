---
title: Showcase components
description: The components a showcase page is made from, the data each takes, and an example of each.
sidebar:
  order: 4
---

A showcase page is a few lines of data handed to one of these components. Do not write a showcase page from scratch, and do not copy a component's markup into a page.

Each component is a custom element in plain JavaScript and CSS under `src/components/dd/`, with a thin `.astro` wrapper in `src/components/`. In an `.mdx` page import the wrapper. The wrapper draws what it can while the site builds, so the page reads without JavaScript.

| Component | Wrapper | Element | What it is |
| --- | --- | --- | --- |
| Struct showcase | `StructShowcase.astro` | `<dd-struct-showcase>` | A whole showcase entry for one struct's layout, made from the four below. |
| Struct picker | `StructShowcase.astro` with several structs or `ledger` | `<dd-struct-picker>` | Many structs to search, a few in view side by side, and the places where each one's name appears. |
| Showcase card | `ShowcaseCard.astro` | `<dd-card>` | A box with a small state and an expanded state. It grows in place. |
| Byte strip | `ByteStrip.astro` | `<dd-bytes>` | A struct's bytes, one cell per byte. |
| Before and after | `BeforeAfter.astro` | `<dd-delta>` | One big number, an arrow, the number after. |
| Field list | `FieldList.astro` | `<dd-fields>` | One row per field and per run of padding. Inside the struct showcase it is the editor. |

The struct showcase, the struct picker, the byte strip and the field list are for struct layouts. Any other win starts from the showcase card and the before and after figure, and may need a new component; see the end of this page.

A struct is written as a dataflow ledger entry has it: `id`, `rule` and `fields`, each field a `name` and a `type`. `types` holds nested structs, `pack` a `#pragma pack` value and `align` a `repr(align(N))` value. Write the types. Never write a size or an offset: the layout code works them out.

## Struct showcase

Data: `structs` (one struct; a list or a ledger gets the struct picker, next section), `commit` and `date` (when the entry was taken).

```mdx
import StructShowcase from '../../../components/StructShowcase.astro';

<StructShowcase commit="af3af03" date="2026-10-11" structs={[{ id: 'sim.Particle', rule: 'c', fields: [{ name: 'flags', type: 'u8' }, { name: 'id', type: 'u64' }] }]} />
```

Small, it shows the size as declared, the size reordered, and both strips. Pointing at a byte says what it is, in the card's top line. A click in a card, or Enter or Space on it, expands that card in place:

- `declared order`: the strip with bigger cells, and under it the list with every field's name, type, offset, size and alignment and every run of padding. The list is the editor: rename, retype, move, remove, add, reset, rule and pack.
- `reordered`: the same for the order the layout code proposes, where each field was and where it is now, what that saves, and `Use this order`.

One card is expanded at a time, and the figure above the cards makes room for it. Expanded, each name, offset and size is in one place, the list. The strip carries a letter and a colour per field and nothing else; the letter and the colour are what join a row of the list to its bytes, so they are in both. The other card stays small and shows the same letters. While `declared order` is expanded the small `reordered` card says its size, because the figure above is gone. Escape or `Collapse` closes the card.

The commit and the date stand under the cards while the struct is as the page gave it. After an edit, `Use this order` included, that line reads `edited` and has a `Reset` button, because the commit no longer describes what is drawn.

A small card is one button, so a screen reader is given the layout in words as the button's description.

## Struct picker

Data: `ledger` (`true` for the site's own `ledgers/dataflow.json`, or a list of its entries), `structs` (the page's own structs; beside a ledger they are the group `examples`, so the page is not empty before anything is scanned), `open` (the ids in view at the start; default the first struct that may be drawn), `scanned` (the folder the scan read; default the folders the scanned entries' paths share), `commit` and `date` (for the page's own structs).

```mdx
import StructShowcase from '../../../components/StructShowcase.astro';

<StructShowcase ledger commit="af3af03" date="2026-10-11" structs={[{ id: 'sim.Particle', rule: 'c', fields: [{ name: 'flags', type: 'u8' }, { name: 'id', type: 'u64' }] }]} />
```

The entries are what `dandori tracker scan --structs --write` records. They arrive unreviewed, and the line under a struct's name says so.

- **Search.** The box is a combobox. Typing filters by name, group, rule, language, a `repr` item or a derive, or a field's name or type; every word typed must fit. The list is grouped by the system or module part of each id (`render.scene.pool` for `render.scene.pool.Entry`), and the groups beside the list are a table of contents: a press jumps the list to that group. Arrow keys move, Page Up and Page Down go a group at a time, Enter adds the struct to the view or takes it out, Escape closes the list. Only the rows in the box are drawn, so several hundred structs open as fast as twenty.
- **Compare.** Each struct added is one struct showcase with its own before and after figure, its own two cards and a `Remove` button. Two fit side by side where the view is about 820 pixels wide or more; on a phone they stack. A struct lays its cards out by its own column's width.
- **Where the name appears.** Under a struct, the places its entry records in `moves`: the kind, the path and line, and the source line. A place that names a second struct offers that struct as `Add <name>`, and the struct it names shows the same place from its side, so a chain of conversions can be walked one press at a time. Signatures are counted and grouped by system, and drawn when opened. These are places where the type's name appears, found by syntax. It is not a lifetime analysis: nothing is drawn as an order in time, and a struct passed through a generic, a macro or an alias is not seen. An entry with no recorded place shows nothing here. Above the structs in view, one line says which folder was scanned and what the scan does not see: a call that names no type (such as `bytemuck::cast_slice(&v)`), a generic, a macro, a trait object, a type alias, and code outside that folder. So an empty list does not mean the struct goes nowhere. A place that names two structs is listed under both, and a struct whose name another struct shares is offered with its group.
- **No layout, no numbers.** An entry whose `rule` is `unfixed`, or that has a field marked `unknown`, is listed and can be added. Its card shows the fields as the source writes them and one line saying why no byte layout is drawn. It never gets a size, an offset or a strip, and the layout code is not asked about it. The same holds when the layout code refuses an entry.

`dd-pick.js` holds all of this without the DOM (`search`, `followOf`, `bodyOf`, `rowsInView`), and `dd-pick.test.mjs` tests it.

## Showcase card

Data: `label`, and three slots: `small` (shown only while small), the default slot (shown in both states), `large` (shown only while expanded). `open` starts it expanded. It knows nothing about what is inside it.

```mdx
import ShowcaseCard from '../../../components/ShowcaseCard.astro';

<ShowcaseCard label="frame time"><p slot="small">16.4 ms</p><p slot="large">16.4 ms: 9.1 simulate, 5.2 draw, 2.1 present</p></ShowcaseCard>
```

Put in `large` what the viewer could not see while it was small. Do not repeat the small state there.

## Byte strip

Data: `rule` and `fields` (and `id`, `types`, `pack`), and `mode`:

- `small`: a letter on each field, the index of each row's first byte at its side, and a line that says what the pointer is on.
- `large`: bigger cells, a letter on each field and nothing else. Use it beside a field list, which has the names and the numbers.
- `annotated`: for a strip that stands alone. A ruler with every byte's index, each run of padding with its size, and each field's name where it fits: a field needs three bytes or more in one row to carry its name, and a name longer than those bytes is cut. A shorter field shows its letter only.

```mdx
import ByteStrip from '../../../components/ByteStrip.astro';

<ByteStrip id="sim.Particle" rule="c" mode="annotated" fields={[{ name: 'flags', type: 'u8' }, { name: 'id', type: 'u64' }]} />
```

## Before and after

Data: `from`, `to`, `unit`, `note`. Leave `to` out and it shows one number. The numbers are yours to supply, so take them from a command's output or a ledger, not from memory.

```mdx
import BeforeAfter from '../../../components/BeforeAfter.astro';

<BeforeAfter from={48} to={40} unit="bytes" note="render.Mesh, rule c" />
```

## Field list

Data: `rule` and `fields` (and `id`, `types`, `pack`). On its own it is read-only.

A row of padding says what forces it only when the numbers leave no other cause: `aligns the next field` when the run is shorter than the next field's alignment and that field starts on a multiple of it, and the same for the struct's own alignment at the end. The layout code gives the run and the alignments; naming the cause is this page's reading of them. Otherwise the row says only where the padding is and how long.

```mdx
import FieldList from '../../../components/FieldList.astro';

<FieldList id="sim.Particle" rule="c" fields={[{ name: 'flags', type: 'u8' }, { name: 'id', type: 'u64' }]} />
```

## Where the numbers come from

No component works out a size or an offset. While the site builds, the wrappers call the MoonBit layout code in `src/lib/usagui-layout/kernel.js`. In the browser, editing calls the same code again:

- If `public/dandori/layout.js` exists, the page uses it. It is the built module of `tools/dandori/web`. In the dandori-skills repository `npm run sync-layout` copies it there after `moon build --target js --release` in `tools/dandori`.
- If it does not exist, the page uses `kernel.js`, which ships with the site. A project that copied the starter is in this case, and editing works with no build step.

To give a copied site a newer module, build the tool that came with the skill (`moon build --target js --release` in the skill's `assets/tool`) and copy `_build/js/release/build/web/web.js` to `public/dandori/layout.js`.

## Colours

A struct's bytes have one palette, the block marked `dd-tokens` at the top of `src/styles/dandori.css`. Field n is `--dd-field-(n mod 10)`, padding is hatched in `--dd-pad-a` and `--dd-pad-b`. `StructLayout.astro` and `public/dd-layout.js` use the same tokens.

## Outside an Astro page

The elements need no framework. Copy `src/components/dd/` and the `dd-tokens` block, load `dd-components.css`, and load `dd-struct-showcase.js` as a module. Give the page a background and a text colour from the tokens (`body { background: var(--dd-surface); color: var(--dd-ink); }`): the tokens follow the viewer's light or dark setting, and a page left white under them shows dark cards with text too faint to read. Hand it the layout code with `setEngine` from `dd-engine.js`, or put the URL of the built module in the element's `engine` attribute.

```html
<dd-struct-showcase engine="/dandori/layout.js" commit="af3af03" date="2026-10-11"
  data-structs='[{ "id": "sim.Particle", "rule": "c", "fields": [{ "name": "flags", "type": "u8" }, { "name": "id", "type": "u64" }] }]'></dd-struct-showcase>
<script type="module" src="/dd/dd-struct-showcase.js"></script>
```

The picker takes its entries from a JSON script inside it, which suits a whole ledger:

```html
<dd-struct-picker engine="/dandori/layout.js" data-open='["render.mesh.Mesh"]'>
  <script type="application/json">[ ...the entries of ledgers/dataflow.json... ]</script>
</dd-struct-picker>
<script type="module" src="/dd/dd-struct-picker.js"></script>
```

In the dandori-skills repository, `node trials/showcase/g/build.mjs` writes the picker as one self-contained HTML file from these same files and a scanned ledger, and `node trials/showcase/f/build.mjs` writes the older page with one button per struct.

## When no component fits

Add one, so the next entry can reuse it:

1. A custom element in `src/components/dd/`, in plain JavaScript, with its styles in `dd-components.css` and its colours from the tokens.
2. Logic that turns data into what is drawn goes in a file with no DOM in it, as `dd-annotate.js` does, with a test in `dd-components.test.mjs`.
3. A thin wrapper in `src/components/` that takes props, renders a fallback, and loads the element.
4. A section on this page: the data it takes and a three-line example.

Build the expanded state from `ShowcaseCard`. Expanded, a view shows more at once. It does not show the same thing again: each name and each number is on the page once.
