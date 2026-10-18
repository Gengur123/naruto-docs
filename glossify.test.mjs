// Run with: node --test glossify.test.mjs
// Checks that glossary links go into prose only, not headings, code or existing links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml } from 'satteri';
import { glossify, slugOf } from './glossify.mjs';

const entries = [
  { term: 'wave', aliases: [], brief: 'A batch of tracks.' },
  { term: 'ledger', aliases: [], brief: 'A JSON file of entries.' },
];
const html = (md) => {
  const r = markdownToHtml(md, { mdastPlugins: [glossify(entries)] });
  return typeof r === 'string' ? r : r.html;
};

test('links a term in prose', () => {
  assert.match(html('The wave starts.'), /<a [^>]*dd-gloss[^>]*>wave<\/a>/);
});
test('skips headings, also under strong', () => {
  assert.doesNotMatch(html('## The **wave** loop\n\n# wave'), /dd-gloss/);
});
test('skips code', () => {
  assert.doesNotMatch(html('Use `wave` here.\n\n```\nwave\n```'), /dd-gloss/);
});
test('skips existing links, also under strong', () => {
  assert.doesNotMatch(html('[the **wave** plan](/x) and [wave](/y)'), /dd-gloss/);
});
test('skips text between raw code tags in a table cell', () => {
  const out = html('| a | b |\n|---|---|\n| x (<code>waves.no-estimates</code>) | wave |');
  assert.match(out, /<code>waves\.no-estimates<\/code>/);
  assert.match(out, /<a [^>]*dd-gloss[^>]*>wave<\/a>/); // the plain cell still links
});
test('skips text between raw code tags in a paragraph', () => {
  const out = html('The <code>ledger.sources.lines</code> key, and the ledger.');
  assert.match(out, /<code>ledger\.sources\.lines<\/code>/);
  assert.equal((out.match(/dd-gloss/g) ?? []).length, 1);
});
test('skips raw pre, kbd, a and heading tags, also under emphasis', () => {
  assert.doesNotMatch(html('<kbd>*wave*</kbd> and <a href="/x">the ledger</a> and <pre>a wave</pre> and a <h3>wave</h3>'), /dd-gloss/);
  assert.doesNotMatch(html('A <code>the *ledger* x</code> here.'), /dd-gloss/);
});
test('an opening tag that never closes does not stop linking', () => {
  assert.match(html('An odd <code tag, then the wave.'), /dd-gloss/);
  assert.match(html('Stray <a> then the wave.'), /dd-gloss/);
});
test('the anchor of a term matches the slug dandori gloss add writes', () => {
  assert.equal(slugOf('Track manager'), 'track-manager');
  assert.equal(slugOf('Ąžuolas'), 'ąžuolas');
  assert.equal(slugOf('  a -- b  '), 'a-b');
});
