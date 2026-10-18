// Narration without the network: the request is answered here with short test tones. Checks
// the dry run, the request Cartesia is sent, that an unchanged line is not spoken again, and
// that a built lesson carries the clips (inside the page, or beside it) only when there are some.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildLesson } from './build-lesson.mjs';
import { ENDPOINT, TAILS_VOICE, hashOf, narrate, parseArgs, wavSeconds } from './narrate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scratch = join(tmpdir(), 'dandori-narrate-test');

function emptied(dir) {
  mkdirSync(dir, { recursive: true });
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) emptied(join(dir, e.name));
    else unlinkSync(join(dir, e.name));
  }
  return dir;
}

// A test tone as a WAV file: 16-bit, one channel, 8000 samples a second.
export function tone(seconds, hz = 440) {
  const rate = 8000, n = Math.round(seconds * rate), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1'); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(6000 * Math.sin(2 * Math.PI * hz * i / rate)), 44 + i * 2);
  return b;
}

// A lesson of two chapters; `says` is the say line of each of its three steps ('' for none).
// `keep` rewrites the lesson and leaves its clips.
function lessonFolder(dir, says, keep = false) {
  if (!keep) emptied(dir);
  const step = (say) => `{ caption: 'A step.', ${say ? `say: ${JSON.stringify(say)}, ` : ''}card: '<p>x</p>', draw: function () {} }`;
  writeFileSync(join(dir, 'theme.css'), ':root { --bg: #fff; --panel: #eee; --rule: #ccc; --ink: #000; --text: #333; --accent: #00f; --font-body: sans-serif; --font-num: monospace; }\n');
  writeFileSync(join(dir, 'lesson.js'), `var L = { title: 'Spoken', chapters: [{ title: 'One', steps: [${step(says[0])}, ${step(says[1])}] }, { title: 'Two', steps: [${step(says[2])}] }] };\n`);
  writeFileSync(join(dir, 'lesson.config.mjs'), "export default { sources: ['lesson.js'], lesson: 'L', styles: ['theme.css'] };\n");
  return dir;
}

// Stands in for fetch: records each request and answers with a tone.
function cartesia(calls, seconds = 0.25) {
  return async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const bytes = tone(seconds);
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
  };
}
const never = async () => { throw new Error('the network was called'); };
const quiet = () => {};

test('arguments, and the length of a WAV file', () => {
  assert.deepEqual(parseArgs(['in', '--voice', 'v1', '--dry-run']), { folder: 'in', voice: 'v1', dryRun: true });
  assert.equal(parseArgs(['in', '--voice=v2']).voice, 'v2');
  assert.throws(() => parseArgs([]), /usage/);
  assert.throws(() => parseArgs(['in', '--key', 'x']), /unknown option/);
  assert.equal(wavSeconds(tone(0.5)), 0.5);
  assert.throws(() => wavSeconds(Buffer.from('not sound')), /not a WAV file/);
});

test('a dry run lists the lines and calls and writes nothing', async () => {
  const dir = lessonFolder(join(scratch, 'dry'), ['First line.', '', 'Third line, a longer one.']);
  const lines = [];
  const r = await narrate(dir, { dryRun: true, fetch: never, log: (s) => lines.push(s) });
  assert.deepEqual(r, { spoken: 0, todo: 2, kept: 0, silent: 1 });
  assert.match(lines[0], /^1-1 {2}would speak \(2 words\): First line\.$/);
  assert.match(lines[1], /^1-2 {2}no say line$/);
  assert.match(lines[3], /^Would speak 2 of 3 steps .* Nothing called, nothing written\.$/);
  assert.ok(!existsSync(join(dir, 'narration')));
});

test('without a key nothing is called, and the one line names the variable', async () => {
  const dir = lessonFolder(join(scratch, 'nokey'), ['First line.', '', '']);
  await assert.rejects(() => narrate(dir, { fetch: never, log: quiet }), /^Error: Set the environment variable CARTESIA_API_KEY /);
  const run = spawnSync(process.execPath, [join(here, 'narrate.mjs'), dir], { encoding: 'utf8', env: { ...process.env, CARTESIA_API_KEY: '' } });
  assert.equal(run.status, 2);
  assert.equal(run.stdout, '');
  assert.equal(run.stderr, 'Set the environment variable CARTESIA_API_KEY to your Cartesia API key, then run this again.\n');
});

