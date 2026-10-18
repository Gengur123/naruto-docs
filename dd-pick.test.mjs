// Tests of the struct picker's logic: groups, search, which rows are drawn, the list of
// places where a name appears, and which entries get a byte layout. No browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { layout_json } from './src/lib/usagui-layout/kernel.js';
import { layoutsOf } from './src/components/dd/dd-annotate.js';
import {
  NO_GROUP,
  bodyOf,
  commonPrefix,
  drawBlocks,
  followOf,
  groupOf,
  indexOf,
  linkWords,
  scannedFolder,
  scopeNote,
  mayDraw,
  namedBy,
  nameOf,
  rowsInView,
  search,
  slim,
  sourceLine,
  stepGroup,
  stepRow,
  systemOf,
} from './src/components/dd/dd-pick.js';

const kernel = { layout_json };

// A small ledger in the form `dandori tracker scan --structs --write` writes.
const ledger = [
  {
    id: 'render.scene.layout.SourceRecord',
    name: 'SourceRecord',
    where: 'crates/render/src/scene/layout.rs:67',
    lang: 'rust',
    rule: 'c',
    repr: ['C', 'align(16)'],
    derives: ['Clone', 'Copy', 'Pod', 'Zeroable'],
    align: 16,
    fields: [{ name: 'counts', type: '[u32; 4]' }, { name: 'sphere', type: '[f32; 4]' }],
    moves: [
      { at: 'crates/render/src/scene/pool.rs:97', how: 'field', to: 'render.scene.pool.Entry', by: 'scan', text: 'record: SourceRecord,' },
      { at: 'crates/render/src/scene/pool.rs:99', how: 'field', to: 'render.scene.pool.Entry', by: 'scan', text: 'last: SourceRecord,' },
      { at: 'crates/render/src/scene/pool.rs:537', how: 'return', by: 'scan', text: 'pub fn record(&self) -> SourceRecord {' },
      { at: 'crates/render/src/scene/pool.rs:560', how: 'parameter', by: 'scan', text: 'fn put(&mut self, r: SourceRecord) {' },
      { at: 'crates/render/src/upload.rs:61', how: 'parameter', by: 'scan', text: 'fn upload(r: &SourceRecord) {' },
      { at: 'crates/render/src/upload.rs:70', how: 'cast', by: 'scan', text: 'p as *const SourceRecord' },
      { at: 'crates/render/src/wire.rs:12', how: 'transmute', to: 'render.wire.Packed', by: 'scan', text: 'transmute::<SourceRecord, Packed>(r)' },
      { at: 'crates/render/src/wire.rs:30', how: 'from-impl', to: 'render.gone.Missing', by: 'scan', text: 'impl From<SourceRecord> for Missing {' },
    ],
    state: 'unreviewed',
    updated: '2026-10-11',
  },
  {
    id: 'render.scene.pool.Entry',
    name: 'Entry',
    where: 'crates/render/src/scene/pool.rs:96',
    lang: 'rust',
    rule: 'unfixed',
    derives: ['Clone'],
    fields: [{ name: 'record', type: 'SourceRecord', unknown: true }, { name: 'at', type: 'u64' }],
    state: 'unreviewed',
  },
  {
    id: 'render.wire.Packed',
    name: 'Packed',
    lang: 'rust',
    rule: 'c',
    fields: [{ name: 'words', type: '[u32; 8]' }],
  },
  {
    id: 'render.shaders.lines.Words',
    name: 'Words',
    lang: 'wgsl',
    rule: 'wgsl',
    fields: [{ name: 'count', type: 'u32' }, { name: 'words', type: 'array<u32>', unknown: true }],
  },
  { id: 'render.shaders.lines.LinesView', name: 'LinesView', lang: 'wgsl', rule: 'wgsl', fields: [{ name: 'origin', type: 'vec4<f32>' }] },
  { id: 'sim.Particle', group: 'examples', rule: 'c', fields: [{ name: 'flags', type: 'u8' }, { name: 'id', type: 'u64' }] },
];
const byId = new Map(ledger.map((entry) => [entry.id, entry]));
const tools = { byId, back: namedBy(ledger) };

