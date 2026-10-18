// What the struct picker works out from dataflow ledger entries: the groups, the search,
// which rows of a long list are in view, whether an entry may be drawn, and the list of
// places where a struct's name appears. No DOM here, so `npm test` runs every function in
// this file under Node.
//
// An "entry" is one item of ledgers/dataflow.json as `dandori tracker scan --structs`
// writes it: { id, name, where, lang, rule, repr, derives, pack, align, fields: [{ name,
// type, unknown? }], moves: [{ at, how, to?, text?, note? }], state }. Every key but `id`
// and `fields` may be absent, so a struct written by hand on a page is an entry too.
// A page may add `group` to an entry to file it under a name of its own ("examples").
//
// Nothing here works a size or an offset out, and nothing here follows a value. A move is
// a place where the type's name appears in the source, found by syntax.

import { entryOf } from './dd-annotate.js';

export const NO_GROUP = '(no group)';

// The struct's own name: the last part of the id.
export function nameOf(entry) {
  if (entry.name) return entry.name;
  const id = entry.id ?? '';
  return id.slice(id.lastIndexOf('.') + 1) || id;
}

// The system or module an entry belongs to: its id without the struct's name.
export function groupOf(entry) {
  if (entry.group) return entry.group;
  const id = entry.id ?? '';
  const cut = id.lastIndexOf('.');
  return cut > 0 ? id.slice(0, cut) : NO_GROUP;
}

// The system a source line belongs to, by the rule the scan uses for an id: the path's
// folders without `src` and `crates`, then the file name without its extension unless it
// is mod, lib or main, joined by dots. "crates/render/src/mesh.rs:12" gives "render.mesh".
export function systemOf(at) {
  const path = String(at ?? '').replace(/:\d+(:\d+)?$/, '').replace(/\\/g, '/');
  const parts = path.split('/').filter((part) => part && part !== '.');
  const file = (parts.pop() ?? '').replace(/\.[^.]*$/, '');
  const out = parts.filter((part) => part !== 'src' && part !== 'crates');
  if (file && !['mod', 'lib', 'main'].includes(file)) out.push(file);
  return out.join('.') || NO_GROUP;
}

// The dotted prefix every one of `names` starts with, with its last dot ("render." for
// render.mesh and render.pool), so a list can say it once. Empty when there is none.
export function commonPrefix(names) {
  if (names.length < 2) return '';
  const split = names.map((name) => name.split('.'));
  let depth = 0;
  // Stop one part short of the shortest name, so no name is cut down to nothing.
  const most = Math.min(...split.map((parts) => parts.length)) - 1;
  while (depth < most && split.every((parts) => parts[depth] === split[0][depth])) depth++;
  return depth > 0 ? split[0].slice(0, depth).join('.') + '.' : '';
}

// Why no byte layout is drawn for this entry, one reason per item; empty when one may be.
// The rule is the one `dandori tracker render` follows (draw_blocks in tools/dandori/ledger):
// an entry is drawn only when its source fixes its layout and the layout code knows every
// field's type. An entry with a reason here never gets a size, an offset or a byte strip.
export function drawBlocks(entry) {
  if (entry.rule === 'unfixed') {
    return ['the source does not fix this struct’s layout, so the compiler may reorder its fields'];
  }
  if (!entry.rule) return ['the entry names no layout rule'];
  const unknown = (entry.fields ?? []).filter((field) => field.unknown);
  return unknown.map((field) => `the layout code does not know the type of ${field.name}: ${field.type}`);
}

export const mayDraw = (entry) => drawBlocks(entry).length === 0;

