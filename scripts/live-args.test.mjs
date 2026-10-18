import test from 'node:test';
import assert from 'node:assert/strict';
import { addressFor, newestSprint, parseArgs, portFrom, searchIndexFor, windowPathFor } from './live-args.mjs';

test('the newest sprint is the one with the highest leading number, not the last in text order', () => {
  assert.equal(newestSprint(['9-old.json', '10-new.json', '02-mid.json']), '10-new');
  assert.equal(newestSprint(['01-first-sprint.json']), '01-first-sprint');
  assert.equal(newestSprint(['03-b.json', '03-a.json']), '03-b');
});

test('files that are not sprint ledgers are ignored, and no ledger means no sprint', () => {
  assert.equal(newestSprint(['notes.txt', 'README.md', '2-.json', 'Bad_Name.json']), null);
  assert.equal(newestSprint([]), null);
  assert.equal(newestSprint(['01-a.json', 'z-notes.json']), '01-a');
});

test('the port comes from DANDORI_DOCS_PORT, and is null (pick a free one) when unset or empty', () => {
  assert.equal(portFrom({}), null);
  assert.equal(portFrom({ DANDORI_DOCS_PORT: '' }), null);
  assert.equal(portFrom({ DANDORI_DOCS_PORT: '  ' }), null);
  assert.equal(portFrom({ DANDORI_DOCS_PORT: '4400' }), 4400);
  assert.equal(portFrom({ DANDORI_DOCS_PORT: ' 8080 ' }), 8080);
});

test('a port that is not a whole number in range is an error, not a silent default', () => {
  for (const bad of ['abc', '0', '70000', '43.5', '-1']) {
    assert.throws(() => portFrom({ DANDORI_DOCS_PORT: bad }), /DANDORI_DOCS_PORT/, bad);
  }
});

test('the address names the chosen sprint on the chosen port, or the sprints index', () => {
  assert.equal(addressFor(4400, '02-newer'), 'http://127.0.0.1:4400/sprints/02-newer/');
  assert.equal(addressFor(4331, null), 'http://127.0.0.1:4331/llms/index.md');
});

test('arguments: an optional sprint name and --window, in any order', () => {
  const plain = { sprint: null, window: false, shell: 'auto', dev: false, stop: false, check: false };
  assert.deepEqual(parseArgs([]), plain);
  assert.deepEqual(parseArgs(['03-save-format']), { ...plain, sprint: '03-save-format' });
  assert.deepEqual(parseArgs(['--window', '03-save-format']), { ...plain, sprint: '03-save-format', window: true });
  assert.deepEqual(parseArgs(['--window=wails', '01-a']), { ...plain, sprint: '01-a', window: true, shell: 'wails' });
  assert.deepEqual(parseArgs(['--window=deno']), { ...plain, window: true, shell: 'deno' });
  assert.deepEqual(parseArgs(['--check', '--window=electrobun']), { ...plain, window: true, shell: 'electrobun', check: true });
  assert.deepEqual(parseArgs(['--window=electrobun', '--dev']), { ...plain, window: true, shell: 'electrobun', dev: true });
  assert.deepEqual(parseArgs(['--stop']), { ...plain, stop: true });
  assert.deepEqual(parseArgs(['--check']), { ...plain, check: true });
  assert.throws(() => parseArgs(['--window=chrome']), /unknown option/);
  assert.throws(() => parseArgs(['--window=']), /unknown option/);
  assert.equal(searchIndexFor(4400), 'http://127.0.0.1:4400/pagefind/pagefind-entry.json');
  assert.throws(() => parseArgs(['--nope']), /unknown option/);
  assert.throws(() => parseArgs(['01-a', '02-b']), /only one sprint name/);
  assert.throws(() => parseArgs(['../etc']), /not a sprint name/);
});

test('the Wails window opens the sprint page inside dist/, or the front page with no sprint', () => {
  assert.equal(windowPathFor('03-save-format'), '/sprints/03-save-format/');
  assert.equal(windowPathFor(null), '/');
});