test('a group is the system or module part of an id, and a system is read from a path the same way', () => {
  assert.equal(groupOf(ledger[0]), 'render.scene.layout');
  assert.equal(nameOf(ledger[0]), 'SourceRecord');
  assert.equal(nameOf({ id: 'a.b.Thing' }), 'Thing');
  assert.equal(groupOf({ id: 'Lonely' }), NO_GROUP);
  assert.equal(groupOf(ledger[5]), 'examples');
  // The scan's own example: crates/render/src/mesh.rs and Mesh give render.mesh.Mesh.
  assert.equal(systemOf('crates/render/src/mesh.rs:12'), 'render.mesh');
  assert.equal(systemOf('crates/render/src/scene/mod.rs:3'), 'render.scene');
  assert.equal(systemOf('crates/render/shaders/scene/lines.wgsl:40'), 'render.shaders.scene.lines');
  assert.equal(systemOf('tools\\dandori\\ledger\\check.mbt:9'), 'tools.dandori.ledger.check');
  assert.equal(systemOf(''), NO_GROUP);
  // A site in the struct's own file is in the struct's own group.
  assert.equal(systemOf(ledger[0].where), groupOf(ledger[0]));
  assert.equal(commonPrefix(['render.scene.pool', 'render.scene', 'render.wire']), 'render.');
  assert.equal(commonPrefix(['render.scene.pool', 'render.scene.layout']), 'render.scene.');
  assert.equal(commonPrefix(['render.scene', 'sim.step']), '');
  assert.equal(commonPrefix(['render.scene']), '');
});

test('the index lists every struct once, by group and then by name, with the page’s own group last', () => {
  const index = indexOf(ledger);
  assert.deepEqual(index.groups.map((g) => `${g.label} ${g.count}`), ['scene.layout 1', 'scene.pool 1', 'shaders.lines 2', 'wire 1', 'examples 1']);
  assert.equal(index.prefix, 'render.');
  assert.deepEqual(index.items.map((item) => item.name), ['SourceRecord', 'Entry', 'LinesView', 'Words', 'Packed', 'Particle']);
  assert.deepEqual(index.items.map((item) => item.drawn), [true, false, true, false, true, true]);
  assert.deepEqual(indexOf([]), { items: [], groups: [], prefix: '' });
});

test('search: by name, by group, by a field’s name or type, and every word must fit', () => {
  const index = indexOf(ledger);
  const names = (typed) => search(index, typed).rows.filter((row) => row.kind === 'option').map((row) => row.item.name);
  assert.deepEqual(names(''), ['SourceRecord', 'Entry', 'LinesView', 'Words', 'Packed', 'Particle']);
  assert.deepEqual(names('pack'), ['Packed']);
  assert.deepEqual(names('ENTRY'), ['Entry']);
  // A group, part of a group, a rule and a language.
  assert.deepEqual(names('shaders.lines'), ['LinesView', 'Words']);
  assert.deepEqual(names('examples'), ['Particle']);
  assert.deepEqual(names('unfixed'), ['Entry']);
  assert.deepEqual(names('wgsl'), ['LinesView', 'Words']);
  // What the source says about the layout: a derive, a repr item.
  assert.deepEqual(names('pod'), ['SourceRecord']);
  assert.deepEqual(names('align(16)'), ['SourceRecord']);
  assert.deepEqual(names('clone'), ['SourceRecord', 'Entry']);
  // A field's name, and a field's type as the source writes it.
  assert.deepEqual(names('sphere'), ['SourceRecord']);
  assert.deepEqual(names('u64'), ['Entry', 'Particle']);
  assert.deepEqual(names('array<u32>'), ['Words']);
  // Two words: both must fit.
  assert.deepEqual(names('wgsl origin'), ['LinesView']);
  assert.deepEqual(names('scene u64'), ['Entry']);
  assert.deepEqual(names('nothing-is-called-this'), []);
  // In a group, a name that starts with the word comes before a field that holds it.
  assert.deepEqual(names('words'), ['Words', 'Packed']);
  assert.deepEqual(names('lines'), ['LinesView', 'Words']);
  // The row says which field matched when the name and the group did not.
  const why = search(index, 'sphere').rows.find((row) => row.kind === 'option').why;
  assert.equal(why, 'sphere: [f32; 4]');
  assert.equal(search(index, 'pack').rows.find((row) => row.kind === 'option').why, '');
});