// What the view shows for one entry. `layouts` is called only for an entry that may be
// drawn, with the struct as the layout code reads it; it answers what layoutsOf() answers,
// undefined while the layout code is still loading, or null when the page has none.
//   { kind: 'cards', struct, layouts }   the showcase cards, with numbers from the layout code
//   { kind: 'fields', why, fields }      the fields as written and why no byte layout is drawn;
//                                        `unknown` marks a field whose type is not known
//   { kind: 'wait' }                     nothing yet
// No path gives an entry that may not be drawn a size or an offset.
export function bodyOf(entry, layouts) {
  const all = entry.fields ?? [];
  const fixed = entry.rule !== 'unfixed';
  const fields = all.map((field) => ({ name: field.name, type: field.type, unknown: fixed && Boolean(field.unknown) }));
  const blocks = drawBlocks(entry);
  if (blocks.length > 0) {
    const unknown = fields.filter((field) => field.unknown).length;
    return { kind: 'fields', why: unknown > 0 ? `the layout code does not know the type of ${unknown} of ${all.length} fields` : blocks[0], fields };
  }
  const struct = entryOf(entry);
  const answer = layouts(struct);
  if (answer === undefined) return { kind: 'wait' };
  if (answer === null) return { kind: 'fields', why: 'this page has no layout code', fields };
  if (answer.error) return { kind: 'fields', why: `the layout code refused it: ${answer.error}`, fields };
  return { kind: 'cards', struct, layouts: answer };
}

// The entries as the picker lists them: one item per entry, sorted by group and then by
// name, with the lower-case text the search reads. A group a page named (`group` on an
// entry) comes after the groups read from ids. `groups` says where each group starts.
export function indexOf(entries) {
  const items = entries.map((entry, at) => {
    const name = nameOf(entry);
    const group = groupOf(entry);
    const fields = (entry.fields ?? []).map((field) => `${field.name}: ${field.type}`);
    return {
      at,
      id: entry.id ?? name,
      name,
      group,
      named: Boolean(entry.group),
      rule: entry.rule ?? '',
      lang: entry.lang ?? '',
      drawn: mayDraw(entry),
      fields,
      lowName: name.toLowerCase(),
      lowGroup: group.toLowerCase(),
      lowFacts: [...(entry.repr ?? []).map((item) => `repr(${item})`), ...(entry.derives ?? [])].join(' ').toLowerCase(),
      lowFields: fields.map((text) => text.toLowerCase()),
    };
  });
  const text = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  items.sort((a, b) => Number(a.named) - Number(b.named) || text(a.group, b.group) || text(a.lowName, b.lowName) || a.at - b.at);
  const groups = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) last.count++;
    else groups.push({ group: item.group, named: item.named, count: 1 });
  }
  const prefix = commonPrefix(groups.filter((g) => !g.named && g.group !== NO_GROUP).map((g) => g.group));
  for (const g of groups) g.label = !g.named && prefix && g.group.startsWith(prefix) ? g.group.slice(prefix.length) : g.group;
  return { items, groups, prefix };
}

// How well one word of the search fits one item: 0 the name starts with it, 1 the name
// holds it, 2 the group, the rule, the language, a repr item or a derive holds it, 3 a
// field's name or type
// holds it (with that field, as written), -1 nothing does.
function fit(item, word) {
  const at = item.lowName.indexOf(word);
  if (at === 0) return { score: 0 };
  if (at > 0) return { score: 1 };
  if (item.lowGroup.includes(word) || item.rule === word || item.lang === word || item.lowFacts.includes(word)) return { score: 2 };
  const field = item.lowFields.findIndex((text) => text.includes(word));
  return field >= 0 ? { score: 3, field: item.fields[field] } : { score: -1 };
}

