// lesson-check.mjs: checks any lesson written for lesson-player.js, in Node, with no browser.
// It knows nothing about one lesson; the lesson folder's lesson.config.mjs names its files.
// scripts/build-lesson.mjs runs all of it before it writes anything.
//   load(config, dir)            reads the player and the lesson's sources; returns { LP, lesson, js }
//   lint(LP, lesson, glossary, limits)   the rules; returns { problems, used, timeline, plan, terms }
//   exercise(LP, lesson)         draws every step on a stand-in canvas at several moments and sizes,
//                                drags every handle, tries every control, builds every card;
//                                returns { bad, moved, cards, calls, steps }
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// The one copy of the player. Every lesson is built from these two files.
export const PLAYER_JS = join(here, 'lesson-player.js');
export const PLAYER_CSS = join(here, 'player.css');
// The limits every lesson keeps. A lesson's config may set lower ones, never higher.
export const LIMITS = { captionWords: 12, filmSeconds: 150 };

export function limitsOf(config) {
  const asked = config.limits ?? {};
  const out = { ...LIMITS };
  for (const k of Object.keys(LIMITS)) {
    if (asked[k] === undefined) continue;
    if (!(asked[k] > 0) || asked[k] > LIMITS[k]) {
      throw new Error(`lesson.config.mjs: limits.${k} is ${asked[k]}; it may be lowered from ${LIMITS[k]}, not raised`);
    }
    out[k] = asked[k];
  }
  return out;
}

// The player first, then the lesson's own scripts in the order the config gives.
export function load(config, dir) {
  if (!Array.isArray(config.sources) || config.sources.length === 0) {
    throw new Error('lesson.config.mjs: sources must list the lesson\'s script files');
  }
  if (typeof config.lesson !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(config.lesson)) {
    throw new Error('lesson.config.mjs: lesson must be the name of the global that holds the lesson object');
  }
  const js = [PLAYER_JS, ...config.sources.map(f => join(dir, f))].map(f => readFileSync(f, 'utf8').trim());
  const got = new Function(js.join('\n') + `\nreturn { LP: LessonPlayer, lesson: typeof ${config.lesson} === 'undefined' ? undefined : ${config.lesson} };`)();
  if (!got.lesson || !Array.isArray(got.lesson.chapters)) {
    throw new Error(`the sources do not define a lesson object named ${config.lesson} with chapters`);
  }
  return { LP: got.LP, lesson: got.lesson, js };
}

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function lint(LP, lesson, glossary, limits = LIMITS) {
  const plan = LP.plan(lesson);
  const terms = new Map(glossary.map(g => [g.term, g]));
  const byLength = [...terms.keys()].sort((a, b) => b.length - a.length);
  const problems = [], used = new Set(), lines = [];
  plan.steps.forEach(e => {
    const step = e.step, where = `chapter ${e.ch + 1} step ${e.k + 1}`;
    const cardRaw = typeof step.card === 'function' ? step.card(step.state ? step.state() : {}) : (step.card || '');
    const caption = step.caption || '';
    const w = LP.words(caption);
    if (w > limits.captionWords) problems.push(`${where}: caption has ${w} words, more than ${limits.captionWords}`);
    if (typeof step.draw !== 'function') problems.push(`${where}: no draw function`);
    // every marked term is in the glossary
    for (const t of [...LP.termsIn(caption), ...LP.termsIn(cardRaw)]) {
      if (!terms.has(t)) problems.push(`${where}: [[${t}]] is not in the glossary`); else used.add(t);
    }
    // every glossary term the words use is a link the first time it appears on the step
    // (a term followed by a dot and a letter is a file name, such as coverage.wgsl, and is left alone)
    const text = caption + '\n' + cardRaw.replace(/<[^>]*>/g, m => ' '.repeat(m.length));
    const firstMark = new Map();
    let masked = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, term, shown, off) => {
      term = term.trim(); if (!firstMark.has(term)) firstMark.set(term, off);
      return ' '.repeat(m.length);
    });
    for (const term of byLength) {
      const re = new RegExp('(?<![A-Za-z0-9])' + reEsc(term) + '(?:e?s)?(?![A-Za-z0-9]|\\.[A-Za-z])', 'gi');
      let first = -1;
      masked = masked.replace(re, (hit, off) => { if (first < 0) first = off; return ' '.repeat(hit.length); });
      if (first >= 0 && !(firstMark.has(term) && firstMark.get(term) < first))
        problems.push(`${where}: the glossary term "${term}" appears as plain words before (or without) its [[link]]: "...${text.slice(Math.max(0, first - 25), first + term.length + 15).replace(/\s+/g, ' ')}..."`);
    }
    lines.push(`  ${LP.clock(e.start)}  ${e.dur.toFixed(2)}s  ${String(w).padStart(2)} words  ${LP.plain(caption) || '(no words)'}`);
  });
  if (plan.total > limits.filmSeconds) problems.push(`the film is ${plan.total.toFixed(1)} s at normal speed, more than ${limits.filmSeconds}`);
  let timeline = `Film: ${plan.steps.length} steps in ${plan.chapters.length} chapters, ${plan.total.toFixed(1)} s (${LP.clock(plan.total)}) at normal speed\n`;
  plan.chapters.forEach((c, i) => { timeline += `\n${LP.clock(c.start)}  ${i + 1}. ${c.title}\n` + lines.slice(c.first, c.first + c.n).join('\n') + '\n'; });
  return { problems, used, timeline, plan, terms };
}

