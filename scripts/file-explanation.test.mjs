// Files a made-up explanation into an empty scratch site, three times, and checks what a
// person would notice: the artifacts are on the page, the terms reach the glossary, text a
// person wrote survives, and a run with nothing new changes nothing.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fileExplanation, ledgerText, mergeTerms, parseArgs, slugOf } from './file-explanation.mjs';

// One scratch folder, reused. Old files are removed one at a time; folders stay.
function emptied(dir) {
  mkdirSync(dir, { recursive: true });
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) emptied(join(dir, e.name));
    else unlinkSync(join(dir, e.name));
  }
  return dir;
}

test('arguments: a folder, a slug and a title are needed, and the slug is checked', () => {
  assert.equal(parseArgs(['in', '--slug', 'how-rain-works', '--title', 'Rain']).slug, 'how-rain-works');
  assert.throws(() => parseArgs(['in', '--slug', 'how-rain-works']), /usage/);
  assert.throws(() => parseArgs(['in', '--slug', 'How Rain', '--title', 'Rain']), /not a slug/);
  assert.throws(() => parseArgs(['in', '--slug', 'x', '--title', 'Rain', '--nope']), /unknown option/);
});

test('the ledger is written in the layout the tool uses', () => {
  const entries = [{ term: 'wave', aliases: ['waves'], brief: 'A set of tracks.', page: '/glossary/#wave', tags: ['process'] }];
  assert.equal(ledgerText(entries),
    '[\n  {\n    "term": "wave",\n    "aliases": ["waves"],\n    "brief": "A set of tracks.",\n    "page": "/glossary/#wave",\n    "tags": ["process"]\n  }\n]\n');
  assert.equal(ledgerText([]), '[]\n');
});

test('a term the glossary already has keeps its own line', () => {
  const entries = [{ term: 'wave', aliases: ['waves'], brief: 'A set of tracks.', page: '/glossary/#wave', tags: ['process'] }];
  const r = mergeTerms(entries, [{ term: 'Waves', plain: 'Water moving.' }, { term: 'pixel centre', plain: 'The middle.' }], 'rain');
  assert.equal(r.added, 1);
  assert.equal(r.kept, 1);
  assert.equal(r.entries[0].brief, 'A set of tracks.');
  assert.deepEqual(r.entries[1], { term: 'pixel centre', aliases: [], brief: 'The middle.', page: '/glossary/#pixel-centre', tags: ['explanation', 'rain'] });
  assert.equal(slugOf('2 × 2 pixel block'), '2-2-pixel-block');
});