// The rows of the list for what was typed. Every word typed must fit the item: its name,
// its group, its rule or language, a repr item or a derive as written, or the name or type
// of one of its fields. Rows keep the
// groups as headings; inside a group the better fit comes first. Each group of the index
// is in `groups` with how many of its items fit and the row its heading is on (-1 when
// none fit), which is what makes the group list a table of contents.
//   row: { kind: 'group', group, label, count } or { kind: 'option', item, why }
// `why` is the field that matched, when no word matched the name or the group.
export function search(index, typed) {
  const words = String(typed ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const rows = [];
  const groups = [];
  let options = 0;
  let from = 0;
  for (const g of index.groups) {
    const found = [];
    for (const item of index.items.slice(from, from + g.count)) {
      let score = 0;
      let why = '';
      let ok = true;
      for (const word of words) {
        const one = fit(item, word);
        if (one.score < 0) {
          ok = false;
          break;
        }
        score += one.score;
        if (one.field && !why) why = one.field;
      }
      if (ok) found.push({ kind: 'option', item, why, score });
    }
    from += g.count;
    if (words.length > 0) found.sort((a, b) => a.score - b.score);
    groups.push({ group: g.group, label: g.label, total: g.count, count: found.length, row: found.length > 0 ? rows.length : -1 });
    if (found.length === 0) continue;
    rows.push({ kind: 'group', group: g.group, label: g.label, count: found.length });
    for (const option of found) rows.push({ kind: 'option', item: option.item, why: option.why });
    options += found.length;
  }
  return { rows, groups, options };
}

// The rows of a long list that are worth drawing: those in the box plus a few either side.
// Rows are all `rowHeight` tall. Returns [start, end) into the list.
export function rowsInView(scrollTop, boxHeight, rowHeight, total, spare = 4) {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - spare);
  const end = Math.min(total, Math.ceil((scrollTop + boxHeight) / rowHeight) + spare);
  return [Math.min(start, end), end];
}

// The next option row from `from` in direction `step` (1 or -1), skipping headings.
// Stays on `from` when there is none; from -1 it finds the first (or the last).
export function stepRow(rows, from, step) {
  let at = from < 0 ? (step > 0 ? -1 : rows.length) : from;
  for (;;) {
    at += step;
    if (at < 0 || at >= rows.length) return from >= 0 && rows[from]?.kind === 'option' ? from : -1;
    if (rows[at].kind === 'option') return at;
  }
}

// The first struct of the next group from `from` (step 1), or of the group before (step
// -1; from the middle of a group, that group's own first struct). Stays when there is none.
export function stepGroup(rows, from, step) {
  if (from < 0) return stepRow(rows, -1, 1);
  if (step > 0) {
    for (let at = from + 1; at < rows.length; at++) if (rows[at].kind === 'group') return stepRow(rows, at, 1);
    return from;
  }
  let head = from;
  while (head > 0 && rows[head].kind !== 'group') head--;
  if (from === head + 1) {
    // Already on the first struct of its group: go to the group before.
    head--;
    while (head > 0 && rows[head].kind !== 'group') head--;
  }
  return head >= 0 && rows[head]?.kind === 'group' ? stepRow(rows, head, 1) : from;
}

// What a place that names two structs says, read from the struct it is recorded on
// (`out`) and from the struct it names (`in`). Words about the source text, not about
// what a value does later.
const LINK_WORDS = {
  field: { out: 'appears in the type of a field of', in: 'has a field whose type names' },
  transmute: { out: 'transmute to', in: 'transmute from' },
  'from-impl': { out: 'impl From, for', in: 'impl From, from' },
};
export function linkWords(how, direction) {
  return LINK_WORDS[how]?.[direction] ?? (direction === 'out' ? `${how}, also names` : `${how}, named with`);
}

export const SIGNATURE = ['parameter', 'return'];

// The folder every scanned entry is under: the folders their `where` paths share. Empty
// when no entry was scanned or they share none. Entries typed into a page (no `lang`)
// are left out.
export function scannedFolder(entries) {
  let shared = null;
  for (const entry of entries) {
    if (!entry.lang || !entry.where) continue;
    const folders = String(entry.where).replace(/:\d+$/, '').split('/').slice(0, -1);
    if (shared === null) shared = folders;
    else {
      let same = 0;
      while (same < shared.length && same < folders.length && shared[same] === folders[same]) same++;
      shared = shared.slice(0, same);
    }
  }
  return (shared ?? []).join('/');
}

// What the picker says once, above the structs in view, about the places it lists.
// `folder` is the folder that was scanned. The list of what is not seen is the scan's own
// (`dandori help`, tracker scan --structs).
export function scopeNote(folder) {
  const where = folder ? `Scanned folder: ${folder}. ` : '';
  return (
    `${where}The places under a struct are lines where its name is written: a field, a signature, a cast. ` +
    'Not seen: a call that names no type, such as bytemuck::cast_slice(&v), so a copy into a GPU buffer written that way is not listed; ' +
    'a generic, a macro, a trait object, a type alias; and code outside the scanned folder. ' +
    'So an empty list does not mean the struct goes nowhere. A place that names two structs is listed under both.'
  );
}