test('the groups are a table of contents: each says how many fit and which row it starts on', () => {
  const index = indexOf(ledger);
  const all = search(index, '');
  assert.deepEqual(all.rows.map((row) => (row.kind === 'group' ? `# ${row.label} ${row.count}` : row.item.name)), [
    '# scene.layout 1', 'SourceRecord', '# scene.pool 1', 'Entry', '# shaders.lines 2', 'LinesView', 'Words', '# wire 1', 'Packed', '# examples 1', 'Particle',
  ]);
  assert.equal(all.options, 6);
  for (const g of all.groups) assert.equal(all.rows[g.row].group, g.group);
  const some = search(index, 'u64');
  assert.deepEqual(some.groups.map((g) => `${g.label} ${g.count}/${g.total} ${g.row}`), ['scene.layout 0/1 -1', 'scene.pool 1/1 0', 'shaders.lines 0/2 -1', 'wire 0/1 -1', 'examples 1/1 2']);
  assert.equal(some.options, 2);
  assert.equal(some.rows.length, 4);
});

test('with several hundred structs only the rows in the box are drawn, and keys skip the headings', () => {
  const many = [];
  for (let n = 0; n < 600; n++) many.push({ id: `sys${String(n % 40).padStart(2, '0')}.Thing${n}`, rule: 'c', fields: [{ name: 'a', type: 'u32' }] });
  const index = indexOf(many);
  const { rows, options } = search(index, '');
  assert.equal(options, 600);
  assert.equal(rows.length, 640);
  // A box 306 pixels high over rows 34 high: nine rows and four spare either side.
  assert.deepEqual(rowsInView(0, 306, 34, rows.length), [0, 13]);
  assert.deepEqual(rowsInView(34 * 300, 306, 34, rows.length), [296, 313]);
  assert.deepEqual(rowsInView(34 * 640, 306, 34, rows.length), [636, 640]);
  assert.deepEqual(rowsInView(0, 306, 34, 3), [0, 3]);
  assert.deepEqual(rowsInView(0, 306, 34, 0), [0, 0]);
  for (const top of [0, 1000, 9000, 21000]) {
    const [start, end] = rowsInView(top, 306, 34, rows.length);
    assert.ok(end - start <= 18, `${end - start} rows drawn at ${top}`);
  }
  // Arrow keys: from nothing to the first struct, over a heading, and no further than the last.
  assert.equal(rows[0].kind, 'group');
  assert.equal(stepRow(rows, -1, 1), 1);
  assert.equal(stepRow(rows, -1, -1), 639);
  const lastOfFirstGroup = index.groups[0].count;
  assert.equal(rows[lastOfFirstGroup + 1].kind, 'group');
  assert.equal(stepRow(rows, lastOfFirstGroup, 1), lastOfFirstGroup + 2);
  assert.equal(stepRow(rows, lastOfFirstGroup + 2, -1), lastOfFirstGroup);
  assert.equal(stepRow(rows, 639, 1), 639);
  assert.equal(stepRow(rows, 1, -1), 1);
  assert.equal(stepRow([], -1, 1), -1);
  // Page Down and Page Up: the first struct of the next group, of this group, of the one before.
  const second = lastOfFirstGroup + 2;
  assert.equal(stepGroup(rows, -1, 1), 1);
  assert.equal(stepGroup(rows, 1, 1), second);
  assert.equal(stepGroup(rows, 3, 1), second);
  assert.equal(stepGroup(rows, second + 3, -1), second);
  assert.equal(stepGroup(rows, second, -1), 1);
  assert.equal(stepGroup(rows, 1, -1), 1);
  assert.equal(stepGroup(rows, 639, 1), 639);
  assert.equal(rows[stepGroup(rows, 639, -1) - 1].kind, 'group');
  // Searching 600 structs is quick enough to do on every key.
  const began = performance.now();
  for (let n = 0; n < 50; n++) search(index, `thing${n} u32`);
  assert.ok(performance.now() - began < 1000);
});

