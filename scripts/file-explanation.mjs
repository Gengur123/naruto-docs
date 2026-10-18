// Files one explanation (a lesson for the lesson player, a video, an interactive page, or
// several of them) in the lorebook, so it can be opened and searched again later. One
// command, safe to run again.
//
//   npm run file-explanation -- <folder> --slug <slug> --title "<title>"
//        [--description "<one line>"] [--asked "<what was asked, in the asker's words>"]
//        [--without <part>]...
//
// What it reads from <folder>, each part optional, at least one artifact required:
//   player/index.html        a lesson built by `npm run build-lesson`. When it is there it is
//                            the main artifact: first on the page, playable in it
//   explainer/index.html     a self-contained interactive page (and explainer/assets/, if any)
//   video/*.mp4, *.webm      recordings (also *.mp4 and *.webm in <folder> itself). Beside a
//                            lesson they are the long form
//   pacify.md                the Pacify reply: what the agent understood before it built
//   glossary.json            the terms it introduced: [{ "term", "plain" or "brief" }]. A
//                            built lesson carries its own glossary, and every term in it
//                            that this file lacks is taken from the lesson, so a term
//                            link in the lesson always has an entry to open
//   summary.md               text for the page, used the first time only
// --without player, --without explainer or --without video leaves that part out, for a
// folder that still holds a form the page should no longer show.
//
// The copy of the lesson gets this site's Glossary page as the address of its term links, so
// a term in a caption or a card opens its entry there. That one attribute is the only
// difference between the copy and its source.
//
// What it writes in the site:
//   public/explanations/<slug>/...                      the artifacts, copied
//   src/content/docs/lorebook/Explanations/<slug>.md    the page: the artifacts playable on
//                                                       it, the terms, and the files' sizes
//   ledgers/glossary.json                               the terms, tagged "explanation" and
//                                                       <slug>
//
// Run again after the artifacts change: files are copied again, the part of the page between
// the two "filed" marks is rewritten, and everything above the first mark and below the
// second (the text a person wrote) is left as it is. A term the glossary already has keeps its own line. A file that
// was copied before and is no longer in <folder> leaves the page; its copy stays, and the
// command names it. Terms added before stay in the glossary.
// A term tagged "explanation" is listed in the Glossary and linked from its explanation's
// page. It is not underlined on other pages; remove the tag to underline it everywhere.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glossaryOf, withGlossaryBase } from './build-lesson.mjs';

const usage = 'usage: npm run file-explanation -- <folder> --slug <slug> --title "<title>" [--description "<one line>"] [--asked "<the request>"] [--without player|explainer|video] [--site <site folder>]';
const parts = ['player', 'explainer', 'video'];
// From public/explanations/<slug>/player/index.html to the site's Glossary page, relative
// to the lesson's own address. The page's own links are absolute, like the rest of the site.
const glossaryFromLesson = '../../../glossary/#';
const startMark = '<!-- filed:start. Everything from here to filed:end is rewritten by `npm run file-explanation`. Write above this line. -->';
const endMark = '<!-- filed:end -->';
const explanationTag = 'explanation';

// The same anchor the Glossary page gives a term (glossify.mjs, slugOf).
export function slugOf(term) {
  return term.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const posix = (p) => p.replace(/\\/g, '/');

export function parseArgs(argv) {
  const out = { folder: null, slug: null, title: null, description: null, asked: null, site: null, without: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--without') {
      const part = argv[++i];
      if (!parts.includes(part)) throw new Error(`--without takes one of: ${parts.join(', ')}\n${usage}`);
      if (!out.without.includes(part)) out.without.push(part);
    } else if (['--slug', '--title', '--description', '--asked', '--site'].includes(arg)) {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value\n${usage}`);
      out[arg.slice(2)] = argv[++i];
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown option ${arg}\n${usage}`);
    } else if (out.folder !== null) {
      throw new Error(`only one folder is taken, got "${out.folder}" and "${arg}"\n${usage}`);
    } else {
      out.folder = arg;
    }
  }
  if (!out.folder || !out.slug || !out.title) throw new Error(usage);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(out.slug)) {
    throw new Error(`"${out.slug}" is not a slug; use lower-case words joined by dashes, like how-rain-works`);
  }
  if (out.slug === 'index') throw new Error('"index" is the section\'s own page; pick another slug');
  return out;
}

// The glossary ledger in the layout `dandori gloss add` writes: one key per line, lists on
// one line.
export function ledgerText(entries) {
  const q = JSON.stringify;
  const one = (e) => '  {\n' + Object.entries(e)
    .map(([k, v]) => `    ${q(k)}: ${Array.isArray(v) ? '[' + v.map(q).join(', ') + ']' : q(v)}`)
    .join(',\n') + '\n  }';
  return entries.length === 0 ? '[]\n' : '[\n' + entries.map(one).join(',\n') + '\n]\n';
}

