import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { satteri } from '@astrojs/markdown-satteri';
import { glossify, loadGlossary } from './glossify.mjs';

// The glossary file is read here, at config load. Restart the dev server after editing it.
// The port is DANDORI_DOCS_PORT, or 4331; scripts/live.mjs reads the same variable.
const port = Number(process.env.DANDORI_DOCS_PORT || 4331);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`DANDORI_DOCS_PORT must be a whole number from 1 to 65535, got "${process.env.DANDORI_DOCS_PORT}"`);
}

// A term filed with an explanation (scripts/file-explanation.mjs tags it "explanation") is
// listed in the Glossary and linked from its explanation's page. It is not underlined on
// every other page: such terms belong to the subject explained, and many are common words.
const linkedTerms = loadGlossary().filter((entry) => !(entry.tags ?? []).includes('explanation'));

// GitHub Pages serves the site from /<repo>/; the deploy workflow sets DOCS_SITE and DOCS_BASE.
const base = (process.env.DOCS_BASE || '/').replace(/\/?$/, '/');

export default defineConfig({
  site: process.env.DOCS_SITE || undefined,
  base,
  server: { host: '127.0.0.1', port },
  markdown: { processor: satteri({ mdastPlugins: [glossify(linkedTerms)] }) },
  integrations: [
    starlight({
      title: 'Naruto TCG Sim',
      description: 'Headless Naruto TCG simulator for agent-driven data collection: status, trackers and research.',
      favicon: '/favicon.svg',
      customCss: ['./src/styles/dandori.css'],
      head: [{ tag: 'script', attrs: { type: 'module', src: `${base}dd-layout.js` } }],
      sidebar: [
        { label: 'Overview', slug: '' },
        { label: 'Research', items: [{ autogenerate: { directory: 'research' } }] },
        { label: 'Sprints', items: [{ autogenerate: { directory: 'sprints' } }] },
        { label: 'Trackers', items: [{ autogenerate: { directory: 'trackers' } }] },
        { label: 'Glossary', slug: 'glossary' },
        { label: 'Lorebook', items: [{ autogenerate: { directory: 'lorebook' } }] },
        { label: 'Showcase', items: [{ autogenerate: { directory: 'showcase' } }] },
        { label: 'Tools', items: [{ autogenerate: { directory: 'tools' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference/api' } }] },
      ],
    }),
  ],
});
