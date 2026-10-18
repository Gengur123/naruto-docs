// Runs with no person and no window: builds the site, then asks the search index the pages
// use. One query must find pages in at least three sections, and every filed explanation
// must be found by its own title.
//
// The query is DANDORI_SEARCH_TEST_QUERY, or "dandori". Set DANDORI_SEARCH_TEST_NO_BUILD=1
// to test the dist folder as it is.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { search, sectionOf } from './search.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const query = (process.env.DANDORI_SEARCH_TEST_QUERY ?? '').trim() || 'dandori';

if (process.env.DANDORI_SEARCH_TEST_NO_BUILD !== '1') {
  const built = spawnSync(process.execPath, [join(root, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
  });
  if (built.status !== 0) {
    console.error(built.stdout, built.stderr);
    throw new Error('astro build failed, so there is no index to search');
  }
}

test('sectionOf names the first part of the address', () => {
  assert.equal(sectionOf('/'), 'overview');
  assert.equal(sectionOf('/trackers/parity/'), 'trackers');
  assert.equal(sectionOf('/lorebook/explanations/how-rain-works/#terms'), 'lorebook');
});

test('the index holds every page the build wrote', () => {
  const entry = JSON.parse(readFileSync(join(root, 'dist', 'pagefind', 'pagefind-entry.json'), 'utf8'));
  const indexed = Object.values(entry.languages).reduce((n, l) => n + l.page_count, 0);
  const pages = readdirSync(join(root, 'src', 'content', 'docs'), { recursive: true })
    .filter((f) => /\.mdx?$/.test(String(f))).length;
  assert.equal(indexed, pages, `the index has ${indexed} pages, src/content/docs has ${pages}`);
});

test(`one query ("${query}") finds pages in at least three sections`, async () => {
  const hits = await search(query);
  const sections = [...new Set(hits.map((h) => h.section))].sort();
  console.log(`search "${query}": ${hits.length} pages in ${sections.length} sections: ${sections.join(', ')}`);
  assert.ok(sections.length >= 3, `only ${sections.length} sections: ${sections.join(', ')}`);
});

test('every filed explanation is found by its title', async () => {
  const folder = join(root, 'src', 'content', 'docs', 'lorebook', 'Explanations');
  const pages = existsSync(folder) ? readdirSync(folder).filter((f) => /\.mdx?$/.test(f) && !f.startsWith('index.')) : [];
  for (const file of pages) {
    const title = /^title:\s*(.+)$/m.exec(readFileSync(join(folder, file), 'utf8'))?.[1].trim().replace(/^(["'])(.*)\1$/, '$2');
    assert.ok(title, `${file} has no title`);
    const want = `/lorebook/explanations/${file.replace(/\.mdx?$/, '')}/`;
    const hits = await search(title);
    assert.ok(hits.some((h) => h.url === want), `searching "${title}" did not return ${want}`);
  }
  console.log(`explanations found by title: ${pages.length} of ${pages.length}`);
});

test('every filed explanation is found by terms it introduced', async () => {
  const folder = join(root, 'src', 'content', 'docs', 'lorebook', 'Explanations');
  const pages = existsSync(folder) ? readdirSync(folder).filter((f) => /\.mdx?$/.test(f) && !f.startsWith('index.')) : [];
  let asked = 0;
  for (const file of pages) {
    const text = readFileSync(join(folder, file), 'utf8');
    // The terms the page lists, each a link to its Glossary entry. Three are tried: the
    // first, the middle one and the last.
    const terms = [...text.matchAll(/<dt><a href="\/glossary\/#[^"]*">([^<]+)<\/a><\/dt>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    if (terms.length === 0) continue;
    const want = `/lorebook/explanations/${file.replace(/\.mdx?$/, '')}/`;
    for (const term of new Set([terms[0], terms[Math.floor(terms.length / 2)], terms[terms.length - 1]])) {
      const hits = await search(term);
      assert.ok(hits.some((h) => h.url === want), `searching "${term}" did not return ${want}`);
      asked++;
    }
  }
  console.log(`explanations found by a term: ${asked} searches over ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`);
});