test('filing writes the page, the files and the terms; filing again changes nothing', () => {
  const scratch = emptied(join(tmpdir(), 'dandori-file-explanation-test'));
  const folder = join(scratch, 'in');
  const site = join(scratch, 'site');
  mkdirSync(join(folder, 'explainer'), { recursive: true });
  mkdirSync(join(folder, 'video'), { recursive: true });
  mkdirSync(join(site, 'ledgers'), { recursive: true });
  writeFileSync(join(folder, 'explainer', 'index.html'), '<!doctype html><title>Rain</title><p>drops</p>');
  writeFileSync(join(folder, 'video', 'rain-1.mp4'), 'not really a video');
  writeFileSync(join(folder, 'video', 'storyboard.png'), 'not copied');
  writeFileSync(join(folder, 'glossary.json'), JSON.stringify([{ term: 'drop <size>', plain: 'How wide a drop is & why.' }]));
  writeFileSync(join(folder, 'summary.md'), 'Why rain falls in drops.\n');
  writeFileSync(join(site, 'ledgers', 'glossary.json'), '[]\n');
  const args = { folder, site, slug: 'how-rain-works', title: 'How rain works', description: 'Rain, drop by drop.', asked: null };

  const first = fileExplanation(args, { now: new Date(2026, 9, 11) });
  assert.equal(first.pageNew, true);
  assert.equal(first.copied, 2);
  const pageFile = join(site, 'src', 'content', 'docs', 'lorebook', 'Explanations', 'how-rain-works.md');
  let page = readFileSync(pageFile, 'utf8');
  assert.match(page, /^---\ntitle: "How rain works"\ndescription: "Rain, drop by drop\."\n---\n/);
  assert.match(page, /Filed on 2026-10-11\./);
  assert.match(page, /Why rain falls in drops\./);
  assert.match(page, /<iframe src="\/explanations\/how-rain-works\/explainer\/index\.html"/);
  assert.match(page, /<video controls preload="metadata" src="\/explanations\/how-rain-works\/video\/rain-1\.mp4"/);
  assert.match(page, /<dt><a href="\/glossary\/#drop-size">drop &lt;size&gt;<\/a><\/dt><dd>How wide a drop is &amp; why\.<\/dd>/);
  assert.ok(existsSync(join(site, 'public', 'explanations', 'how-rain-works', 'video', 'rain-1.mp4')));
  assert.ok(!existsSync(join(site, 'public', 'explanations', 'how-rain-works', 'video', 'storyboard.png')));
  const ledger = JSON.parse(readFileSync(join(site, 'ledgers', 'glossary.json'), 'utf8'));
  assert.deepEqual(ledger[0].tags, ['explanation', 'how-rain-works']);

  // A person edits the text; the video is rendered again.
  page = page.replace('Why rain falls in drops.', 'Why rain falls in drops. The user: keep this line.');
  writeFileSync(pageFile, page);
  writeFileSync(join(folder, 'video', 'rain-1.mp4'), 'a second render, longer');
  const second = fileExplanation(args);
  assert.equal(second.pageNew, false);
  assert.equal(second.copied, 1);
  assert.equal(second.added, 0);
  const after = readFileSync(pageFile, 'utf8');
  assert.match(after, /The user: keep this line\./);
  assert.match(after, /Filed on 2026-10-11\./);
  assert.equal(readFileSync(join(site, 'public', 'explanations', 'how-rain-works', 'video', 'rain-1.mp4'), 'utf8'), 'a second render, longer');

  const ledgerBefore = readFileSync(join(site, 'ledgers', 'glossary.json'), 'utf8');
  const third = fileExplanation(args);
  assert.equal(third.copied, 0);
  assert.equal(third.pageChanged, false);
  assert.equal(readFileSync(pageFile, 'utf8'), after);
  assert.equal(readFileSync(join(site, 'ledgers', 'glossary.json'), 'utf8'), ledgerBefore);
  assert.deepEqual(third.leftover, []);

  // The video is taken out of the source: the page drops it, the copy stays and is named.
  writeFileSync(join(folder, 'video', 'rain-2.mp4'), 'a second video');
  assert.deepEqual(fileExplanation(args).leftover, []);
  unlinkSync(join(folder, 'video', 'rain-2.mp4'));
  const fifth = fileExplanation(args);
  assert.deepEqual(fifth.leftover, ['video/rain-2.mp4']);
  assert.ok(existsSync(join(site, 'public', 'explanations', 'how-rain-works', 'video', 'rain-2.mp4')));
  assert.doesNotMatch(readFileSync(pageFile, 'utf8'), /rain-2.mp4/);
});

test('a folder with nothing to play is refused', () => {
  const scratch = emptied(join(tmpdir(), 'dandori-file-explanation-empty'));
  writeFileSync(join(scratch, 'glossary.json'), '[]');
  assert.throws(() => fileExplanation({ folder: scratch, site: join(scratch, 'site'), slug: 'x', title: 'X' }), /nothing to file/);
});

