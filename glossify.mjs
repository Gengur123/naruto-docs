// Build-time glossary linker (Satteri mdast plugin).
// Reads ledgers/glossary.json once and turns each term found in prose into a link
// with a class and a data-brief attribute; the stylesheet shows data-brief as a
// tooltip on hover and keyboard focus. Headings, code and existing links are left alone.
import { readFileSync } from 'node:fs';
import { defineMdastPlugin } from 'satteri';

// The anchor of a term on the glossary page. `dandori gloss add` writes the same slug into
// the default `page` (`/glossary/#<slug>`), so a letter outside a-z is kept, not cut out.
export function slugOf(term) {
  return term.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

export function loadGlossary(path = new URL('./ledgers/glossary.json', import.meta.url)) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Raw HTML in Markdown reaches the tree as separate nodes: an html node holding the opening
// tag, the text, an html node holding the closing tag. Text between them is inside the element.
const RAW_SKIP = /<(\/?)(code|pre|kbd|a|h[1-6])(?=[\s/>])[^>]*>/gi;

function rawTags(node) {
  if (node.type !== 'html' || typeof node.value !== 'string') return [];
  const tags = [];
  for (const m of node.value.matchAll(RAW_SKIP)) {
    if (m[0].endsWith('/>')) continue; // self-closing
    tags.push({ name: m[2].toLowerCase(), closing: m[1] === '/' });
  }
  return tags;
}

// True when `node`, or an ancestor of it, sits among its siblings after an opening tag for one of
// these elements and before the matching closing tag. An opening tag with no closing tag after
// the node does not count, so a stray tag cannot switch linking off for the rest of the page.
function insideRawElement(node, ctx) {
  for (let cur = node; cur; cur = ctx.parent(cur)) {
    const parent = ctx.parent(cur);
    const siblings = parent?.children;
    if (!siblings) continue;
    const at = ctx.indexOf(cur);
    if (at < 0) continue;
    const open = new Map();
    for (const s of siblings.slice(0, at)) {
      for (const t of rawTags(s)) {
        const n = open.get(t.name) ?? 0;
        open.set(t.name, t.closing ? Math.max(0, n - 1) : n + 1);
      }
    }
    for (const [name, n] of open) {
      if (n === 0) continue;
      const closes = siblings.slice(at + 1).some((s) => rawTags(s).some((t) => t.closing && t.name === name));
      if (closes) return true;
    }
  }
  return false;
}

export function glossify(entries = loadGlossary()) {
  // Every spelling (term and aliases) maps to its entry.
  const byWord = new Map();
  for (const e of entries) {
    for (const w of [e.term, ...(e.aliases ?? [])]) byWord.set(w.toLowerCase(), e);
  }
  // Longest spelling first so "adversarial round" wins over shorter terms.
  const words = [...byWord.keys()].sort((a, b) => b.length - a.length);
  const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
  const re = new RegExp('(?<![\\w/-])(' + esc.join('|') + ')(?:s|es)?(?![\\w/-])', 'gi');
  return defineMdastPlugin({
    name: 'glossify',
    text(node, ctx) {
      // Skip text anywhere inside a heading or a link, including under emphasis or strong.
      let parent = ctx.parent(node);
      if (!parent) return;
      for (let up = parent; up; up = ctx.parent(up)) {
        if (up.type === 'heading' || up.type === 'link') return;
      }
      if (insideRawElement(node, ctx)) return;
      const out = [];
      let last = 0;
      for (const m of node.value.matchAll(re)) {
        const entry = byWord.get(m[1].toLowerCase().replace(/\s+/g, ' '));
        if (!entry) continue;
        if (m.index > last) out.push({ type: 'text', value: node.value.slice(last, m.index) });
        out.push({
          type: 'link',
          url: `/glossary/#${slugOf(entry.term)}`,
          data: { hProperties: { className: ['dd-gloss'], 'data-brief': entry.brief } },
          children: [{ type: 'text', value: m[0] }],
        });
        last = m.index + m[0].length;
      }
      if (out.length === 0) return;
      if (last < node.value.length) out.push({ type: 'text', value: node.value.slice(last) });
      ctx.replaceNode(node, out);
    },
  });
}
