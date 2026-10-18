// Draws the byte map of a struct into every <div class="dd-layout">.
//
// The numbers come from the MoonBit layout code, built for the js target and served as
// /dandori/layout.js. That file exists only in the dandori-skills repository, where
// `npm run sync-layout` copies it in; a site copied out of the starter does not have it,
// and its byte maps stay as text. This page calls one export of that module,
// `layout_json(text)`, which tools/dandori/web/moon.pkg in that repository exports. `text` is the struct as
// `dandori layout` reads it, `{ "rule": "c", "fields": [{ "name": "id", "type": "u32" }] }`,
// and the answer is the JSON that `dandori layout --json` prints: size, align, wasted, and
// per field offset, size, align and padding_before. This file only turns that answer into
// one cell per byte; it works out no offset itself, so the page cannot disagree with the tool.
//
// The struct is read from the div's data-struct, or, on the tracker pages, from the JSON
// text inside the div. If the module is missing, throws, or reports an error for a struct,
// the plain text already in the div is left as it is. Nothing here throws into the page.

export const MODULE_URL = '/dandori/layout.js';

// The names this file calls on the module. In the dandori-skills repository, `npm test` and
// `sync-layout` check each one against the exports in tools/dandori/web/moon.pkg, so the
// two sides cannot drift apart.
export const EXPORTS_USED = ['layout_json'];

// One entry per byte of the struct: the field it belongs to, or padding.
export function cellsOf(layout) {
  if (layout.error) throw new Error(layout.error);
  const cells = new Array(layout.size).fill(null);
  layout.fields.forEach((f, field) => {
    for (let i = 0; i < f.size; i++) {
      cells[f.offset + i] = {
        field,
        label: `${f.name}: ${f.type}  offset ${f.offset}  size ${f.size}  align ${f.align}`,
        text: f.name.slice(0, 2),
      };
    }
  });
  return cells.map((cell, at) => {
    if (cell) return cell;
    const next = layout.fields.find((f) => f.offset > at);
    const where = next ? `before ${next.name}` : 'at the end';
    return { field: -1, label: `padding byte ${at}, ${where}`, text: '' };
  });
}

// Whether the module's answer honours an `align` the struct asks for. A layout module
// built before the layout code read `align` ignores it and answers with a smaller size,
// so its answer must not be drawn. `npm run sync-layout` brings a current module in.
export function honoursAlign(struct, layout) {
  const asked = Number(struct?.align ?? 0);
  if (!(asked > 0) || layout.error) return true;
  return layout.align >= asked && layout.size % asked === 0;
}

// The line above the bytes.
export function headline(layout) {
  let head = `${layout.id} under ${layout.rule}: ${layout.size} bytes, align ${layout.align}, ${layout.wasted} wasted`;
  if (layout.reordered && layout.reordered.recoverable > 0) {
    head += `; ${layout.reordered.size} bytes if ordered ${layout.reordered.order.join(', ')}`;
  }
  return head;
}

function draw(div, layout) {
  const bytes = document.createElement('div');
  bytes.className = 'dd-bytes';
  const tip = document.createElement('div');
  tip.className = 'dd-layout-tip';
  tip.textContent = headline(layout);
  for (const c of cellsOf(layout)) {
    const cell = document.createElement('span');
    cell.className = c.field < 0 ? 'dd-byte dd-byte-pad' : 'dd-byte';
    // The colour is a token of the shared palette in src/styles/dandori.css.
    if (c.field >= 0) cell.style.setProperty('--dd-c', `var(--dd-field-${c.field % 10})`);
    cell.textContent = c.text;
    cell.title = c.label;
    cell.addEventListener('mouseenter', () => { tip.textContent = c.label; });
    bytes.append(cell);
  }
  // Keep what was there, hidden, so the drawing replaces it and nothing is lost.
  let old = div.querySelector('.dd-fallback');
  if (!old) {
    old = document.createElement('pre');
    old.className = 'dd-fallback';
    old.textContent = div.textContent;
    div.textContent = '';
    div.append(old);
  }
  old.hidden = true;
  div.append(bytes, tip);
  div.dataset.drawn = 'true';
}

async function main() {
  const divs = [...document.querySelectorAll('div.dd-layout')];
  if (divs.length === 0) return;
  let mod;
  try {
    mod = await import(/* @vite-ignore */ MODULE_URL);
  } catch {
    return; // module not synced: keep the plain text
  }
  if (EXPORTS_USED.some((name) => typeof mod[name] !== 'function')) return;
  for (const div of divs) {
    try {
      const text = div.dataset.struct ?? div.textContent;
      const layout = JSON.parse(mod.layout_json(text));
      if (!honoursAlign(JSON.parse(text), layout)) throw new Error('the layout module is older than this page: run npm run sync-layout');
      draw(div, layout);
    } catch {
      div.dataset.drawn = 'failed'; // keep the plain text for this one
    }
  }
}

if (typeof document !== 'undefined') main();