// Adds the explanation's terms to the ledger's entries. Returns { entries, added, kept }.
// A term the ledger already has under another owner is left alone.
export function mergeTerms(entries, terms, slug) {
  const known = new Map();
  for (const e of entries) for (const w of [e.term, ...(e.aliases ?? [])]) known.set(w.toLowerCase(), e);
  let added = 0;
  let kept = 0;
  for (const t of terms) {
    const brief = String(t.plain ?? t.brief ?? '').trim();
    const have = known.get(t.term.toLowerCase());
    if (have) {
      const ours = (have.tags ?? []).includes(explanationTag) && (have.tags ?? []).includes(slug);
      if (ours && brief !== '') have.brief = brief;
      else kept++;
      continue;
    }
    const entry = { term: t.term, aliases: [], brief, page: `/glossary/#${slugOf(t.term)}`, tags: [explanationTag, slug] };
    entries.push(entry);
    known.set(t.term.toLowerCase(), entry);
    added++;
  }
  return { entries, added, kept };
}

function listFiles(dir, keep) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && keep(e.name)).map((e) => e.name).sort();
}

function walk(dir, under = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) out.push(...walk(join(dir, e.name), `${under}${e.name}/`));
    else if (e.isFile()) out.push(`${under}${e.name}`);
  }
  return out;
}

const isVideo = (name) => /\.(mp4|webm)$/i.test(name);