test('each say line is spoken once, and only a changed line is spoken again', async () => {
  const dir = lessonFolder(join(scratch, 'speak'), ['First line.', 'Second line.', '']);
  const calls = [];
  const r = await narrate(dir, { key: 'test-key', fetch: cartesia(calls), log: quiet });
  assert.equal(r.spoken, 2);
  assert.equal(calls[0].url, ENDPOINT);
  assert.equal(calls[0].headers.Authorization, 'Bearer test-key');
  assert.ok(calls[0].headers['Cartesia-Version']);
  assert.deepEqual(calls[0].body, { model_id: 'sonic-3.6', transcript: 'First line.', voice: { id: TAILS_VOICE }, language: 'en', output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 24000 } });
  const manifest = () => JSON.parse(readFileSync(join(dir, 'narration', 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest().clips, [
    { id: '1-1', file: '1-1.wav', duration: 0.25, hash: hashOf('First line.') },
    { id: '1-2', file: '1-2.wav', duration: 0.25, hash: hashOf('Second line.') },
  ]);
  assert.ok(!readFileSync(join(dir, 'narration', 'manifest.json'), 'utf8').includes('test-key'), 'the key is not written');
  assert.equal(wavSeconds(readFileSync(join(dir, 'narration', '1-2.wav'))), 0.25);

  assert.equal((await narrate(dir, { key: 'test-key', fetch: never, log: quiet })).spoken, 0, 'nothing changed: nothing is spoken');

  lessonFolder(dir, ['First line.', 'Second line, changed.', ''], true);
  const again = [];
  assert.equal((await narrate(dir, { key: 'test-key', fetch: cartesia(again, 0.5), log: quiet })).spoken, 1);
  assert.equal(again[0].body.transcript, 'Second line, changed.');
  assert.deepEqual(manifest().clips.map((c) => c.duration), [0.25, 0.5]);

  const other = [];
  await narrate(dir, { key: 'test-key', voice: 'another-voice', fetch: cartesia(other), log: quiet });
  assert.deepEqual(other.map((c) => c.body.voice.id), ['another-voice', 'another-voice'], 'another voice speaks every line again');

  await assert.rejects(() => narrate(lessonFolder(join(scratch, 'refused'), ['A line.', '', '']), {
    key: 'test-key', log: quiet, fetch: async () => ({ ok: false, status: 401, text: async () => 'bad key test-key' }),
  }), (e) => { assert.match(e.message, /Cartesia answered 401 for step 1-1/); assert.ok(!e.message.includes('test-key')); return true; });
});

test('a built lesson carries its clips, inside the page or beside it, and none when there are none', async () => {
  const dir = lessonFolder(join(scratch, 'build'), ['First line.', 'Second line.', '']);
  const out = emptied(join(scratch, 'built')), out2 = emptied(join(scratch, 'built-beside'));
  const plain = (await buildLesson(dir, { out })).index;
  assert.doesNotMatch(plain, /var NARRATION|narration: NARRATION/, 'no clips: the page does not mention narration');

  await narrate(dir, { key: 'test-key', fetch: cartesia([]), log: quiet });
  const inside = await buildLesson(dir, { out });
  assert.deepEqual({ ...inside.narration, files: 0 }, { clips: 2, stale: 0, embedded: true, files: 0 });
  const table = JSON.parse(/^var NARRATION = (\{.*\});$/m.exec(inside.index)[1]);
  assert.deepEqual(Object.keys(table), ['1-1', '1-2']);
  assert.equal(table['1-1'], 'data:audio/wav;base64,' + tone(0.25).toString('base64'));
  assert.ok(inside.index.includes('{ glossary: GLOSSARY, narration: NARRATION }'));
  assert.ok(!existsSync(join(out, 'narration')), 'one file, nothing beside it');

  const beside = await buildLesson(dir, { out: out2, embedLimit: 1000 });   // too large to put inside
  assert.equal(beside.narration.embedded, false);
  assert.ok(beside.index.includes('var NARRATION = {"1-1":"narration/1-1.wav","1-2":"narration/1-2.wav"};'));
  assert.deepEqual(readdirSync(join(out2, 'narration')).sort(), ['1-1.wav', '1-2.wav']);

  // A line changed after it was spoken: its old clip is left out until it is spoken again.
  lessonFolder(dir, ['First line.', 'Second line, changed.', ''], true);
  const stale = await buildLesson(dir, { out });
  assert.deepEqual([stale.narration.clips, stale.narration.stale], [1, 1]);
  assert.doesNotMatch(stale.index, /"1-2":/);

  // The say lines themselves change nothing about the film: no clips, the same page as a lesson without them.
  const silent = lessonFolder(join(scratch, 'silent'), ['', '', '']);
  const spoken = lessonFolder(join(scratch, 'worded'), ['First line.', 'Second line.', '']);
  const a = await buildLesson(silent, { out: emptied(join(scratch, 'a')) }), b = await buildLesson(spoken, { out: emptied(join(scratch, 'b')) });
  assert.equal(a.timeline, b.timeline);
  assert.equal(b.index.replace(/say: "[^"]*", /g, ''), a.index);
});
