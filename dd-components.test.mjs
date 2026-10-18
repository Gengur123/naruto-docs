// Tests of the showcase components' logic: from layout numbers to what is drawn and listed.
// Everything here runs without a browser. The layout numbers come from the layout kernel
// that ships with the site, so these tests also run in a site copied from the starter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { layout_json } from './src/lib/usagui-layout/kernel.js';
import {
  CAUSES,
  MODES,
  annotate,
  annotateStruct,
  change,
  describe,
  edit,
  keysOf,
  layoutOf,
  layoutsOf,
  letterOf,
  listCells,
  padCause,
  padReason,
  paddingNote,
  readout,
  reorderStruct,
  rowsOf,
  runsOf,
  stripLabels,
} from './src/components/dd/dd-annotate.js';
import { deltaLabel } from './src/components/dd/dd-delta.js';

const kernel = { layout_json };

const mesh = {
  id: 'render.Mesh',
  rule: 'c',
  types: { Bounds: [{ name: 'min', type: '[f32; 3]' }, { name: 'max', type: '[f32; 3]' }] },
  fields: [
    { name: 'visible', type: 'bool' },
    { name: 'bounds', type: 'Bounds' },
    { name: 'lod', type: 'u8' },
    { name: 'vertices', type: '*const Vertex' },
    { name: 'count', type: 'u32' },
  ],
};
const light = {
  id: 'light.Uniforms',
  rule: 'std140',
  fields: [
    { name: 'direction', type: 'vec3f' },
    { name: 'intensity', type: 'f32' },
    { name: 'color', type: 'vec3f' },
  ],
};

test('runs: every byte belongs to one field or one run of padding, in byte order', () => {
  const layout = layoutOf(kernel, mesh);
  const runs = runsOf(layout);
  assert.deepEqual(
    runs.map((r) => (r.kind === 'field' ? `${layout.fields[r.field].name}@${r.offset}+${r.size}` : `pad@${r.offset}+${r.size}`)),
    ['visible@0+1', 'pad@1+3', 'bounds@4+24', 'lod@28+1', 'pad@29+3', 'vertices@32+8', 'count@40+4', 'pad@44+4'],
  );
  // The padding the page draws is the padding the layout code reports, run by run.
  const pads = runs.filter((r) => r.kind === 'pad');
  assert.equal(pads.reduce((sum, r) => sum + r.size, 0), layout.wasted);
  for (const pad of pads.filter((r) => r.before >= 0)) assert.equal(pad.size, layout.fields[pad.before].padding_before);
  assert.equal(pads.at(-1).before, -1);
  assert.equal(pads.at(-1).size, layout.tail_padding);
  assert.equal(runs.reduce((sum, r) => sum + r.size, 0), layout.size);
});

test('padding says what forces it, and only when the numbers show it', () => {
  const layout = layoutOf(kernel, mesh);
  const pads = runsOf(layout).filter((r) => r.kind === 'pad');
  assert.deepEqual(pads.map((r) => padReason(layout, r)), ['bounds aligns to 4', 'vertices aligns to 8', 'render.Mesh aligns to 8']);
  // Padding as large as the alignment is not explained by the alignment alone.
  const odd = { id: 's', size: 32, align: 4, fields: [{ name: 'a', offset: 0, size: 4, align: 4 }, { name: 'b', offset: 16, size: 4, align: 4 }] };
  const [gap, tail] = runsOf(odd).filter((r) => r.kind === 'pad');
  assert.equal(padReason(odd, gap), 'before b');
  assert.equal(padReason(odd, tail), 'at the end');
  assert.equal(padCause(odd, gap), null);
});

