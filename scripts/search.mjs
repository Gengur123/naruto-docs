// Searches the built site's index from the command line, with no window and no server.
// It reads the same Pagefind index the Search box in the pages uses (dist/pagefind), so it
// answers for every page at once: sprints, trackers, glossary, lorebook and its explanations,
// showcase, tools and the API reference.
//
//   npm run search -- <words>            build first with `npm run build` (or `npm run live`)
//   npm run search -- --json <words>     the same hits as JSON, for a program
//
// The index is a snapshot of the last build. Pagefind documents its search for browsers
// only; here its own pagefind.js runs in Node, with file reads standing in for fetch.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// The section of a page is the first part of its address: /trackers/parity/ is in
// "trackers". The front page is "overview".
export function sectionOf(pageUrl) {
  return pageUrl.split(/[?#]/)[0].split('/').filter(Boolean)[0] ?? 'overview';
}

// Pagefind's excerpt is HTML: marks around the matched words, and entities.
function plain(html) {
  const entities = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' };
  return html.replace(/<[^>]+>/g, '').replace(/&(?:lt|gt|quot|#39|amp);/g, (e) => entities[e]).replace(/\s+/g, ' ').trim();
}

let loaded = null;

async function load(dist) {
  const bundle = join(dist, 'pagefind');
  if (!existsSync(join(bundle, 'pagefind-entry.json'))) {
    throw new Error(`no search index at ${bundle}; run \`npm run build\` first`);
  }
  if (loaded?.bundle === bundle) return loaded.pagefind;
  const base = pathToFileURL(bundle + '/').href;
  const webFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const address = String(input instanceof URL ? input.href : (input?.url ?? input));
    if (!address.startsWith('file:')) return webFetch(input, init);
    try {
      return new Response(readFileSync(fileURLToPath(address.split('?')[0])));
    } catch {
      return new Response(null, { status: 404 });
    }
  };
  // The address carries the folder, so two indexes in one process do not share a module.
  const pagefind = await import(pathToFileURL(join(bundle, 'pagefind.js')).href);
  await pagefind.options({ basePath: base, baseUrl: '/' });
  await pagefind.init();
  loaded = { bundle, pagefind };
  return pagefind;
}

// Returns the hits for `query`, best first: { url, section, title, excerpt }. `excerpt` is
// plain text.
export async function search(query, { dist = join(siteRoot, 'dist') } = {}) {
  const pagefind = await load(dist);
  const found = await pagefind.search(query);
  const hits = [];
  for (const result of found?.results ?? []) {
    const data = await result.data();
    // Read from disk, Pagefind puts the index folder's own address in front of each page's.
    const at = data.url.lastIndexOf('/pagefind/');
    const url = at >= 0 ? data.url.slice(at + '/pagefind'.length) : data.url;
    hits.push({
      url,
      section: sectionOf(url),
      title: data.meta?.title ?? url,
      excerpt: (data.excerpt ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    });
  }
  return hits;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const words = args.filter((a) => a !== '--json').join(' ').trim();
  if (words === '') {
    console.error('usage: npm run search -- [--json] <words>');
    process.exit(2);
  }
  try {
    const hits = await search(words);
    if (json) {
      console.log(JSON.stringify(hits, null, 2));
    } else {
      const sections = new Set(hits.map((h) => h.section));
      console.log(`${hits.length} pages in ${sections.size} sections for "${words}"`);
      for (const h of hits) console.log(`${h.section.padEnd(10)} ${h.url}  ${h.title}\n           ${h.excerpt}`);
    }
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