export function exercise(LP, lesson, sizes = [[912, 643], [400, 363], [560, 291]]) {
  // a stand-in canvas: every drawing call is accepted and forgotten
  let calls = 0;
  const ctx = () => new Proxy({}, { get: (o, k) => k === 'measureText' ? (s => ({ width: String(s).length * 7 })) : k === 'createImageData' ? ((w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })) : k === 'getTransform' ? (() => ({ a: 1 })) : (k in o ? o[k] : (() => { calls++; })), set: (o, k, v) => { o[k] = v; return true; } });
  const hadDoc = 'document' in globalThis, oldDoc = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: ctx }) };
  ['bg', 'panel', 'rule', 'ink', 'text', 'accent', ...Object.keys(lesson.tokens || {})].forEach(k => { LP.C[k] = '#808080'; });
  Object.keys(lesson.numbers || {}).forEach(k => { LP.C[k] = 0.25; });
  LP.C.fontBody = 'sans-serif'; LP.C.fontNum = 'monospace';
  // One fault usually breaks a step at every moment and size. It is reported once per step,
  // with the first place it showed and how many of the tries it broke.
  const plan = LP.plan(lesson), faults = new Map();
  let moved = 0, cards = 0, tries = 0;
  for (const [w, h] of sizes) plan.steps.forEach((e, i) => {
    const step = e.step;
    for (const touched of [false, true]) for (const p of [0, 0.2, 0.5, 0.8, 1]) {
      if (i === 0) tries++;
      try {
        const s = step.state ? step.state() : {}; if (touched) s.touched = true;
        const g = LP.makeG(ctx(), w, h); g.dpr = 1; g.moving = p < 1; g.paused = true;
        step.draw(g, p, s);
        const card = typeof step.card === 'function' ? step.card(s) : step.card; if (!card) throw new Error('empty card'); cards++;
        if (p === 1 && step.handles) for (const hd of step.handles(g, s) || []) {
          const x = hd.area ? hd.area.x + hd.area.w / 2 : hd.x, y = hd.area ? hd.area.y + hd.area.h / 2 : hd.y;
          if (hd.start) hd.start(x, y); hd.drag(x + 25, y - 15); hd.drag(-500, 9000); hd.drag(x + 5, y + 5); moved++;
          step.draw(g, 1, s); if (typeof step.card === 'function') step.card(s);
        }
        if (p === 1) for (const c of step.controls || []) {
          const vals = c.type === 'range' ? [c.min, c.max, (c.min + c.max) / 2] : c.options.map((_, k) => k);
          for (const v of vals) { c.set(s, v); if (c.get(s) !== v) throw new Error('control ' + c.label + ' did not keep ' + v); step.draw(g, 1, s); if (typeof step.card === 'function') step.card(s); }
        }
      } catch (err) {
        const key = `${i}\n${err.message}`;
        const f = faults.get(key);
        if (f) f.n++; else faults.set(key, { n: 1, text: `step ${i + 1} at ${w}x${h} p=${p}${touched ? ' touched' : ''}: ${err.message}` });
      }
    }
  });
  const bad = [...faults.values()].map(f => f.n === 1 ? f.text : `${f.text} (the same in ${f.n} of the ${tries} tries of this step)`);
  if (hadDoc) globalThis.document = oldDoc; else delete globalThis.document;
  return { bad, moved, cards, calls, steps: plan.steps.length };
}