test('the cause of padding is named only when the layout code’s numbers leave no other', () => {
  const causes = (struct) => {
    const layout = layoutOf(kernel, struct);
    return runsOf(layout).filter((r) => r.kind === 'pad').map((r) => `${r.offset}+${r.size} ${padCause(layout, r)} | ${padReason(layout, r)}`);
  };
  // pack 2: the layout code reports the packed alignment, and the one-byte gap is that step.
  assert.deepEqual(causes({ id: 'p', rule: 'c', pack: 2, fields: [{ name: 'a', type: 'u8' }, { name: 'b', type: 'u64' }, { name: 'c', type: 'u8' }] }), [
    '1+1 next | b aligns to 2',
    '11+1 struct | p aligns to 2',
  ]);
  // hlsl-cbuffer: b would cross a 16-byte row, so it moves. Its alignment is 4 and the gap
  // is 4, so alignment does not explain it, and the page names no cause.
  assert.deepEqual(causes({ id: 'h', rule: 'hlsl-cbuffer', fields: [{ name: 'a', type: 'vec3f' }, { name: 'b', type: 'vec2f' }, { name: 'c', type: 'f32' }] }), [
    '12+4 null | before b',
    '28+4 struct | h aligns to 16',
  ]);
  // std140: a nested struct and an array are aligned to 16, and the layout code says so.
  assert.deepEqual(causes({ id: 's', rule: 'std140', types: { In: [{ name: 'x', type: 'f32' }] }, fields: [{ name: 'a', type: 'f32' }, { name: 'n', type: 'In' }, { name: 'c', type: 'f32' }] }), [
    '4+12 next | n aligns to 16',
    '36+12 struct | s aligns to 16',
  ]);
  // A field that does not start on a multiple of its alignment is not explained by it.
  const off = { id: 'o', size: 12, align: 4, fields: [{ name: 'a', offset: 0, size: 1, align: 1 }, { name: 'b', offset: 2, size: 8, align: 4 }] };
  assert.deepEqual(runsOf(off).filter((r) => r.kind === 'pad').map((r) => padCause(off, r)), [null, 'struct']);
});

// What an expanded card of the struct showcase writes: its strip in mode "large" and its
// list. <dd-bytes> and <dd-fields> draw stripLabels() and listCells() and nothing else.
function expandedTexts(layout, options = {}) {
  const strip = runsOf(layout).flatMap((run) => {
    const key = run.kind === 'field' ? (options.keys ? options.keys[run.field] : run.field) : undefined;
    return Object.values(stripLabels(layout, run, 'large', key));
  });
  const rows = annotate(layout, options);
  const list = rows.flatMap((row) => Object.values(listCells(row, { compare: Boolean(options.was) })));
  return { strip: strip.filter(Boolean), list: list.filter(Boolean), rows };
}

test('an expanded card says each name, offset and padding size once', () => {
  const { declared, reordered } = layoutsOf(kernel, mesh);
  const keys = keysOf(declared, reordered);
  for (const [layout, options] of [[declared, {}], [reordered, { keys, was: declared }]]) {
    const { strip, list, rows } = expandedTexts(layout, options);
    const all = [...strip, ...list];
    // The strip holds one letter per field and nothing else: no name, no number.
    assert.deepEqual([...strip].sort(), layout.fields.map((_, i) => letterOf(i)).sort());
    for (const text of strip) assert.equal(/\d/.test(text) || text.length > 1, false, text);
    // Each field's name is written once, and no other text mentions it.
    for (const field of layout.fields) {
      assert.equal(all.filter((text) => text === field.name).length, 1, field.name);
      assert.equal(all.filter((text) => text !== field.name && text.includes(field.name)).length, 0, field.name);
    }
    // A run of padding is one row: the word, the cause without a name or a number, and
    // its offset and size in their own cells.
    for (const row of rows.filter((r) => r.kind === 'pad')) {
      const cells = listCells(row);
      assert.equal(/\d/.test(cells.name + cells.second), false, cells.second);
      assert.equal(cells.size, String(row.size));
    }
    assert.equal(rows.filter((r) => r.kind === 'pad').length, runsOf(layout).filter((r) => r.kind === 'pad').length);
  }
  assert.deepEqual(Object.values(CAUSES).filter((text) => /\d/.test(text)), []);
  // The annotated mode is for a strip with no list beside it; beside a list it would say
  // every name and every padding size a second time, which this test is here to catch.
  const run = runsOf(declared);
  assert.deepEqual(stripLabels(declared, run[2], 'annotated'), { cell: 'B', name: 'bounds' });
  assert.deepEqual(stripLabels(declared, run[1], 'annotated'), { cell: '3', name: '' });
  assert.deepEqual(stripLabels(declared, run[2], 'large'), { cell: 'B', name: '' });
  assert.deepEqual(stripLabels(declared, run[1], 'large'), { cell: '', name: '' });
  assert.deepEqual(stripLabels(declared, run[1], 'small'), { cell: '', name: '' });
  assert.deepEqual(MODES, ['small', 'large', 'annotated']);
});

