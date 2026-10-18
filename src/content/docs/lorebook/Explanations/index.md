---
title: Explanations
description: Lessons, videos and interactive pages made to explain something, kept where they can be opened and searched again.
sidebar:
  order: 0
---

Nothing is filed here yet. This section holds one page per explanation the owner asked for: the explanation playable on the page, the terms it introduced with a link to each one's Glossary entry, and a few plain lines on what it covers.

The main form is a lesson for the lesson player: one screen that plays like a video, about two minutes at normal speed, with a card for every step. The Lesson player page under Tools says how to write one. `npm run build-lesson -- <lesson folder> --out <folder>/player` builds it into one file.

File one from this site's folder:

```bash
npm run file-explanation -- <folder> --slug <slug> --title "<title>" --description "<one line>"
```

It reads `player/index.html` (the built lesson), `explainer/index.html`, `video/*.mp4` or `*.webm`, `pacify.md`, `glossary.json` (a list of `{ "term", "plain" }`) and `summary.md` from the folder; it needs at least a lesson, a page or a video. Run it again when one of them changes: the text you wrote outside the two `filed` marks is kept. Then run `npm run live`, which rebuilds the site and its search.