test('the places where a name appears: built from the recorded moves and nothing else', () => {
  const follow = followOf(ledger[0], tools);
  assert.equal(follow.count, 8);
  // Places that name a second struct: one item per struct and kind, every place under it.
  assert.deepEqual(follow.links.map((l) => `${l.words} ${l.other} known=${l.known} places=${l.places.map((p) => p.at.split('/').pop()).join(',')}`), [
    'appears in the type of a field of render.scene.pool.Entry known=true places=pool.rs:97,pool.rs:99',
    'transmute to render.wire.Packed known=true places=wire.rs:12',
    // A struct the ledger does not have is named and cannot be added.
    'impl From, for render.gone.Missing known=false places=wire.rs:30',
  ]);
  assert.deepEqual(follow.links[0].places[0], { at: 'crates/render/src/scene/pool.rs:97', how: 'field', text: 'record: SourceRecord,', note: '' });
  // A cast names no second struct: it is a place of its own.
  assert.deepEqual(follow.sites.map((p) => `${p.how} ${p.at}`), ['cast crates/render/src/upload.rs:70']);
  // Signatures by system, the systems by name.
  assert.deepEqual(follow.signatures.map((g) => `${g.system}: ${g.summary}`), ['render.scene.pool: 1 parameter, 1 return', 'render.upload: 1 parameter']);
  assert.deepEqual(follow.signatures[0].places.map((p) => p.at), ['crates/render/src/scene/pool.rs:537', 'crates/render/src/scene/pool.rs:560']);
  // Every recorded move is in exactly one of the three lists.
  const listed = follow.links.reduce((n, l) => n + l.places.length, 0) + follow.sites.length + follow.signatures.reduce((n, g) => n + g.places.length, 0);
  assert.equal(listed, ledger[0].moves.length);
});

test('a `to` is stored once and read from both ends, so a chain can be walked either way', () => {
  // Entry records no move of its own. SourceRecord's field places name it.
  const entry = followOf(ledger[1], tools);
  assert.deepEqual(entry.links.map((l) => `${l.direction} ${l.words} ${l.other} ${l.places.length}`), ['in has a field whose type names render.scene.layout.SourceRecord 2']);
  assert.deepEqual(entry.sites, []);
  assert.deepEqual(entry.signatures, []);
  assert.deepEqual(followOf(ledger[2], tools).links.map((l) => `${l.words} ${l.other}`), ['transmute from render.scene.layout.SourceRecord']);
  // Walking: SourceRecord -> Entry and SourceRecord -> Packed, each one step.
  const reachable = followOf(ledger[0], tools).links.filter((l) => l.known).map((l) => l.other);
  assert.deepEqual(reachable, ['render.scene.pool.Entry', 'render.wire.Packed']);
  assert.equal(linkWords('cast', 'out'), 'cast, also names');
  assert.equal(linkWords('cast', 'in'), 'cast, named with');
});

test('the picker says once which folder was scanned and what the places leave out', () => {
  const scanned = [
    { id: 'a.X', lang: 'rust', where: 'crates/render/src/scene/pool.rs:97', fields: [] },
    { id: 'a.Y', lang: 'wgsl', where: 'crates/render/shaders/slug.wgsl:3', fields: [] },
    // Typed into the page, not scanned: it does not widen or narrow the folder.
    { id: 'examples.Z', where: 'elsewhere/z.rs:1', fields: [] },
  ];
  assert.equal(scannedFolder(scanned), 'crates/render');
  assert.equal(scannedFolder([{ id: 'examples.Z', fields: [] }]), '');
  assert.equal(scannedFolder([scanned[0], { id: 'b.Q', lang: 'c', where: 'include/q.h:2', fields: [] }]), '');
  const note = scopeNote('crates/render');
  assert.ok(note.startsWith('Scanned folder: crates/render. '));
  for (const part of ['names no type', 'generic', 'macro', 'trait object', 'type alias', 'outside the scanned folder', 'does not mean the struct goes nowhere', 'listed under both']) {
    assert.ok(note.includes(part), part);
  }
  assert.equal(scopeNote('').startsWith('The places under a struct'), true);
  // The element puts it on the page.
  const source = readFileSync(resolve('src', 'components', 'dd', 'dd-struct-picker.js'), 'utf8');
  assert.ok(source.includes('scopeNote(scanned)'));
});

test('an entry with no recorded place shows nothing, and no wording claims an order in time', () => {
  assert.equal(followOf(ledger[4], tools), null);
  assert.equal(followOf(ledger[5], tools), null);
  assert.equal(followOf({ id: 'x.Y', fields: [], moves: [] }, tools), null);
  const words = ['field', 'transmute', 'from-impl', 'cast', 'bytemuck', 'parameter', 'return', 'binding', 'extern-c', 'copy'].flatMap((how) => [linkWords(how, 'out'), linkWords(how, 'in')]);
  for (const text of words) assert.equal(/→|->|=>|\bthen\b|\bnext\b|\bafter\b|\bbefore\b|\bflows?\b|\blifetime\b|\blives\b/i.test(text), false, text);
  // The view itself: no arrow is drawn between structs or places, and it says what the list is.
  const source = readFileSync(resolve('src', 'components', 'dd', 'dd-struct-picker.js'), 'utf8');
  const drawn = source.slice(source.indexOf('  sites(item) {'));
  assert.equal(/→|->|&rarr;|<svg|<path/.test(drawn), false);
  assert.match(drawn, /where the type’s name appears, found by syntax\. Not a lifetime analysis\./);
});