test('the struct showcase puts its strips in mode "large" when a card is expanded', () => {
  const source = readFileSync(resolve('src', 'components', 'dd', 'dd-struct-showcase.js'), 'utf8');
  assert.equal(/setAttribute\('mode', [^)]*'annotated'/.test(source), false);
  assert.equal((source.match(/\? 'large' : 'small'/g) ?? []).length, 2);
});

test('rows: a strip 16 wide and 8 wide hold the same bytes, and each run is labelled once', () => {
  const layout = layoutOf(kernel, mesh);
  const runs = runsOf(layout);
  for (const cols of [16, 8]) {
    const rows = rowsOf(runs, layout.size, cols);
    assert.equal(rows.length, layout.size / cols);
    for (const row of rows) {
      assert.equal(row.pieces.reduce((sum, p) => sum + p.span, 0), cols);
      assert.deepEqual(row.pieces.map((p) => p.col), row.pieces.map((_, i) => row.pieces.slice(0, i).reduce((s, p) => s + p.span, 0)));
    }
    const firsts = rows.flatMap((row) => row.pieces.filter((p) => p.first).map((p) => p.run));
    assert.deepEqual(firsts, runs.map((_, i) => i));
  }
  // bounds is bytes 4 to 27: one piece of 12 and one of 12 at 16 wide, four pieces at 8 wide.
  assert.deepEqual(rowsOf(runs, 48, 16).flatMap((row) => row.pieces.filter((p) => p.run === 2).map((p) => p.span)), [12, 12]);
  assert.deepEqual(rowsOf(runs, 48, 8).flatMap((row) => row.pieces.filter((p) => p.run === 2).map((p) => p.span)), [4, 8, 8, 4]);
  // A last row that is not full.
  const short = rowsOf(runsOf(layoutsOf(kernel, mesh).reordered), 40, 16);
  assert.equal(short.at(-1).pieces.reduce((sum, p) => sum + p.span, 0), 8);
});

test('the list beside the strip: one row per field and per run of padding', () => {
  const layout = layoutOf(kernel, mesh);
  const rows = annotate(layout);
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'p1', 'f1', 'f2', 'p29', 'f3', 'f4', 'p44']);
  assert.deepEqual(rows[2], { kind: 'field', id: 'f1', index: 1, key: 1, letter: 'B', name: 'bounds', type: 'Bounds', offset: 4, size: 24, align: 4 });
  assert.deepEqual(rows[1], { kind: 'pad', id: 'p1', offset: 1, size: 3, cause: 'next', reason: 'bounds aligns to 4' });
  assert.deepEqual(listCells(rows[1]), { name: 'padding', second: 'aligns the next field', offset: '1', size: '3', align: '' });
  assert.deepEqual(listCells(rows[2]), { name: 'bounds', second: 'Bounds', offset: '4', size: '24', align: '4' });
  assert.equal(listCells(rows.at(-1)).second, 'rounds the size up to the struct’s alignment');
  assert.equal(readout(layout, runsOf(layout)[2]), 'bounds: Bounds · offset 4 · size 24 · align 4');
  assert.equal(readout(layout, runsOf(layout)[1]), 'padding · offset 1 · size 3 · bounds aligns to 4');
  assert.equal(paddingNote(layout), '10 of 48 bytes are padding');
  assert.match(describe(layout), /^render\.Mesh: rule c, 48 bytes, align 8, 10 bytes of padding\. visible bool at 0, /);
});