// For each entry id, the moves other entries record with `to` naming it. A `to` is stored
// once, on the struct the place was found for, so the other end is found by turning the
// edges around. Built once per ledger.
export function namedBy(entries) {
  const back = new Map();
  for (const entry of entries) {
    for (const move of entry.moves ?? []) {
      if (!move.to || move.to === entry.id) continue;
      if (!back.has(move.to)) back.set(move.to, []);
      back.get(move.to).push({ from: entry.id, move });
    }
  }
  return back;
}

// The places where a struct's name appears, as the ledger records them, in three lists:
//   links       places that name a second struct, one item per struct and kind, with every
//               such place under it. `other` is that struct's id; `known` says whether the
//               ledger has it, so a viewer can add it to the view.
//   sites       the other places that are not signatures (a cast, a binding, a copy ...).
//   signatures  parameter and return places, grouped by the system the line is in.
// Null when the ledger records no place for the entry: the view then shows nothing.
// The order is the ledger's order and the order of groups is by name. It is not an order
// in time: nothing here says which place a value reaches first.
export function followOf(entry, { byId, back }) {
  const place = (move) => ({ at: move.at, how: move.how, text: move.text ?? '', note: move.note ?? '' });
  const links = [];
  const link = (direction, how, other, move) => {
    let item = links.find((l) => l.direction === direction && l.how === how && l.other === other);
    if (!item) {
      item = { direction, how, words: linkWords(how, direction), other, known: byId.has(other), places: [] };
      links.push(item);
    }
    item.places.push(place(move));
  };
  const sites = [];
  const bySystem = new Map();
  let count = 0;
  for (const move of entry.moves ?? []) {
    count++;
    if (move.to && move.to !== entry.id) link('out', move.how, move.to, move);
    else if (SIGNATURE.includes(move.how)) {
      const system = systemOf(move.at);
      if (!bySystem.has(system)) bySystem.set(system, []);
      bySystem.get(system).push(place(move));
    } else sites.push(place(move));
  }
  for (const { from, move } of back.get(entry.id) ?? []) {
    count++;
    link('in', move.how, from, move);
  }
  if (count === 0) return null;
  const signatures = [...bySystem.keys()].sort().map((system) => {
    const places = bySystem.get(system);
    const kinds = SIGNATURE.map((how) => [how, places.filter((p) => p.how === how).length]).filter(([, n]) => n > 0);
    return { system, places, summary: kinds.map(([how, n]) => `${n} ${how}`).join(', ') };
  });
  return { count, links, sites, signatures };
}

// The line under a struct's name: what the source says about it, as written.
export function sourceLine(entry) {
  const parts = [];
  if (entry.lang) parts.push(entry.lang);
  if (entry.repr?.length) parts.push(`repr(${entry.repr.join(', ')})`);
  if (entry.derives?.length) parts.push(`derive(${entry.derives.join(', ')})`);
  if (entry.state) parts.push(entry.state);
  return parts.join(' · ');
}

// The entry with only what the picker reads, for a page that carries a whole ledger.
export function slim(entry) {
  const out = { id: entry.id };
  for (const key of ['name', 'group', 'where', 'lang', 'rule', 'repr', 'derives', 'pack', 'align', 'types', 'state', 'commit', 'date']) {
    if (entry[key] != null) out[key] = entry[key];
  }
  if (entry.updated && !out.date) out.date = entry.updated;
  out.fields = (entry.fields ?? []).map((f) => (f.unknown ? { name: f.name, type: f.type, unknown: true } : { name: f.name, type: f.type }));
  if (entry.moves?.length) {
    out.moves = entry.moves.map((m) => {
      const move = { at: m.at, how: m.how };
      if (m.to) move.to = m.to;
      if (m.text) move.text = m.text;
      if (m.note) move.note = m.note;
      return move;
    });
  }
  return out;
}