test('honest layouts: an entry whose layout is not fixed, or with an unknown type, gets no numbers', () => {
  assert.deepEqual(drawBlocks(ledger[0]), []);
  assert.equal(drawBlocks(ledger[1]).length, 1);
  assert.match(drawBlocks(ledger[1])[0], /does not fix this struct’s layout/);
  assert.deepEqual(drawBlocks(ledger[3]), ['the layout code does not know the type of words: array<u32>']);
  assert.equal(drawBlocks({ id: 'x', fields: [] }).length, 1);
  assert.deepEqual(ledger.map(mayDraw), [true, false, true, false, true, true]);

  // The layout code is not asked about an entry that may not be drawn.
  const never = () => assert.fail('the layout code was asked about an entry that is not drawn');
  const unfixed = bodyOf(ledger[1], never);
  assert.equal(unfixed.kind, 'fields');
  assert.match(unfixed.why, /compiler may reorder its fields/);
  // Under `unfixed` the scan marks types as rule c would see them; that says nothing here.
  assert.deepEqual(unfixed.fields, [{ name: 'record', type: 'SourceRecord', unknown: false }, { name: 'at', type: 'u64', unknown: false }]);
  const unknown = bodyOf(ledger[3], never);
  assert.equal(unknown.kind, 'fields');
  assert.equal(unknown.why, 'the layout code does not know the type of 1 of 2 fields');
  assert.deepEqual(unknown.fields.map((f) => f.unknown), [false, true]);
  for (const body of [unfixed, unknown]) {
    assert.deepEqual(Object.keys(body).sort(), ['fields', 'kind', 'why']);
    for (const field of body.fields) assert.deepEqual(Object.keys(field).sort(), ['name', 'type', 'unknown']);
    assert.equal(/\d+ bytes|offset|size \d/.test(JSON.stringify(body)), false);
  }

  // An entry that may be drawn gets its numbers from the layout code, align included.
  const cards = bodyOf(ledger[0], (struct) => layoutsOf(kernel, struct));
  assert.equal(cards.kind, 'cards');
  assert.deepEqual(cards.struct, { id: 'render.scene.layout.SourceRecord', rule: 'c', fields: [{ name: 'counts', type: '[u32; 4]' }, { name: 'sphere', type: '[f32; 4]' }], align: 16 });
  assert.equal(cards.layouts.declared.align, 16);
  assert.equal(cards.layouts.declared.size, 32);
  // While the layout code loads, nothing; without it, or when it refuses, fields and why.
  assert.deepEqual(bodyOf(ledger[0], () => undefined), { kind: 'wait' });
  assert.equal(bodyOf(ledger[0], () => null).kind, 'fields');
  const refused = bodyOf({ id: 'x.Y', rule: 'c', fields: [{ name: 'a', type: 'long' }] }, (struct) => layoutsOf(kernel, struct));
  assert.equal(refused.kind, 'fields');
  assert.match(refused.why, /^the layout code refused it: .*`long`/);
});

test('what the page keeps of an entry, and the line of source facts under its name', () => {
  const kept = slim({ ...ledger[0], anchor: 'pub struct SourceRecord {', scanner: 'ast-grep' });
  assert.deepEqual(Object.keys(kept), ['id', 'name', 'where', 'lang', 'rule', 'repr', 'derives', 'align', 'state', 'date', 'fields', 'moves']);
  assert.deepEqual(kept.moves[0], { at: 'crates/render/src/scene/pool.rs:97', how: 'field', to: 'render.scene.pool.Entry', text: 'record: SourceRecord,' });
  assert.deepEqual(slim(ledger[3]).fields[1], { name: 'words', type: 'array<u32>', unknown: true });
  assert.equal('moves' in slim(ledger[4]), false);
  assert.equal(sourceLine(ledger[0]), 'rust · repr(C, align(16)) · derive(Clone, Copy, Pod, Zeroable) · unreviewed');
  assert.equal(sourceLine({ id: 'x' }), '');
  // Slimming changes nothing the picker reads.
  assert.deepEqual(followOf(slim(ledger[0]), tools), followOf(ledger[0], tools));
  assert.deepEqual(drawBlocks(slim(ledger[3])), drawBlocks(ledger[3]));
});

