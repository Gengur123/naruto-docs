// Speaks a lesson's `say` lines: one audio clip per step, from Cartesia text-to-speech.
//
//   npm run narrate -- <lesson folder> [--voice <voice id>] [--dry-run]
//
// It writes <lesson folder>/narration/<step id>.wav and narration/manifest.json (step id,
// file, duration, hash of the text). A line whose text, voice and model are unchanged is
// not spoken again. `npm run build-lesson` then puts the clips in the built lesson.
// The key is read from the environment variable CARTESIA_API_KEY and from nowhere else.
// The voice is --voice, or CARTESIA_VOICE_ID, or the Tails voice.
// --dry-run lists what would be spoken. It needs no key, calls nothing and writes nothing.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load } from './lesson-player/lesson-check.mjs';

export const ENDPOINT = 'https://api.cartesia.ai/tts/bytes';
export const MODEL = 'sonic-3.6';
export const VERSION = '2026-08-14';
export const TAILS_VOICE = 'cc265d5e-1edc-482a-931c-8cefb17f32c0';
const usage = 'usage: npm run narrate -- <lesson folder> [--voice <voice id>] [--dry-run]';

export function parseArgs(argv) {
  const out = { folder: null, voice: '', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--voice') {
      if (i + 1 >= argv.length) throw new Error(`--voice needs a value\n${usage}`);
      out.voice = argv[++i];
    } else if (arg.startsWith('--voice=')) out.voice = arg.slice('--voice='.length);
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}\n${usage}`);
    else if (out.folder !== null) throw new Error(`only one folder is taken, got "${out.folder}" and "${arg}"\n${usage}`);
    else out.folder = arg;
  }
  if (!out.folder) throw new Error(usage);
  return out;
}

export const hashOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const sayOf = (step) => String(step.say ?? '').trim();
const manifestOf = (folder) => {
  const file = join(folder, 'narration', 'manifest.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
};

// Seconds of sound in a WAV file, from its header.
export function wavSeconds(buf) {
  let rate = 0;
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WAVE') {
    for (let at = 12; at + 8 <= buf.length;) {
      const name = buf.toString('latin1', at, at + 4), len = buf.readUInt32LE(at + 4), rest = buf.length - at - 8;
      if (name === 'fmt ' && rest >= 12) rate = buf.readUInt32LE(at + 16); // bytes per second
      if (name === 'data' && rate > 0) return (len > 0 && len < rest ? len : rest) / rate; // a streamed header may not know its length
      at += 8 + len + (len & 1);
    }
  }
  throw new Error('not a WAV file');
}

// The clips a build may use: those the manifest lists for a step whose `say` text is still
// the text that was spoken. `stale` counts the say lines with no such clip.
export function readNarration(folder, steps) {
  const by = new Map((manifestOf(folder).clips ?? []).map((c) => [c.id, c]));
  const clips = [];
  let stale = 0;
  for (const e of steps) {
    const say = sayOf(e.step), c = by.get(e.id);
    if (!say) continue;
    const file = c && /^[\w.-]+$/.test(c.file) ? join(folder, 'narration', c.file) : '';
    if (c && c.hash === hashOf(say) && existsSync(file)) clips.push({ id: e.id, file: c.file, from: file, bytes: readFileSync(file) });
    else stale++;
  }
  return { clips, stale };
}

export async function narrate(folder, { voice = TAILS_VOICE, dryRun = false, key = '', fetch: send = globalThis.fetch, log = console.log } = {}) {
  folder = resolve(folder);
  const configFile = join(folder, 'lesson.config.mjs');
  if (!existsSync(configFile)) throw new Error(`${folder} has no lesson.config.mjs, so it is not a lesson folder`);
  const config = (await import(`${pathToFileURL(configFile).href}?t=${statSync(configFile).mtimeMs}-${statSync(configFile).size}`)).default;
  const { LP, lesson } = load(config, folder);
  const steps = LP.plan(lesson).steps, dir = join(folder, 'narration');
  const old = manifestOf(folder), same = old.voice === voice && old.model === MODEL;
  const had = new Map((old.clips ?? []).map((c) => [c.id, c]));
  const done = new Map(), todo = [];
  let silent = 0;
  for (const e of steps) {
    const say = sayOf(e.step), file = `${e.id.replace(/[^\w-]+/g, '_')}.wav`, hash = hashOf(say), was = had.get(e.id);
    if (!say) { silent++; if (dryRun) log(`${e.id}  no say line`); continue; }
    if (same && was && was.hash === hash && was.file === file && existsSync(join(dir, file))) { done.set(e.id, was); if (dryRun) log(`${e.id}  up to date`); continue; }
    todo.push({ id: e.id, say, file, hash });
    if (dryRun) log(`${e.id}  would speak (${LP.words(say)} words): ${say}`);
  }
  const kept = done.size, letters = todo.reduce((n, t) => n + t.say.length, 0);
  if (dryRun) {
    log(`Would speak ${todo.length} of ${steps.length} steps (${letters} characters) with voice ${voice}, model ${MODEL}. Up to date: ${kept}. No say line: ${silent}. Nothing called, nothing written.`);
    return { spoken: 0, todo: todo.length, kept, silent };
  }
  if (!key) throw new Error('Set the environment variable CARTESIA_API_KEY to your Cartesia API key, then run this again.');
  let spoken = 0;
  try {
    for (const t of todo) {
      const res = await send(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Cartesia-Version': VERSION, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: MODEL, transcript: t.say, voice: { id: voice }, language: 'en', output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 24000 } }),
      });
      if (!res.ok) throw new Error(`Cartesia answered ${res.status} for step ${t.id}: ${(await res.text()).split(key).join('(key)').slice(0, 200)}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const duration = Math.round(wavSeconds(bytes) * 100) / 100;
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, t.file), bytes);
      done.set(t.id, { id: t.id, file: t.file, duration, hash: t.hash });
      spoken++;
      log(`${t.id}  ${duration.toFixed(2)} s  ${t.file}`);
    }
  } finally {
    // Also after a failure, so the clips already paid for are not spoken again.
    const clips = steps.map((e) => done.get(e.id)).filter(Boolean);
    if (spoken > 0 || clips.length !== (old.clips ?? []).length) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ voice, model: MODEL, clips }, null, 2) + '\n');
    }
  }
  // A clip of a step that is gone, or that lost its say line, is removed.
  const live = new Set([...done.values()].map((c) => c.file));
  for (const c of old.clips ?? []) {
    if (!live.has(c.file) && /^[\w.-]+$/.test(c.file) && existsSync(join(dir, c.file))) unlinkSync(join(dir, c.file));
  }
  const seconds = [...done.values()].reduce((n, c) => n + c.duration, 0);
  log(`Spoke ${spoken}, kept ${kept}. ${done.size} clips, ${seconds.toFixed(1)} s, in ${dir.replace(/\\/g, '/')}. Now run: npm run build-lesson -- <lesson folder>`);
  return { spoken, todo: todo.length, kept, silent };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const args = parseArgs(process.argv.slice(2));
    await narrate(args.folder, { voice: args.voice || process.env.CARTESIA_VOICE_ID || TAILS_VOICE, dryRun: args.dryRun, key: process.env.CARTESIA_API_KEY ?? '' });
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