test('the reordered view: the order the layout code proposes, laid out by the layout code', () => {
  const { declared, reordered } = layoutsOf(kernel, mesh);
  assert.equal(declared.size, 48);
  assert.equal(reordered.size, declared.reordered.size);
  assert.equal(declared.size - reordered.size, declared.reordered.recoverable);
  assert.deepEqual(reordered.fields.map((f) => f.name), declared.reordered.order);
  // A field keeps its letter and colour, and the list says where it was.
  const keys = keysOf(declared, reordered);
  assert.deepEqual(keys, [3, 1, 4, 0, 2]);
  const rows = annotate(reordered, { keys, was: declared }).filter((r) => r.kind === 'field');
  assert.deepEqual(rows.map((r) => `${r.letter} ${r.name} ${r.was.position}>${r.index} ${r.was.offset}>${r.offset}`), [
    'D vertices 3>0 32>0',
    'B bounds 1>1 4>8',
    'E count 4>2 40>32',
    'A visible 0>3 0>36',
    'C lod 2>4 28>37',
  ]);
  assert.deepEqual(listCells(annotate(reordered, { keys, was: declared })[0], { compare: true }), { name: 'vertices', second: '4 → 1', offset: '32 → 0', size: '8', align: '8' });
  assert.equal(change(4, 1), '4 → 1');
  assert.equal(change(2, 2), '2');
});

test('no reordered view when no order is smaller, and the module’s own message on an error', () => {
  const lit = layoutsOf(kernel, light);
  assert.equal(lit.declared.size, 32);
  assert.equal(lit.reordered, null);
  const bad = layoutsOf(kernel, { id: 'x', rule: 'c', fields: [{ name: 'a', type: 'long' }] });
  assert.equal(bad.declared, null);
  assert.match(bad.error, /`long` is 4 bytes on Windows and 8 elsewhere/);
  assert.deepEqual(annotateStruct({ fields: [{ name: 'a', type: 'long' }] })[0], {
    kind: 'field', id: 'f0', index: 0, key: 0, letter: 'A', name: 'a', type: 'long', offset: '', size: '', align: '',
  });
});

test('two fields with one name keep two letters', () => {
  const declared = { fields: [{ name: 'a' }, { name: 'a' }, { name: 'b' }] };
  assert.deepEqual(keysOf(declared, { fields: [{ name: 'b' }, { name: 'a' }, { name: 'a' }] }), [2, 0, 1]);
  assert.equal(letterOf(0) + letterOf(25) + letterOf(26), 'AZa');
});