test('a struct in the picker lays itself out by its own width with the rules of a narrow page', () => {
  const css = readFileSync(resolve('src', 'components', 'dd', 'dd-components.css'), 'utf8').replace(/\r\n/g, '\n');
  const block = (opening) => {
    const from = css.indexOf(opening);
    assert.ok(from >= 0, opening);
    const end = css.indexOf('\n}\n', from);
    return css.slice(from + opening.length, end).split('\n').filter((line) => line.trim() && !/\.dd-pk-/.test(line.split('{')[0]));
  };
  assert.deepEqual(block('@container dd-pk-item (max-width: 560px) {'), block('@media (max-width: 560px) {'));
});

// The checks below need files that only the dandori-skills repository has.
const data = resolve('..', '..', 'trials', 'showcase', 'g', 'data', 'dataflow.json');
const standalone = resolve('..', '..', 'trials', 'showcase', 'g', 'index.html');
const page = resolve('src', 'content', 'docs', 'showcase', 'struct-layout.mdx');

test('on the real scan: every struct is listed, and exactly the ones that may be drawn get a layout', { skip: !existsSync(data) && 'trials/showcase/g/data is not here' }, () => {
  const entries = JSON.parse(readFileSync(data, 'utf8'));
  const index = indexOf(entries);
  assert.equal(index.items.length, entries.length);
  assert.equal(new Set(index.items.map((item) => item.id)).size, entries.length);
  assert.equal(search(index, '').options, entries.length);
  let cards = 0;
  for (const entry of entries) {
    const body = bodyOf(entry, (struct) => layoutsOf(kernel, struct));
    if (entry.rule === 'unfixed' || entry.fields.some((field) => field.unknown)) assert.equal(body.kind, 'fields', entry.id);
    else {
      // The scan's own verdict and the layout code agree: nothing it calls drawable is refused.
      assert.equal(body.kind, 'cards', `${entry.id}: ${body.why}`);
      cards++;
    }
  }
  assert.equal(cards, entries.filter(mayDraw).length);
  assert.ok(cards > 0 && cards < entries.length);
  // Every `to` the scan wrote can be followed, and from the other end too.
  const all = { byId: new Map(entries.map((entry) => [entry.id, entry])), back: namedBy(entries) };
  let out = 0;
  let back = 0;
  for (const entry of entries) {
    const follow = followOf(entry, all);
    if ((entry.moves ?? []).length === 0 && !all.back.has(entry.id)) assert.equal(follow, null, entry.id);
    for (const link of follow?.links ?? []) {
      assert.equal(link.known, true, `${entry.id} -> ${link.other}`);
      if (link.direction === 'out') out += link.places.length;
      else back += link.places.length;
    }
  }
  assert.equal(out, back);
  assert.ok(out > 0);
});

test('the standalone picker holds the current styles, the scan data and the examples, and fetches nothing', { skip: (!existsSync(standalone) || !existsSync(page)) && 'trials/showcase/g is not here' }, () => {
  const html = readFileSync(standalone, 'utf8').replace(/\r\n/g, '\n');
  const lf = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  assert.ok(html.includes(lf(resolve('src', 'components', 'dd', 'dd-components.css'))), 'run node trials/showcase/g/build.mjs');
  const tokens = /\/\* dd-tokens:start[\s\S]*?dd-tokens:end \*\//.exec(lf(resolve('src', 'styles', 'dandori.css')))[0];
  assert.ok(html.includes(tokens), 'run node trials/showcase/g/build.mjs');
  const held = JSON.parse(/<script type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
  const scanned = JSON.parse(lf(data));
  assert.deepEqual(held.filter((entry) => entry.group !== 'examples'), scanned.map(slim), 'run node trials/showcase/g/build.mjs');
  const examples = JSON.parse(/export const structs = (\[[\s\S]*?\n\]);/.exec(lf(page))[1]);
  assert.deepEqual(held.filter((entry) => entry.group === 'examples').map((entry) => entry.id), examples.map((struct) => struct.id));
  assert.equal(/<(script|link|img)[^>]+(src|href)=/.test(html), false, 'the page must fetch nothing');
});