// What <folder> holds, as { from, to } pairs; `to` is relative to public/explanations/<slug>.
export function artifactsIn(folder, without = []) {
  const copies = [];
  if (!without.includes('player') && existsSync(join(folder, 'player', 'index.html'))) {
    copies.push({ from: join(folder, 'player', 'index.html'), to: 'player/index.html', kind: 'lesson' });
  }
  if (!without.includes('explainer') && existsSync(join(folder, 'explainer', 'index.html'))) {
    copies.push({ from: join(folder, 'explainer', 'index.html'), to: 'explainer/index.html', kind: 'page' });
    for (const f of walk(join(folder, 'explainer', 'assets'))) {
      copies.push({ from: join(folder, 'explainer', 'assets', f), to: `explainer/assets/${f}`, kind: 'asset' });
    }
  }
  const seen = new Set();
  for (const dir of without.includes('video') ? [] : ['video', '.']) {
    for (const name of listFiles(join(folder, dir), isVideo)) {
      if (seen.has(name)) continue;
      seen.add(name);
      copies.push({ from: join(folder, dir, name), to: `video/${name}`, kind: 'video' });
    }
  }
  return copies;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

// What the site's copy of a lesson holds: the built page, with its term links pointed at
// this site's glossary. Every other artifact is copied as it is.
function lessonCopy(c) {
  const text = withGlossaryBase(readFileSync(c.from, 'utf8'), glossaryFromLesson);
  if (text === null) {
    throw new Error(`${posix(c.from)} was not built by \`npm run build-lesson\`. Build the lesson again, or file the page as explainer/index.html`);
  }
  return Buffer.from(text, 'utf8');
}

function stamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

// The part of the page the command owns.
export function filedBlock({ slug, title, copies, terms, source, pacify = null }) {
  const base = `/explanations/${slug}`;
  const lines = [startMark, ''];
  const lesson = copies.find((c) => c.kind === 'lesson');
  if (lesson) {
    lines.push('## The lesson', '',
      '<p>It plays like a video and is drawn by code. Press play, or go one step at a time with the arrow keys. Each step has a card with the detail, and a marked term opens its glossary entry.</p>', '',
      `<iframe src="${base}/player/index.html" title="${esc(title)}: the lesson" style="width:100%;height:min(85vh,760px);border:1px solid var(--sl-color-gray-5);border-radius:6px;background:#fff"></iframe>`, '',
      `<p><a href="${base}/player/index.html">Open the lesson in the whole window</a></p>`, '');
  }
  const page = copies.find((c) => c.kind === 'page');
  if (page) {
    lines.push('## Interactive page', '',
      `<iframe src="${base}/explainer/index.html" title="${esc(title)}: interactive page" loading="lazy" style="width:100%;height:80vh;border:1px solid var(--sl-color-gray-5);border-radius:6px;background:#fff"></iframe>`, '',
      `<p><a href="${base}/explainer/index.html">Open the interactive page on its own</a></p>`, '');
  }
  const videos = copies.filter((c) => c.kind === 'video');
  if (videos.length > 0) {
    const many = videos.length > 1;
    lines.push(lesson ? `## The long form: ${many ? 'videos' : 'video'}` : many ? '## Videos' : '## Video', '');
    for (const v of videos) {
      const name = v.to.slice('video/'.length);
      lines.push(`<p><code>${esc(name)}</code></p>`, '',
        `<video controls preload="metadata" src="${base}/${v.to}" style="width:100%;height:auto"></video>`, '');
    }
  }
  if (pacify) {
    lines.push('## The Pacify reply', '',
      '<p>What the agent said it understood, and what it planned, before the explanation was built.</p>', '',
      pacify.trim(), '');
  }
  if (terms.length > 0) {
    lines.push('## Terms it introduced', '',
      `<p>${terms.length} terms, in the order the explanation uses them. Each name opens its entry in the <a href="/glossary/">Glossary</a>.</p>`, '',
      '<dl class="dd-glossary">');
    for (const t of terms) {
      lines.push(`<dt><a href="/glossary/#${slugOf(t.term)}">${esc(t.term)}</a></dt><dd>${esc(String(t.plain ?? t.brief ?? '').trim())}</dd>`);
    }
    lines.push('</dl>', '');
  }
  lines.push('## Files', '',
    `<p>Filed from <code>${esc(source)}</code>. Size and time are the source file's when it was last filed.</p>`, '',
    ...(lesson ? ['<p>The copy of <code>player/index.html</code> differs from its source in one attribute: its term links lead to the Glossary of this site.</p>', ''] : []),
    '<div style="overflow-x:auto">', '<table><thead><tr><th>File</th><th>Bytes</th><th>Last changed</th><th>SHA-256, first 12</th></tr></thead><tbody>');
  for (const c of copies) {
    lines.push(`<tr><td><code>${esc(c.to)}</code></td><td>${c.bytes}</td><td>${c.changed}</td><td><code>${c.sha.slice(0, 12)}</code></td></tr>`);
  }
  lines.push('</tbody></table>', '</div>', '', endMark, '');
  return lines.join('\n');
}

const yamlText = (s) => JSON.stringify(String(s));

// The whole page the first time; later, the old page with only the filed block replaced.
export function pageText(old, { title, description, asked, summary, block, today }) {
  if (old !== null) {
    const a = old.indexOf(startMark.slice(0, '<!-- filed:start'.length));
    const b = old.indexOf(endMark);
    if (a < 0 || b < a) throw new Error('the page has no filed:start and filed:end marks; add them, or move the page away and file again');
    return old.slice(0, a) + block + old.slice(b + endMark.length).replace(/^\r?\n/, '');
  }
  const head = ['---', `title: ${yamlText(title)}`, `description: ${yamlText(description)}`, '---', '',
    `Filed on ${today}.${asked ? ` The request: "${asked}"` : ''}`, ''];
  head.push(summary ? summary.trim() : 'Write here, in a few plain lines, what the explanation covers and what it leaves out. Search finds this page by the words on it.', '');
  return head.join('\n') + block;
}

export function fileExplanation(args, { now = new Date() } = {}) {
  const site = resolve(args.site ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const folder = resolve(args.folder);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new Error(`${folder} is not a folder`);
  const without = args.without ?? [];
  const copies = artifactsIn(folder, without);
  if (!copies.some((c) => c.kind === 'lesson' || c.kind === 'page' || c.kind === 'video')) {
    const leftOut = without.length > 0 ? ` once ${without.join(' and ')} ${without.length === 1 ? 'is' : 'are'} left out` : '';
    throw new Error(`${folder} has no player/index.html, no explainer/index.html and no .mp4 or .webm${leftOut}, so there is nothing to file`);
  }
  let terms = [];
  if (existsSync(join(folder, 'glossary.json'))) {
    terms = JSON.parse(readFileSync(join(folder, 'glossary.json'), 'utf8'));
    if (!Array.isArray(terms) || terms.some((t) => typeof t?.term !== 'string' || t.term.trim() === '')) {
      throw new Error('glossary.json must be a list of { "term", "plain" } entries');
    }
  }

  // A lesson links the terms of its own glossary. Each one the folder's list lacks is taken
  // from the lesson, so no link in the filed copy leads to an entry that is not there.
  let fromLesson = 0;
  const lessonFile = copies.find((c) => c.kind === 'lesson');
  if (lessonFile) {
    const own = glossaryOf(readFileSync(lessonFile.from, 'utf8'));
    if (own === null) {
      throw new Error(`${posix(lessonFile.from)} was not built by \`npm run build-lesson\`. Build the lesson again, or file the page as explainer/index.html`);
    }
    const have = new Set(terms.map((t) => t.term.toLowerCase()));
    for (const t of own) {
      if (typeof t?.term !== 'string' || t.term.trim() === '' || have.has(t.term.toLowerCase())) continue;
      have.add(t.term.toLowerCase());
      terms.push({ term: t.term, plain: String(t.plain ?? t.brief ?? '').trim() });
      fromLesson++;
    }
  }

  // 1. Artifacts.
  const dest = join(site, 'public', 'explanations', args.slug);
  let copied = 0;
  for (const c of copies) {
    const to = join(dest, c.to);
    const info = statSync(c.from);
    c.bytes = info.size;
    c.changed = stamp(info.mtime);
    c.sha = sha256(c.from);
    if (c.kind === 'lesson') {
      const want = lessonCopy(c);
      if (existsSync(to) && readFileSync(to).equals(want)) continue;
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, want);
      copied++;
      continue;
    }
    if (existsSync(to) && statSync(to).size === c.bytes && sha256(to) === c.sha) continue;
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(c.from, to);
    copied++;
  }
  // Files an earlier run copied that this folder no longer has. They are named and kept.
  const wanted = new Set(copies.map((c) => c.to));
  const leftover = walk(dest).filter((f) => !wanted.has(f));

  // 2. Terms.
  const ledger = join(site, 'ledgers', 'glossary.json');
  let added = 0;
  let kept = 0;
  if (terms.length > 0) {
    const before = existsSync(ledger) ? readFileSync(ledger, 'utf8') : '[]\n';
    const merged = mergeTerms(JSON.parse(before), terms, args.slug);
    ({ added, kept } = merged);
    const after = ledgerText(merged.entries);
    if (after !== before) {
      mkdirSync(dirname(ledger), { recursive: true });
      writeFileSync(ledger, after);
    }
  }

  // 3. The page.
  const pageFile = join(site, 'src', 'content', 'docs', 'lorebook', 'Explanations', `${args.slug}.md`);
  const old = existsSync(pageFile) ? readFileSync(pageFile, 'utf8') : null;
  const summaryFile = join(folder, 'summary.md');
  const pacifyFile = join(folder, 'pacify.md');
  const pacify = existsSync(pacifyFile) ? readFileSync(pacifyFile, 'utf8').replace(/\r\n/g, '\n') : null;
  if (pacify !== null && (pacify.includes('<!-- filed:start') || pacify.includes(endMark))) {
    throw new Error('pacify.md holds a filed mark; remove it and file again');
  }
  const block = filedBlock({ slug: args.slug, title: args.title, copies, terms, source: posix(relative(site, folder)), pacify });
  const text = pageText(old, {
    title: args.title,
    description: args.description ?? `${args.title}: an explanation filed in the lorebook.`,
    asked: args.asked,
    summary: existsSync(summaryFile) ? readFileSync(summaryFile, 'utf8') : null,
    block,
    today: stamp(now).slice(0, 10),
  });
  const pageChanged = text !== old;
  if (pageChanged) {
    mkdirSync(dirname(pageFile), { recursive: true });
    writeFileSync(pageFile, text);
  }
  return { site, pageFile, pageNew: old === null, pageChanged, copies, copied, leftover, terms: terms.length, fromLesson, added, kept, pacify: pacify !== null };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const r = fileExplanation(args);
    console.log(`${r.pageNew ? 'Wrote' : r.pageChanged ? 'Updated' : 'No change to'} ${posix(relative(r.site, r.pageFile))}`);
    console.log(`Artifacts: ${r.copies.length} (${r.copied} copied, ${r.copies.length - r.copied} already the same)`);
    for (const c of r.copies) console.log(`  ${c.to}  ${c.bytes} bytes, changed ${c.changed}, sha256 ${c.sha.slice(0, 12)}`);
    if (r.leftover.length > 0) {
      console.log(`${r.leftover.length} ${r.leftover.length === 1 ? 'file' : 'files'} in public/explanations/${args.slug} ${r.leftover.length === 1 ? 'is' : 'are'} no longer in the source and no longer on the page. Nothing was deleted:`);
      for (const f of r.leftover) console.log(`  ${f}`);
    }
    if (r.pacify) console.log('The Pacify reply (pacify.md) is on the page.');
    if (r.fromLesson > 0) console.log(`${r.fromLesson} ${r.fromLesson === 1 ? 'term was' : 'terms were'} not in glossary.json and ${r.fromLesson === 1 ? 'was' : 'were'} taken from the lesson's own glossary.`);
    console.log(`Terms: ${r.terms} (${r.added} added to ledgers/glossary.json, ${r.kept} already there under their own entry)`);
    console.log(`Page address: /lorebook/explanations/${args.slug}/  (run \`npm run live\` to rebuild the site and its search)`);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
