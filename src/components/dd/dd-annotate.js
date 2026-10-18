// From layout numbers to what the showcase components draw. No DOM here, so `npm test`
// runs every function in this file under Node.
//
// A "struct" is what `dandori layout` reads: { id, rule, fields: [{ name, type }], types?, pack?, align? }.
// A "layout" is what `layout_json` answers for it: size, align, wasted, tail_padding, and
// per field offset, size, align and padding_before. An "engine" is any object with a
// `layout_json(text)` function: the built MoonBit module.
//
// Nothing here works a size or an offset out. A byte is placed at the index the layout
// gives, and a run of padding is the bytes no field was placed on.

export const RULES = ['c', 'std140', 'std430', 'scalar', 'wgsl', 'hlsl-cbuffer'];
export const PACKS = [0, 1, 2, 4, 8];
export const PALETTE_SIZE = 10;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// The letter a field carries in a strip and in the list beside it.
export function letterOf(index) {
  return LETTERS[index % LETTERS.length];
}

// The struct with only the keys the layout code reads.
export function entryOf(struct) {
  const entry = {
    id: struct.id ?? 'struct',
    rule: struct.rule,
    fields: struct.fields.map((f) => ({ name: f.name, type: f.type })),
  };
  if (struct.types) entry.types = struct.types;
  if (struct.pack) entry.pack = struct.pack;
  // repr(align(N)) as the scan records it; the layout code raises the alignment to it.
  if (struct.align) entry.align = struct.align;
  return entry;
}

