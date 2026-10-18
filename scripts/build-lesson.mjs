// Builds one lesson folder into one self-contained HTML file that plays in the lesson
// player (scripts/lesson-player/). One command, and it refuses a lesson that breaks a rule.
//
//   npm run build-lesson -- <lesson folder> [--out <folder>] [--glossary-base <address>] [--check]
//
// What it reads from <lesson folder>:
//   lesson.config.mjs   the only file that names the lesson's files:
//                         sources   the lesson's script files, in load order
//                         lesson    the global those scripts define: the lesson object
//                         styles    the lesson's style files (its colour tokens)
//                         glossary  a JSON list of { term, plain } entries
//                         limits    optional; may lower the limits below, never raise them
// The player's script and layout are added by this command, from scripts/lesson-player/.
//
// What it checks before it writes anything (lesson-player/lesson-check.mjs):
//   a caption has at most 12 words; the film is at most 150 seconds at normal speed;
//   every [[term]] is in the glossary; every glossary term the words use is a link the
//   first time it appears on its step; every step draws, drags and builds its card on a
//   stand-in canvas. One broken rule stops the build and nothing is written.
//
// What it writes, in <lesson folder> or the --out folder:
//   index.html    the whole lesson in one file. Opens from disk. This is what gets filed.
//   body.html     the same without document tags, for a host that supplies its own.
//   timeline.txt  every chapter and step with its start time, length and words.
// When `npm run narrate` has left clips in <lesson folder>/narration/, the clips whose text
// is still current go into the page: inside it while together they are under 8 MB, otherwise
// as files in a narration folder beside it. With no clips the page is as it always was.
//
// --glossary-base makes every term a real link to <address> + the term's anchor.
// --check runs the checks, prints the timeline and writes nothing.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { LIMITS, PLAYER_CSS, exercise, limitsOf, lint, load } from './lesson-player/lesson-check.mjs';
import { readNarration } from './narrate.mjs';

export const EMBED_BYTES = 8 * 1024 * 1024;

const usage = 'usage: npm run build-lesson -- <lesson folder> [--out <folder>] [--glossary-base <address>] [--check]';

export function parseArgs(argv) {
  const out = { folder: null, out: null, glossaryBase: '', check: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') out.check = true;
    else if (arg === '--out' || arg === '--glossary-base') {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value\n${usage}`);
      if (arg === '--out') out.out = argv[++i]; else out.glossaryBase = argv[++i];
    } else if (arg.startsWith('--glossary-base=')) out.glossaryBase = arg.slice('--glossary-base='.length);
    else if (arg.startsWith('--out=')) out.out = arg.slice('--out='.length);
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}\n${usage}`);
    else if (out.folder !== null) throw new Error(`only one folder is taken, got "${out.folder}" and "${arg}"\n${usage}`);
    else out.folder = arg;
  }
  if (!out.folder) throw new Error(usage);
  return out;
}

const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Sets, changes or removes the glossary address of a built page. The filing command uses
// it on its copy, so a lesson filed in a site links to that site's glossary. Returns null
// when the text is not a page this command built.
export function withGlossaryBase(html, base) {
  const mount = /<div id="lesson"(?: data-glossary-base="[^"]*")?><\/div>/;
  if (!mount.test(html)) return null;
  return html.replace(mount, `<div id="lesson"${base ? ` data-glossary-base="${escAttr(base)}"` : ''}></div>`);
}