test('edits return a new struct and leave the old one alone', () => {
  const before = JSON.stringify(mesh);
  assert.equal(edit(mesh, { op: 'rename', index: 2, value: 'level' }).fields[2].name, 'level');
  assert.equal(edit(mesh, { op: 'retype', index: 2, value: 'u64' }).fields[2].type, 'u64');
  assert.deepEqual(edit(mesh, { op: 'move', index: 2, by: -1 }).fields.map((f) => f.name), ['visible', 'lod', 'bounds', 'vertices', 'count']);
  assert.equal(edit(mesh, { op: 'move', index: 0, by: -1 }), mesh);
  assert.equal(edit(mesh, { op: 'move', index: 4, by: 1 }), mesh);
  assert.deepEqual(edit(mesh, { op: 'remove', index: 0 }).fields.map((f) => f.name), ['bounds', 'lod', 'vertices', 'count']);
  const added = edit(edit(mesh, { op: 'add' }), { op: 'add' });
  assert.deepEqual(added.fields.slice(-2), [{ name: 'field6', type: 'u32' }, { name: 'field7', type: 'u32' }]);
  const packed = edit(mesh, { op: 'pack', value: 1 });
  assert.equal(packed.pack, 1);
  assert.equal(layoutOf(kernel, packed).wasted, 0);
  assert.equal('pack' in edit(packed, { op: 'pack', value: 0 }), false);
  assert.equal('pack' in edit(packed, { op: 'rule', value: 'std430' }), false);
  assert.deepEqual(edit(mesh, { op: 'order', value: ['count', 'nope', 'lod'] }).fields.map((f) => f.name), ['count', 'lod', 'visible', 'bounds', 'vertices']);
  assert.equal(reorderStruct(mesh, []).fields.length, 5);
  assert.equal(JSON.stringify(mesh), before);
  // Using the proposed order leaves nothing to recover.
  const { declared } = layoutsOf(kernel, mesh);
  assert.equal(layoutsOf(kernel, edit(mesh, { op: 'order', value: declared.reordered.order })).reordered, null);
});

test('the before and after figure reads as one phrase', () => {
  assert.equal(deltaLabel({ from: '48', to: '40', unit: 'bytes', note: 'saves 8 bytes' }), '48 bytes to 40 bytes, saves 8 bytes');
  assert.equal(deltaLabel({ from: '32', to: null, unit: 'bytes' }), '32 bytes');
  assert.equal(deltaLabel({ from: '32', to: '32', unit: '' }), '32');
});

// The three checks below need files that only the dandori-skills repository has.
const page = resolve('src', 'content', 'docs', 'showcase', 'struct-layout.mdx');
const built = resolve('..', '..', 'tools', 'dandori', '_build', 'js', 'release', 'build', 'web', 'web.js');
const standalone = resolve('..', '..', 'trials', 'showcase', 'f', 'index.html');
const pageStructs = () => JSON.parse(/export const structs = (\[[\s\S]*?\n\]);/.exec(readFileSync(page, 'utf8'))[1]);

test(
  'the showcase page hands the component structs the layout code accepts',
  { skip: !existsSync(page) && 'the showcase page is not in this site' },
  () => {
    const structs = pageStructs();
    assert.ok(structs.length > 0);
    for (const struct of structs) assert.equal(layoutsOf(kernel, struct).error, undefined, struct.id);
  },
);

test(
  'the kernel in the site and the built module of tools/dandori/web give the same layouts',
  { skip: (!existsSync(built) || !existsSync(page)) && 'build it first: moon build --target js --release in tools/dandori' },
  async () => {
    const web = await import(pathToFileURL(built).href);
    for (const struct of [...pageStructs(), mesh, light, { ...mesh, pack: 2 }, { id: 'x', rule: 'c', fields: [{ name: 'a', type: 'long' }] }]) {
      assert.deepEqual(layoutsOf(web, struct), layoutsOf(kernel, struct), struct.id);
    }
  },
);

test(
  'the standalone export holds the current styles and the page’s structs',
  { skip: (!existsSync(standalone) || !existsSync(page)) && 'trials/showcase/f is not here' },
  () => {
    const html = readFileSync(standalone, 'utf8').replace(/\r\n/g, '\n');
    const lf = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    assert.ok(html.includes(lf(resolve('src', 'components', 'dd', 'dd-components.css'))), 'run node trials/showcase/f/build.mjs');
    const tokens = /\/\* dd-tokens:start[\s\S]*?dd-tokens:end \*\//.exec(lf(resolve('src', 'styles', 'dandori.css')))[0];
    assert.ok(html.includes(tokens), 'run node trials/showcase/f/build.mjs');
    for (const struct of pageStructs()) assert.ok(html.includes(struct.id));
    assert.equal(/<(script|link|img)[^>]+(src|href)=/.test(html), false, 'the page must fetch nothing');
  },
);