// One layout, or { error } with the module's own message.
export function layoutOf(engine, struct) {
  try {
    return JSON.parse(engine.layout_json(JSON.stringify(entryOf(struct))));
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

// The struct with its fields in the order of `names`. A name the struct lacks is skipped
// and a field `names` lacks keeps its place at the end, so no field is ever lost.
export function reorderStruct(struct, names) {
  const left = struct.fields.slice();
  const fields = [];
  for (const name of names) {
    const at = left.findIndex((f) => f.name === name);
    if (at >= 0) fields.push(left.splice(at, 1)[0]);
  }
  return { ...struct, fields: [...fields, ...left] };
}

// The declared layout and, when the module says a field order is smaller, that order laid
// out again by the module. `reordered` is null when no order is smaller.
export function layoutsOf(engine, struct) {
  const declared = layoutOf(engine, struct);
  if (declared.error) return { error: declared.error, declared: null, reordered: null };
  let reordered = null;
  if (declared.reordered && declared.reordered.recoverable > 0) {
    const again = layoutOf(engine, reorderStruct(struct, declared.reordered.order));
    if (!again.error) reordered = again;
  }
  return { declared, reordered };
}

// For each field of `other`, the index of the field with that name in `declared`, so a
// field keeps one colour and one letter in every view. Fields are matched in order, so
// two fields with one name still get two indexes.
export function keysOf(declared, other) {
  const taken = new Set();
  return other.fields.map((f, at) => {
    const found = declared.fields.findIndex((d, i) => d.name === f.name && !taken.has(i));
    const key = found >= 0 ? found : at;
    taken.add(key);
    return key;
  });
}

// The layout as runs in byte order: a field, or the padding between two fields, or the
// padding at the end. A padding run says which field it sits before (-1 at the end).
export function runsOf(layout) {
  const owner = new Array(layout.size).fill(-1);
  layout.fields.forEach((f, field) => {
    for (let i = 0; i < f.size; i++) owner[f.offset + i] = field;
  });
  const runs = [];
  for (let at = 0; at < owner.length; ) {
    let end = at + 1;
    while (end < owner.length && owner[end] === owner[at]) end++;
    if (owner[at] >= 0) {
      runs.push({ kind: 'field', field: owner[at], offset: at, size: end - at });
    } else {
      runs.push({ kind: 'pad', before: end < owner.length ? owner[end] : -1, offset: at, size: end - at });
    }
    at = end;
  }
  return runs;
}

// The rows of a strip that is `cols` bytes wide. Each row holds the pieces of the runs
// that fall in it: which run, the column it starts at, how many cells, and whether it is
// the first piece of its run (the piece that carries the label).
export function rowsOf(runs, size, cols) {
  const rows = [];
  for (let start = 0; start < size; start += cols) rows.push({ start, pieces: [] });
  runs.forEach((run, index) => {
    let at = run.offset;
    const end = run.offset + run.size;
    while (at < end) {
      const row = Math.floor(at / cols);
      const stop = Math.min(end, (row + 1) * cols);
      rows[row].pieces.push({ run: index, col: at - row * cols, span: stop - at, first: at === run.offset });
      at = stop;
    }
  });
  return rows;
}

// What forces a run of padding. The layout code gives the run and each alignment; it does
// not name a cause, so this is the page's reading of those numbers, and it only names one
// when the numbers leave no other:
//   'next'    the run is shorter than the next field's alignment and that field starts on
//             a multiple of it, so the run is exactly the step up to that alignment;
//   'struct'  the same for the run at the end and the struct's own alignment;
//   null      anything else (a packed field, a rule that keeps a field from crossing a
//             16-byte row, an array or struct rounded up): the page says only where it is.
export function padCause(layout, run) {
  if (run.before < 0) return run.size < layout.align && layout.size % layout.align === 0 ? 'struct' : null;
  const next = layout.fields[run.before];
  return run.size < next.align && next.offset % next.align === 0 ? 'next' : null;
}

// The cause with its name and number, for a line that stands alone (the pointer line of a
// small strip, the page without JavaScript).
export function padReason(layout, run) {
  const cause = padCause(layout, run);
  if (run.before < 0) return cause ? `${layout.id} aligns to ${layout.align}` : 'at the end';
  const next = layout.fields[run.before];
  return cause ? `${next.name} aligns to ${next.align}` : `before ${next.name}`;
}

// The cause in a list, where the next row is the field and its alignment is in that row:
// no name and no number are said again.
export const CAUSES = { next: 'aligns the next field', struct: 'rounds the size up to the struct’s alignment' };

// The rows of the list beside a strip, in byte order: one per field and one per run of
// padding. `keys` is keysOf(...) when the layout is not the declared one. `was` is the
// declared layout when the list should also say where each field came from.
export function annotate(layout, { keys, was } = {}) {
  return runsOf(layout).map((run) => {
    if (run.kind === 'pad') {
      return { kind: 'pad', id: `p${run.offset}`, offset: run.offset, size: run.size, cause: padCause(layout, run), reason: padReason(layout, run) };
    }
    const f = layout.fields[run.field];
    const key = keys ? keys[run.field] : run.field;
    const row = {
      kind: 'field',
      id: `f${key}`,
      index: run.field,
      key,
      letter: letterOf(key),
      name: f.name,
      type: f.type,
      offset: f.offset,
      size: f.size,
      align: f.align,
    };
    if (was) row.was = { position: key, offset: was.fields[key].offset };
    return row;
  });
}

// The rows of the list when the struct has no layout (the module refused it): the fields
// as typed, with no numbers.
export function annotateStruct(struct) {
  return struct.fields.map((f, index) => ({
    kind: 'field',
    id: `f${index}`,
    index,
    key: index,
    letter: letterOf(index),
    name: f.name,
    type: f.type,
    offset: '',
    size: '',
    align: '',
  }));
}

// "2 → 1" when a value changed, "1" when it did not.
export function change(before, after) {
  return before === after ? String(after) : `${before} → ${after}`;
}

// The words and numbers of one row of the list, cell by cell. <dd-fields> draws these and
// nothing else, so a test can read what the list says without a browser.
export function listCells(row, { compare = false } = {}) {
  if (row.kind === 'pad') {
    return { name: 'padding', second: CAUSES[row.cause] ?? '', offset: String(row.offset), size: String(row.size), align: '' };
  }
  return {
    name: row.name,
    second: compare && row.was ? change(row.was.position + 1, row.index + 1) : row.type,
    offset: compare && row.was ? change(row.was.offset, row.offset) : String(row.offset),
    size: String(row.size),
    align: String(row.align),
  };
}

// The modes of a byte strip, and what each writes on one run. <dd-bytes> draws these and
// nothing else.
//   small      a letter on each field; a ruler mark per row; the pointer line.
//   large      a letter on each field and nothing more: the picture beside a field list,
//              which has every name and number, so none is on the page twice.
//   annotated  for a strip with no list beside it: every byte's index, each field's name
//              where its bytes have room for it, each run of padding with its size.
export const MODES = ['small', 'large', 'annotated'];
export function stripLabels(layout, run, mode, key = run.field) {
  if (run.kind === 'pad') return { cell: mode === 'annotated' ? String(run.size) : '', name: '' };
  return { cell: letterOf(key), name: mode === 'annotated' ? layout.fields[run.field].name : '' };
}

// One line for one run: what a small strip shows when a byte is pointed at.
export function readout(layout, run) {
  if (run.kind === 'pad') {
    return `padding · offset ${run.offset} · size ${run.size} · ${padReason(layout, run)}`;
  }
  const f = layout.fields[run.field];
  return `${f.name}: ${f.type} · offset ${f.offset} · size ${f.size} · align ${f.align}`;
}

// The whole layout as one sentence, for a screen reader and for the page without JavaScript.
export function describe(layout) {
  const fields = layout.fields.map((f) => `${f.name} ${f.type} at ${f.offset}`).join(', ');
  return `${layout.id}: rule ${layout.rule}, ${layout.size} bytes, align ${layout.align}, ${layout.wasted} bytes of padding. ${fields}.`;
}

// The line under the big number: how much of the struct is padding.
export function paddingNote(layout) {
  return layout.wasted > 0 ? `${layout.wasted} of ${layout.size} bytes are padding` : 'no padding';
}

// A name no field of the struct has yet.
function freshName(struct) {
  for (let n = struct.fields.length + 1; ; n++) {
    const name = `field${n}`;
    if (!struct.fields.some((f) => f.name === name)) return name;
  }
}

// One edit, as the field list reports it. Returns a new struct; the old one is untouched.
//   { op: 'rename', index, value }   { op: 'retype', index, value }
//   { op: 'move', index, by: -1 | 1 }   { op: 'remove', index }   { op: 'add' }
//   { op: 'rule', value }   { op: 'pack', value }   { op: 'order', value: [names] }
export function edit(struct, change) {
  const fields = struct.fields.map((f) => ({ ...f }));
  const next = { ...struct, fields };
  switch (change.op) {
    case 'rename':
      fields[change.index].name = change.value;
      return next;
    case 'retype':
      fields[change.index].type = change.value;
      return next;
    case 'move': {
      const to = change.index + change.by;
      if (to < 0 || to >= fields.length) return struct;
      [fields[change.index], fields[to]] = [fields[to], fields[change.index]];
      return next;
    }
    case 'remove':
      fields.splice(change.index, 1);
      return next;
    case 'add':
      fields.push({ name: freshName(struct), type: 'u32' });
      return next;
    case 'rule': {
      next.rule = change.value;
      if (change.value !== 'c') delete next.pack;
      return next;
    }
    case 'pack':
      if (change.value) next.pack = change.value;
      else delete next.pack;
      return next;
    case 'order':
      return reorderStruct(struct, change.value);
    default:
      return struct;
  }
}