// The glossary a built page carries: the list of { term, plain } its term links open.
// Returns null when the text is not a page this command built.
export function glossaryOf(html) {
  const m = /^var GLOSSARY = (\[.*\]);$/m.exec(html);
  if (!m) return null;
  try {
    const list = JSON.parse(m[1]);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

// Checks the lesson and returns everything the build would write, as text. Throws an error
// whose `problems` lists every broken rule.
export async function checkLesson(folder, { glossaryBase = '', embedLimit = EMBED_BYTES } = {}) {
  folder = resolve(folder);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new Error(`${folder} is not a folder`);
  const configFile = join(folder, 'lesson.config.mjs');
  if (!existsSync(configFile)) throw new Error(`${folder} has no lesson.config.mjs, so it is not a lesson folder`);
  // The address carries the file's change time, so a config edited between two builds in
  // one process is read again.
  const config = (await import(`${pathToFileURL(configFile).href}?t=${statSync(configFile).mtimeMs}-${statSync(configFile).size}`)).default;
  const limits = limitsOf(config);
  const read = (f) => readFileSync(join(folder, f), 'utf8');
  const raw = config.glossary ? JSON.parse(read(config.glossary)) : [];
  if (!Array.isArray(raw) || raw.some((t) => typeof t?.term !== 'string' || t.term.trim() === '')) {
    throw new Error('the glossary must be a list of { "term", "plain" } entries');
  }
  const glossary = raw.map((t) => ({ ...t, plain: String(t.plain ?? t.brief ?? '').trim() }));

  const { LP, lesson, js } = load(config, folder);
  const { problems, used, timeline, terms, plan } = lint(LP, lesson, glossary, limits);
  for (const t of glossary) if (t.plain === '') problems.push(`the glossary term "${t.term}" has no plain line`);
  const run = exercise(LP, lesson);
  problems.push(...run.bad);
  if (problems.length > 0) {
    const e = new Error(`${problems.join('\n')}\n\n${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}. Nothing written.`);
    e.problems = problems;
    throw e;
  }

  const voice = readNarration(folder, plan.steps);
  const embedded = voice.clips.reduce((n, c) => n + Math.ceil(c.bytes.length / 3) * 4, 0) < embedLimit;
  const clipAt = (c) => embedded ? `data:audio/wav;base64,${c.bytes.toString('base64')}` : `narration/${c.file}`;
  const script = [
    '(function () {',
    ...js,
    'var GLOSSARY = ' + JSON.stringify(glossary).replace(/</g, '\\u003c') + ';',
    ...(voice.clips.length ? ['var NARRATION = ' + JSON.stringify(Object.fromEntries(voice.clips.map((c) => [c.id, clipAt(c)]))) + ';'] : []),
    'var mountAt = document.getElementById("lesson");',
    `window.lessonPlayer = LessonPlayer.mount(mountAt, ${config.lesson}, { glossary: GLOSSARY${voice.clips.length ? ', narration: NARRATION' : ''} });`,
    '})();',
  ].join('\n');
  if (/<\/script/i.test(script)) throw new Error('script text would close its own tag');
  new Script(script, { filename: 'the page script' }); // a syntax error stops here; nothing runs
  const styles = [...(config.styles ?? []).map((f) => read(f).trim()), readFileSync(PLAYER_CSS, 'utf8').trim()];
  const body = `<title>${escText(lesson.title)}</title>\n<style>\n${styles.join('\n')}\n</style>\n` +
    `<div id="lesson"${glossaryBase ? ` data-glossary-base="${escAttr(glossaryBase)}"` : ''}></div>\n<script>\n${script}\n</script>\n`;
  if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(body)) throw new Error('the lesson must not carry document tags');
  if (/\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(body.replace(/data-glossary-base="[^"]*"/, '')) || /@import|url\(\s*["']?https?:/i.test(body)) {
    throw new Error('the lesson loads something from another address; a built lesson is one file');
  }
  const index = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<link rel="icon" href="data:,">\n</head>\n<body>\n' + body + '</body>\n</html>\n';
  const unused = [...terms.keys()].filter((t) => !used.has(t));
  return {
    folder, title: lesson.title, body, index, timeline, seconds: plan.total, steps: run.steps, moved: run.moved,
    cards: run.cards, termsUsed: used.size, terms: terms.size, unused, limits, glossaryBase,
    narration: { clips: voice.clips.length, stale: voice.stale, embedded, files: embedded ? [] : voice.clips },
  };
}

export async function buildLesson(folder, { out = null, glossaryBase = '', embedLimit = EMBED_BYTES } = {}) {
  const r = await checkLesson(folder, { glossaryBase, embedLimit });
  const dest = resolve(out ?? r.folder);
  mkdirSync(dest, { recursive: true });
  const written = [];
  for (const [name, text] of [['index.html', r.index], ['body.html', r.body], ['timeline.txt', r.timeline]]) {
    const file = join(dest, name);
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
      writeFileSync(file, text);
      written.push(name);
    }
  }
  if (dest !== r.folder && r.narration.files.length > 0) {
    mkdirSync(join(dest, 'narration'), { recursive: true });
    for (const c of r.narration.files) copyFileSync(c.from, join(dest, 'narration', c.file));
  }
  return { ...r, dest, written };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const r = args.check ? await checkLesson(args.folder, args) : await buildLesson(args.folder, args);
    console.log(r.timeline);
    console.log(`Limits kept: captions of at most ${r.limits.captionWords} words, a film of at most ${r.limits.filmSeconds} seconds (a lesson may lower these from ${LIMITS.captionWords} and ${LIMITS.filmSeconds}, not raise them).`);
    console.log(`Every step drawn on a stand-in canvas: ${r.steps} steps, ${r.moved} handle drags, ${r.cards} cards.`);
    console.log(`Glossary terms linked somewhere: ${r.termsUsed} of ${r.terms}${r.glossaryBase ? `, glossary address ${r.glossaryBase}` : ''}.`);
    if (r.narration.clips > 0) console.log(`Narration: ${r.narration.clips} clips, ${r.narration.embedded ? 'inside the page' : 'as files in narration/ beside the page; keep that folder with it'}.`);
    if (r.narration.clips > 0 && r.narration.stale > 0) console.log(`Say lines with no current clip: ${r.narration.stale}. Run npm run narrate -- <lesson folder>, then build again.`);
    if (r.unused.length > 0) console.log(`Not used by this film or its cards: ${r.unused.join('; ')}`);
    if (args.check) console.log('Checked. Nothing written.');
    else console.log(`${r.written.length === 0 ? 'No change to' : 'Wrote'} index.html (${r.index.length} characters), body.html and timeline.txt in ${r.dest.replace(/\\/g, '/')}`);
  } catch (e) {
    console.error(e.message);
    process.exit(e.problems ? 1 : 2);
  }
}