test('a built lesson is the main artifact: first on the page, linked to the glossary, safe to file twice', async () => {
  const { buildLesson } = await import('./build-lesson.mjs');
  const scratch = emptied(join(tmpdir(), 'dandori-file-explanation-lesson'));
  const folder = join(scratch, 'in');
  const site = join(scratch, 'site');
  mkdirSync(join(folder, 'explainer'), { recursive: true });
  mkdirSync(join(folder, 'video'), { recursive: true });
  const example = join(dirname(fileURLToPath(import.meta.url)), 'lesson-player', 'example');
  await buildLesson(example, { out: join(folder, 'player') });
  writeFileSync(join(folder, 'explainer', 'index.html'), '<!doctype html><title>Old</title><p>twelve sections to scroll</p>');
  writeFileSync(join(folder, 'video', 'long.mp4'), 'not really a video');
  writeFileSync(join(folder, 'pacify.md'), 'Stopped.\n\n**What I think you want.** To see how two values mix.\n');
  writeFileSync(join(folder, 'glossary.json'), readFileSync(join(example, 'glossary.json'), 'utf8'));
  const args = { folder, site, slug: 'blending', title: 'Blending two values', description: null, asked: null, without: ['explainer'] };

  const first = fileExplanation(args, { now: new Date(2026, 9, 11) });
  assert.equal(first.copied, 2);
  const pageFile = join(site, 'src', 'content', 'docs', 'lorebook', 'Explanations', 'blending.md');
  const page = readFileSync(pageFile, 'utf8');
  const at = (text) => { const i = page.indexOf(text); assert.ok(i >= 0, `the page has no "${text}"`); return i; };
  // The order a reader meets: the lesson, the long form, the Pacify reply, the terms.
  const order = [at('<iframe src="/explanations/blending/player/index.html"'), at('## The long form: video'), at('## The Pacify reply'), at('**What I think you want.**'), at('## Terms it introduced'), at('## Files')];
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.doesNotMatch(page, /explainer/, 'the part left out is not on the page');
  assert.ok(!existsSync(join(site, 'public', 'explanations', 'blending', 'explainer', 'index.html')));
  // The copy links its terms to the site's Glossary page; the source does not.
  const copy = readFileSync(join(site, 'public', 'explanations', 'blending', 'player', 'index.html'), 'utf8');
  assert.ok(copy.includes('<div id="lesson" data-glossary-base="../../../glossary/#"></div>'));
  assert.ok(readFileSync(join(folder, 'player', 'index.html'), 'utf8').includes('<div id="lesson"></div>'));
  assert.match(page, /<dt><a href="\/glossary\/#weight">weight<\/a><\/dt>/);

  const again = fileExplanation(args);
  assert.equal(again.copied, 0);
  assert.equal(again.pageChanged, false);
  assert.equal(readFileSync(join(site, 'public', 'explanations', 'blending', 'player', 'index.html'), 'utf8'), copy);

  // Text a person wrote above the first mark and below the second is kept.
  writeFileSync(pageFile, page.replace('Write here,', 'The user wrote this. Write here,') + '\n## What it covers\n\nKept too.\n');
  writeFileSync(join(folder, 'pacify.md'), 'Stopped. A second reply.\n');
  const third = fileExplanation(args);
  assert.equal(third.pageChanged, true);
  const after = readFileSync(pageFile, 'utf8');
  assert.match(after, /The user wrote this\./);
  assert.match(after, /<!-- filed:end -->\n\n## What it covers\n\nKept too\.\n$/);
  assert.match(after, /A second reply\./);

  // A term the lesson links and glossary.json lacks is taken from the lesson, so every
  // link in the filed copy has an entry: with a partial list, and with no list at all.
  const ledgerTerms = (s) => JSON.parse(readFileSync(join(s, 'ledgers', 'glossary.json'), 'utf8')).map((e) => e.term).sort();
  for (const [name, list] of [['partial', [{ term: 'blend', plain: 'The folder\'s own line.' }]], ['none', null]]) {
    const other = join(scratch, `site-${name}`);
    if (list) writeFileSync(join(folder, 'glossary.json'), JSON.stringify(list));
    else unlinkSync(join(folder, 'glossary.json'));
    const r = fileExplanation({ ...args, site: other });
    assert.equal(r.fromLesson, list ? 1 : 2, name);
    assert.equal(r.terms, 2, name);
    assert.deepEqual(ledgerTerms(other), ['blend', 'weight'], name);
    const filed = readFileSync(join(other, 'src', 'content', 'docs', 'lorebook', 'Explanations', 'blending.md'), 'utf8');
    assert.match(filed, /<dt><a href="\/glossary\/#weight">weight<\/a><\/dt>/, name);
    if (list) assert.match(filed, /The folder&#39;s own line\.|The folder's own line\./, name);
  }

  // A page that is not a built lesson is not passed off as one.
  writeFileSync(join(folder, 'player', 'index.html'), '<!doctype html><p>hand-made</p>');
  assert.throws(() => fileExplanation(args), /was not built by `npm run build-lesson`/);
  assert.throws(() => parseArgs(['in', '--slug', 'x', '--title', 'X', '--without', 'glossary']), /--without takes one of/);
  assert.deepEqual(parseArgs(['in', '--slug', 'x', '--title', 'X', '--without', 'explainer']).without, ['explainer']);
});
