---
title: Lesson player
description: How to write an explanation as a lesson, build it into one file with one command, and file it in the lorebook.
sidebar:
  order: 5
---

An explanation is a lesson: one screen that plays like a video, drawn live by code, about two minutes long, which the viewer can also take one step at a time. Each step has a card with the detail. Terms are links to the glossary.

Do not write a player, and do not write a long page of sections to scroll. Write the lesson as data and draw functions. The player, its layout and its checks are in `scripts/lesson-player/` and stay as they are.

```bash
npm run build-lesson -- <lesson folder> --out <folder>/player
npm run file-explanation -- <folder> --slug <slug> --title "<title>"
```

The second command looks for the built lesson at `<folder>/player/index.html`, so the first one builds it there.

`scripts/lesson-player/example/` is a whole lesson in four small files. Copy it to start.

## The folder

| File | What it is |
| --- | --- |
| `lesson.config.mjs` | The only file that names the others: `sources` (the lesson's scripts, in load order), `lesson` (the global they define), `styles` (the colour tokens), `glossary`. |
| `lesson.js` | One script that defines one global, the lesson object, with its draw functions. The player loads before it, so `LessonPlayer` is there. |
| `theme.css` | The colour tokens, for light and dark. |
| `glossary.json` | The terms: a list of `{ "term", "plain" }`. `plain` is one or two plain sentences. |

The player needs these tokens from `theme.css`, each for light and dark: `--bg`, `--panel` (the side area), `--rule` (hairlines), `--ink` (strong text and the main mark), `--text`, `--accent` (focus ring and term underline), `--font-body`, `--font-num`. Every other token is the lesson's own.

## The lesson object

```js
{ title, tokens, numbers, legend, pace, chapters: [ { title, steps: [ step, ... ] } ] }
```

- `title`: two to four words. It becomes the page title.
- `tokens`: `{ name: '--css-variable' }`. The player reads each colour from the CSS and hands it to the draw functions as `g.C.name`. It always reads `bg`, `panel`, `rule`, `ink`, `text` and `accent`. `numbers` does the same for plain numbers, such as an opacity. Give each colour one meaning and keep it for the whole lesson.
- `legend`: `[ { token, text, swatch } ]`, the colour code. It opens over the stage from a button in the bar. `swatch` is optional inline SVG.
- `pace`: optional, `{ wordsPerSecond, pad, silent }`. Without it a step is up for its caption's words ÷ 3, plus 1 second, and a step with no caption for 1 second.

## A step

| Field | What it is |
| --- | --- |
| `caption` | One short line for the film, 12 words or fewer. Its word count sets how long the step is up. A step with no caption keeps the caption before it. |
| `draw(g, p, s)` | Paints the stage for a progress `p` from 0 to 1. `g` is the canvas kit below. `s` is the step's own state. Where two steps show the same subject, make the frame at `p = 0` match the frame the step before ends on. |
| `card` | The detail, shown beside the stage (under it on an upright screen) when the film is paused or stepped. A string of simple HTML, or a function `card(s)` that returns one, so its numbers follow a drag. The film never waits for it. |
| `title` | Optional. The card's heading. Without it the heading is the chapter's title. |
| `state()` | Optional. Returns a fresh `s` each time the step is entered. |
| `handles(g, s)` | Optional. What can be dragged while paused. See below. |
| `drag` | A few words naming what can be dragged ("the green dot"). Shown as a hint. |
| `controls` | Optional. Sliders and switches at the top of the card. See below. |
| `dur` | Optional. Seconds, in place of the length worked out from the words. |

Put in the film only what can be read while it moves: what happens, in order, in plain words. Put on the card what a viewer stops for: the numbers, the formula in words, the exception, the reason. Name every symbol in plain words before using it, and prefer no letter symbols in captions at all.

A card may contain `<p>`, `<p class="sub">` for a smaller side note, `<b>` for a name being introduced, `<span class="n">` for numbers and sums, `<ul><li>`, and `<table>` with `<th>`, `<td>` and `<tr class="lit">` for the live row. Nothing else is styled. Nothing scrolls: a card taller than its area is cut into pages by the player, so keep cards short.

## Drag handles and controls

`handles(g, s)` returns a list. The player redraws and builds the card again after every `drag`, sets `s.touched`, and jumps the step to its finished picture. So a draw function shows everything when `s.touched` is set.

- A point: `{ x, y, r, drag(x, y), start(x, y) }`. `x, y` is where it is on the stage. `r` is how near a press has to be (16 for a mouse and 30 for a finger when left out). `drag` is called with the pointer's place on every move and changes `s`. `start` is optional and is called once when the drag begins.
- A region: `{ area: { x, y, w, h }, drag, start }`. A press anywhere in it that then moves is a drag. A press that does not move still plays or pauses. Points win over regions.

Keep what `drag` writes inside its limits yourself: the build drags every handle far off the stage.

`controls` is a list of `{ type: 'range', label, min, max, step, get(s), set(s, v), fmt }` and `{ type: 'choice', label, options, get(s), set(s, i) }`. The player reads `get(s)` again after every frame, so a control follows a drag and the step's own motion. When the draw function animates a value a control stands for, store it in `s` and return it from `get`.

## The canvas kit

Sizes are CSS pixels. `col` is any CSS colour. `o` is an options object.

| Call | What it does |
| --- | --- |
| `g.w`, `g.h` | The stage's width and height. Work every position out from these: the stage changes size. |
| `g.C` | The colours and numbers named in `tokens` and `numbers`, plus `fontBody` and `fontNum`. |
| `g.fs` | Text scale for this stage size, 0.92 to 1.4. Multiply your own sizes and offsets by it. Sizes given to `g.text` are multiplied for you. |
| `g.moving`, `g.paused`, `g.rm`, `g.dpr` | True while playing or dragging; true while not playing; true when the viewer asked for reduced motion; device pixel ratio, at most 2. |
| `g.ctx` | The raw 2D context, for anything the kit lacks. |
| `g.line(x1, y1, x2, y2, col, lw, dash)` | A line. `lw` defaults to 1. `dash` is an array such as `[4, 3]`. |
| `g.arrow(x1, y1, x2, y2, col, lw, dash)` | A line with a head at the second point. |
| `g.path(pts, { close, fill, stroke, lw, dash, cap })` | A polyline through `pts` (`[[x, y], ...]`), filled, stroked or both. |
| `g.rect(x, y, w, h, { fill, stroke, lw, dash })` | A rectangle. |
| `g.rrect(x, y, w, h, radius, { fill, stroke, lw, dash })` | A rounded rectangle. |
| `g.dot(x, y, r, col, hollow)` | A filled disc. With `hollow`, a ring filled with the background. |
| `g.ring(x, y, r, col, lw)` | A circle outline. |
| `g.disc(x, y, glyph, col, r)` | A disc with a minus sign, or a plus sign when `glyph` is `'+'`. |
| `g.text(s, x, y, { size, bold, mono, align, base, col, alpha, bg })` | Text. `size` defaults to 13, `align` to `'left'`, `base` to `'alphabetic'`. `mono` uses the number font. `bg` paints a patch of background behind it. |
| `g.tbox(s, x, y, o)` | The box that text would take: `{ x0, y0, x1, y1, w }`. Draws nothing. |
| `g.hits(box, boxes)` | True when `box` overlaps any of `boxes`. |
| `g.label(s, places, o, taken)` | Draws text at the first of `places` (`[[x, y, align], ...]`) that is on the stage and clear of the boxes in `taken`, then adds its own box to `taken`. Use one `taken` list for all labels of a picture so they do not overlap. |
| `g.clip(pts, fn)`, `g.clipRect({ x, y, w, h }, fn)` | Runs `fn` with drawing limited to the polygon or rectangle. |
| `g.alpha(a, fn)` | Runs `fn` at opacity `a`. Nothing is drawn when `a` is 0. |
| `g.hatch(x, y, w, h, col, gap)`, `g.dots(x, y, w, h, col)` | Fills a rectangle with slanted lines, or with small dots. |

Helpers a lesson can take from `LessonPlayer`:

| Helper | What it does |
| --- | --- |
| `cl(v, a, b)` | `v` kept between `a` and `b`. |
| `lerp(a, b, t)` | The value a fraction `t` of the way from `a` to `b`. |
| `sub(p, a, b)` | Progress inside a part of the step: 0 before `a`, 1 after `b`. Use it to give each thing its own slice of `p`. |
| `ease(t)`, `out(t)` | Smooth start and stop; fast start and soft stop. |
| `N(v, digits, keep)`, `PT([x, y], digits)` | A number as text with a real minus sign and no trailing zeros (`keep` keeps them); a pair. |
| `al(hex, a)`, `rgb(hex)` | A hex colour at opacity `a`; its three parts. |
| `esc(s)`, `clock(seconds)` | Text made safe for HTML; seconds as `m:ss`. |

## Glossary marks

Write a glossary term as `[[term]]`, or as `[[term|the words shown]]`, in any caption or card. The player turns the first one on each step into a link. A click pauses the film and opens that entry over the stage. Nothing is wired by hand.

Text painted on the stage cannot be a link. A term the stage uses should also be in that step's caption or card.

The glossary carries the common concepts, so the lesson does not explain them in passing. Say a thing once in its `plain` line and link it. A card that repeats a glossary entry is too long.

## What the build refuses, and why

The person this form was made for asked for "one video and steppable cards", and for a film of about two minutes: "9 minutes is quite long. I would try and have it or even make the playback much faster to like 2 minutes". The build holds a lesson to that. One broken rule stops it and nothing is written.

1. A caption has at most 12 words. A caption is read while the picture moves.
2. The film is at most 150 seconds at normal speed. Aim for about 120. A lesson that runs over has detail in the film that belongs on a card.
3. Every `[[term]]` is in the glossary.
4. Every glossary term that a caption or card uses, in the singular or plural, is a link the first time it appears on that step. A word followed by a dot and a letter, such as `main.rs`, is taken as a file name.
5. Every step draws without an error at five moments and three stage sizes, untouched and touched. Every handle can be dragged, also far off the stage. Every control keeps the value it is given. Every card builds and is not empty. A fault that breaks a step at many of those tries is reported once, with the first place it showed and the count.

A lesson's `limits` in `lesson.config.mjs` may lower the two numbers, never raise them. The build draws on a stand-in canvas, so it proves that nothing throws, not that the picture reads well. Open the built file and watch the film once at normal speed.

## Building

```bash
npm run build-lesson -- <lesson folder>
npm run build-lesson -- <lesson folder> --check
npm run build-lesson -- <lesson folder> --out <folder>
```

It writes three files in the lesson folder, or in the `--out` folder:

- `index.html`: the whole lesson in one file. It opens from disk and loads nothing else.
- `body.html`: the same without document tags, for a host that supplies its own.
- `timeline.txt`: every chapter and step with its start time, length and words. Read it to see where the seconds go.

`--check` runs the rules, prints the timeline and writes nothing. `--glossary-base <address>` makes every term a real link to the address plus the term's anchor; the filing command sets it for you.

## Narration

A step may carry `say`: what a narrator says while the step is up. Write it as speech, one or two short sentences. It is not the caption read aloud: the caption names what is on the stage, the `say` line tells the viewer why it matters. It changes nothing about the film's length.

```bash
npm run narrate -- <lesson folder> --dry-run
npm run narrate -- <lesson folder>
npm run build-lesson -- <lesson folder>
```

`narrate` sends each `say` line to Cartesia text-to-speech and writes one clip per step into `<lesson folder>/narration/`, with a `manifest.json` (step id, file, duration, hash of the text). A step's id is its chapter and step number, such as `2-3`, or its own `id`. A line that has not changed is not spoken again. The key is read from the environment variable `CARTESIA_API_KEY` only. The voice is `--voice <id>`, or `CARTESIA_VOICE_ID`, or the Tails voice. `--dry-run` lists what would be spoken and needs no key.

The build then puts the clips whose text is still current into the page: inside `index.html` while together they are under 8 MB, otherwise as files in a `narration` folder that must stay beside it. The player shows a narration button only when the page has clips. It is off at first, and then the film is exactly as without clips. On, each step plays its clip and the film waits for the clip to end; pause pauses the voice; the speed setting does not change the voice.

The page keeps the player as `window.lessonPlayer`: `play`, `pause`, `toggle`, `next`, `prev`, `seek(seconds)`, `goStep(index, animate)`, `state()`, `handles()` and `plan`. A browser check can drive it with these.

## Filing

Build the lesson into a folder named `player`, beside the explanation's other files:

```text
<folder>/player/index.html   the built lesson
<folder>/glossary.json       optional: the terms, when the page should list more than the lesson's own
<folder>/pacify.md           optional: the Pacify reply
<folder>/video/*.mp4         optional: an encoded video, shown as the long form
<folder>/summary.md          optional: a few plain lines for the page
```

```bash
npm run build-lesson -- <lesson folder> --out <folder>/player
npm run file-explanation -- <folder> --slug <slug> --title "<title>" --description "<one line>"
npm run live
```

The page it writes under Lorebook, Explanations shows the lesson first, playable in the page, then any video, the Pacify reply and the terms. The terms go into `ledgers/glossary.json`, so the Glossary page has an entry for each, and the filed copy of the lesson links every term to its entry there. The built lesson carries its own glossary. A term in it that `<folder>/glossary.json` lacks is taken from the lesson, and the command says how many it took, so a term link never leads to an entry that is not there.

Search finds the page by its title, the text written on it and its list of terms, once `npm run live` has rebuilt the site. The lesson plays in a frame, so the words of its captions and cards are not searched. Write the words a person would search for in the lines at the top of the page.

Give the owner the address the command prints. Run the same command again when the lesson changes: the text a person wrote on the page is kept.

## What the player does, so the lesson need not

- It starts paused on the first frame with one Play button. It never starts by itself.
- Play and pause: the button, the space bar, a click on the stage. Steps: the two buttons and the left and right arrow keys. A step's motion runs once and stops at its end.
- A scrubber with chapter marks, the time, and speeds of 0.75, 1, 1.5 and 2 times.
- The side area shows the chapter list while the film plays and the step's card when it is paused or stepped.
- It fits upright and narrow screens, follows light and dark, and jumps to finished pictures when the viewer asked for reduced motion.

One page holds one player.
