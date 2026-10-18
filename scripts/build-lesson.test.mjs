// Builds the tiny example lesson into a scratch folder and checks what a person would
// notice: one file that needs nothing else, the limits kept, terms linked, and a lesson that
// breaks a rule refused with nothing written.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildLesson, checkLesson, parseArgs, withGlossaryBase } from './build-lesson.mjs';
import { LIMITS } from './lesson-player/lesson-check.mjs';
import { slugOf } from './file-explanation.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const example = join(here, 'lesson-player', 'example');

// One scratch folder, reused. Old files are removed one at a time; folders stay.
function emptied(dir) {
  mkdirSync(dir, { recursive: true });
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) emptied(join(dir, e.name));
    else unlinkSync(join(dir, e.name));
  }
  return dir;
}

// A lesson folder with one step, written into scratch. `step` is the text of the step object.
function lessonFolder(dir, step, glossary = '[{ "term": "weight", "plain": "A share." }]', config = '') {
  emptied(dir);
  writeFileSync(join(dir, 'theme.css'), ':root { --bg: #fff; --panel: #eee; --rule: #ccc; --ink: #000; --text: #333; --accent: #00f; --font-body: sans-serif; --font-num: monospace; }\n');
  writeFileSync(join(dir, 'glossary.json'), glossary);
  writeFileSync(join(dir, 'lesson.js'), `var L = { title: 'One step', chapters: [{ title: 'Only', steps: [${step}] }] };\n`);
  writeFileSync(join(dir, 'lesson.config.mjs'), `export default { sources: ['lesson.js'], lesson: 'L', styles: ['theme.css'], glossary: 'glossary.json'${config} };\n`);
  return dir;
}

test('arguments: one folder, and the options it knows', () => {
  assert.deepEqual(parseArgs(['in', '--out', 'o', '--glossary-base', '/glossary/#']), { folder: 'in', out: 'o', glossaryBase: '/glossary/#', check: false });
  assert.equal(parseArgs(['in', '--glossary-base=/g/#', '--check']).glossaryBase, '/g/#');
  assert.throws(() => parseArgs([]), /usage/);
  assert.throws(() => parseArgs(['in', '--nope']), /unknown option/);
});

test('the example lesson builds into one file that needs nothing else', async () => {
  const out = emptied(join(tmpdir(), 'dandori-build-lesson-test', 'out'));
  const r = await buildLesson(example, { out });
  assert.deepEqual(r.written.sort(), ['body.html', 'index.html', 'timeline.txt']);
  const index = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(index, /^<!doctype html>/);
  assert.match(index, /<title>Blending two values<\/title>/);
  assert.ok(index.includes('var LessonPlayer = (function () {'), 'the player is in the file');
  assert.ok(index.includes('var EXAMPLE_LESSON = (function () {'), 'the lesson is in the file');
  assert.ok(index.includes('.lp-stage'), 'the player layout is in the file');
  assert.ok(index.includes('--mix:'), 'the lesson colours are in the file');
  assert.doesNotMatch(index, /<script[^>]*\ssrc=|<link[^>]*rel="stylesheet"|@import/, 'no file is loaded from elsewhere');
  assert.doesNotMatch(readFileSync(join(out, 'body.html'), 'utf8'), /<!doctype|<html|<head|<body/i);
  assert.match(readFileSync(join(out, 'timeline.txt'), 'utf8'), /^Film: 3 steps in 2 chapters, 13\.0 s/);
  assert.ok(r.seconds <= LIMITS.filmSeconds);
  assert.equal(r.termsUsed, 2);
  // Nothing was written beside the example itself.
  assert.ok(!existsSync(join(example, 'index.html')), 'the example folder holds sources only');

  const again = await buildLesson(example, { out });
  assert.deepEqual(again.written, [], 'a second build of the same lesson writes nothing');
});

test('a glossary address is baked in, and can be set on a built page afterwards', async () => {
  const r = await checkLesson(example, { glossaryBase: '/glossary/#' });
  assert.ok(r.index.includes('<div id="lesson" data-glossary-base="/glossary/#"></div>'));
  const plain = (await checkLesson(example)).index;
  assert.ok(plain.includes('<div id="lesson"></div>'));
  assert.equal(withGlossaryBase(plain, '/glossary/#'), r.index);
  assert.equal(withGlossaryBase(r.index, ''), plain);
  assert.equal(withGlossaryBase('<p>some other page</p>', '/glossary/#'), null);
});

test('the player gives a term the same anchor as the Glossary page', async () => {
  const src = readFileSync(join(here, 'lesson-player', 'lesson-player.js'), 'utf8');
  const LP = new Function(`${src}\nreturn LessonPlayer;`)();
  for (const term of ['weight', 'quadratic Bézier curve', '2 × 2 pixel block', 'pixels per unit (ppe)', '32-bit float']) {
    assert.equal(LP.slug(term), slugOf(term), term);
  }
});

test('a lesson that breaks a rule is refused and nothing is written', async () => {
  const scratch = join(tmpdir(), 'dandori-build-lesson-test');
  const out = emptied(join(scratch, 'refused'));
  const draw = 'draw: function () {}';
  const refused = async (step, want, glossary, config) => {
    const folder = lessonFolder(join(scratch, 'bad'), step, glossary, config);
    await assert.rejects(() => buildLesson(folder, { out }), (e) => { assert.match(e.message, want); return true; });
    assert.deepEqual(readdirSync(out), [], 'nothing written');
  };
  await refused(`{ caption: 'one two three four five six seven eight nine ten eleven twelve thirteen', card: '<p>x</p>', ${draw} }`, /caption has 13 words, more than 12/);
  await refused(`{ caption: 'Short.', dur: 151, card: '<p>x</p>', ${draw} }`, /the film is 151\.0 s at normal speed, more than 150/);
  await refused(`{ caption: 'A [[share]] of it.', card: '<p>x</p>', ${draw} }`, /\[\[share\]\] is not in the glossary/);
  await refused(`{ caption: 'The weight decides.', card: '<p>x</p>', ${draw} }`, /glossary term "weight" appears as plain words/);
  await refused(`{ caption: 'It breaks.', card: '<p>x</p>', draw: function (g) { g.nothing.here(); } }`, /step 1 at 912x643 p=0: .*\(the same in 30 of the 30 tries of this step\)\n\n1 problem\./);
  await refused(`{ caption: 'No card.', ${draw} }`, /empty card/);
  await refused(`{ caption: 'Fine.', card: '<p>x</p>', ${draw} }`, /limits\.filmSeconds is 600; it may be lowered from 150, not raised/, undefined, ', limits: { filmSeconds: 600 }');

  // The same folder with the rule kept builds.
  const good = lessonFolder(join(scratch, 'bad'), `{ caption: 'The [[weight]] decides.', card: '<p>x</p>', ${draw} }`);
  const r = await buildLesson(good, { out });
  assert.equal(r.steps, 1);
  assert.ok(existsSync(join(out, 'index.html')));
});
