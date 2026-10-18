// <dd-struct-showcase>: the struct layout showcase, assembled from <dd-card>, <dd-bytes>,
// <dd-delta> and <dd-fields>. Hand it one struct as data. For several structs use
// <dd-struct-picker>, which puts one of these in view per struct chosen. (Given a list,
// this element still draws a row of one button per struct; only the older standalone
// page, trials/showcase/f, uses that.)
//
//   <dd-struct-showcase
//     data-structs='[{ "id": "render.Mesh", "rule": "c", "fields": [{ "name": "visible", "type": "bool" }] }]'
//     commit="337baa3" date="2026-10-11"></dd-struct-showcase>
//
// Small, it opens on the result: the size as declared, the size reordered, and the two
// strips. Pointing at a byte says what it is, in the card's top line. A click in a strip's
// card expands that card in place, and the figure above makes room:
//
//   declared order   the strip, bigger, and under it the list: every field's name, type,
//                    offset, size and alignment and every run of padding at once. The
//                    list is the editor: rename, retype, move, remove, add, reset, rule,
//                    pack.
//   reordered        the same for the order the layout code proposes, where each field
//                    was and where it is now, what that saves, and Use this order.
//
// One card is expanded at a time. Expanded, each name and each number is in one place:
// the list. The strip carries a letter and a colour per field, which is what joins a
// row of the list to its bytes, and no name, offset or size. The strips here have no ruler
// marks, so no byte index stands beside an offset column. While the declared card is
// expanded the small reordered card says its size, because the figure above is gone.
//
// The commit and date stand under the cards while the struct is as the page gave it.
// After an edit that line says "edited" and offers Reset, because the commit no longer
// describes what is drawn.
//
// Numbers: `data-layouts` holds layouts worked out when the page was built, so the
// element draws at once (the Astro wrapper fills it in). Editing needs the layout code in
// the browser; see dd-engine.js. Attribute `engine` is the URL of the built module.
// Without an engine the page still shows the numbers it was given, and editing is off.
//
// Event `dd-showcase-change` (bubbles, detail { struct, declared, reordered, error })
// fires after every edit.

import './dd-card.js';
import './dd-bytes.js';
import './dd-delta.js';
import './dd-fields.js';
import { animateBox } from './dd-card.js';
import { getEngine } from './dd-engine.js';
import { PACKS, RULES, annotate, annotateStruct, describe, edit, keysOf, layoutsOf, paddingNote } from './dd-annotate.js';

const Base = globalThis.HTMLElement ?? class {};

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name === 'class') node.className = value;
    else if (name === 'text') node.textContent = value;
    else if (value === true) node.setAttribute(name, '');
    else if (value !== false && value != null) node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}

const copy = (value) => JSON.parse(JSON.stringify(value));

export class DdStructShowcase extends Base {
  connectedCallback() {
    if (this.built) return;
    let structs;
    try {
      structs = JSON.parse(this.dataset.structs ?? '[]');
      this.given = this.dataset.layouts ? JSON.parse(this.dataset.layouts) : [];
    } catch (error) {
      this.dataset.failed = String(error);
      return;
    }
    if (!Array.isArray(structs)) structs = [structs];
    if (structs.length === 0) return;
    this.structs = structs;
    this.work = copy(structs);
    this.at = 0;
    this.valid = null;
    this.error = null;
    this.engine = null;
    this.built = true;
    // With layouts from the build the element draws now. Without them it keeps whatever
    // the page put inside it until the layout code has loaded.
    if (this.given[0]?.declared) {
      this.build();
      this.show();
    }
    getEngine(this.getAttribute('engine') ?? undefined).then(
      (engine) => {
        this.engine = engine;
        if (!this.picker) this.build();
        this.show();
        this.dataset.engine = 'ready';
      },
      (error) => {
        this.dataset.engine = 'none';
        if (this.note) this.note.textContent = `editing is off: ${error?.message ?? error}`;
      },
    );
  }

  build() {
    const chips = (label, cls) => h('div', { class: `dd-chips ${cls}`, role: 'group', 'aria-label': label });

    this.picker = chips('Struct', 'dd-sc-picker');
    this.structs.forEach((struct, index) => {
      this.picker.append(h('button', { type: 'button', class: 'dd-chip', 'data-struct': String(index), text: struct.id ?? `struct ${index + 1}` }));
    });
    this.picker.hidden = this.structs.length < 2;

    this.headline = h('dd-delta', { class: 'dd-sc-head', unit: 'bytes' });
    this.problem = h('p', { class: 'dd-sc-err', role: 'status' });

    // The struct as declared.
    this.declaredTop = h('dd-delta', { unit: 'bytes' });
    this.rules = chips('Layout rule', 'dd-sc-rules');
    for (const rule of RULES) this.rules.append(h('button', { type: 'button', class: 'dd-chip dd-chip-mono', 'data-rule': rule, text: rule }));
    this.packs = chips('pack', 'dd-sc-packs');
    this.packs.append(h('span', { class: 'dd-chips-label', text: 'pack' }));
    for (const pack of PACKS) this.packs.append(h('button', { type: 'button', class: 'dd-chip dd-chip-mono', 'data-pack': String(pack), text: pack ? String(pack) : 'none' }));
    this.declaredBytes = h('dd-bytes', { mode: 'small', 'no-ruler': true });
    this.declaredList = h('dd-fields');
    this.declared = h(
      'dd-card',
      { label: 'declared order', class: 'dd-sc-card', 'data-view': 'declared' },
      h('div', { class: 'dd-card-tag' }, h('span', { text: 'declared order' }), (this.declaredRead = h('span', { class: 'dd-sc-read', 'data-dd-small': true }))),
      h('div', { 'data-dd-large': true, class: 'dd-sc-top' }, this.declaredTop, this.rules, this.packs),
      this.problem,
      h('div', { class: 'dd-sc-body' }, this.declaredBytes, h('div', { 'data-dd-large': true, class: 'dd-sc-list' }, this.declaredList)),
    );

    // The order the layout code proposes.
    this.reorderedTop = h('dd-delta', { unit: 'bytes' });
    this.use = h('button', { type: 'button', class: 'dd-chip dd-sc-use', text: 'Use this order' });
    this.reorderedBytes = h('dd-bytes', { mode: 'small', 'no-ruler': true });
    this.reorderedList = h('dd-fields', { compare: true });
    this.reordered = h(
      'dd-card',
      { label: 'reordered', class: 'dd-sc-card', 'data-view': 'reordered' },
      h(
        'div',
        { class: 'dd-card-tag' },
        h('span', { text: 'reordered' }),
        (this.reorderedSize = h('span', { class: 'dd-sc-size', hidden: true })),
        (this.reorderedRead = h('span', { class: 'dd-sc-read', 'data-dd-small': true })),
      ),
      h('div', { 'data-dd-large': true, class: 'dd-sc-top' }, this.reorderedTop, this.use),
      h('div', { class: 'dd-sc-body' }, this.reorderedBytes, h('div', { 'data-dd-large': true, class: 'dd-sc-list' }, this.reorderedList)),
    );

    this.note = h('span', { class: 'dd-sc-note' });
    this.taken = [this.getAttribute('commit') && `commit ${this.getAttribute('commit')}`, this.getAttribute('date')].filter(Boolean).join(' · ');
    this.stamp = h('span', { text: this.taken });
    this.reset = h('button', { type: 'button', class: 'dd-chip dd-sc-reset', hidden: true, text: 'Reset' });
    const foot = h('div', { class: 'dd-sc-foot' }, this.stamp, this.reset, this.note);

    this.replaceChildren(h('div', { class: 'dd-sc' }, this.picker, this.headline, this.declared, this.reordered, foot));

    this.picker.addEventListener('click', (event) => {
      const chip = event.target.closest('button[data-struct]');
      if (!chip) return;
      this.at = Number(chip.dataset.struct);
      this.show();
    });
    this.rules.addEventListener('click', (event) => {
      const chip = event.target.closest('button[data-rule]');
      if (chip) this.change({ op: 'rule', value: chip.dataset.rule });
    });
    this.packs.addEventListener('click', (event) => {
      const chip = event.target.closest('button[data-pack]');
      if (chip) this.change({ op: 'pack', value: Number(chip.dataset.pack) });
    });
    this.use.addEventListener('click', () => {
      const order = this.valid?.declared.reordered?.order;
      if (order && !this.error) this.change({ op: 'order', value: order });
    });
    this.reset.addEventListener('click', () => {
      const back = this.reset.contains(document.activeElement);
      this.change({ op: 'reset' });
      if (back) this.declared.focus({ preventScroll: true });
    });
    this.addEventListener('dd-fields-edit', (event) => this.change(event.detail));
    this.addEventListener('dd-card-toggle', (event) => this.toggled(event));
    for (const name of ['dd-bytes-hover', 'dd-fields-hover']) {
      this.addEventListener(name, (event) => {
        const card = event.target.closest('dd-card');
        if (!card) return;
        if (!card.open) {
          // Small, the card's top line says what the pointer is on.
          const read = card === this.declared ? this.declaredRead : this.reorderedRead;
          read.textContent = event.detail.text ?? '';
          return;
        }
        card.querySelector('dd-bytes').highlight(event.detail.id);
        card.querySelector('dd-fields').highlight(event.detail.id);
      });
    }
  }

  // One card is expanded at a time; the figure above makes room for it.
  toggled(event) {
    const card = event.target;
    if (event.detail.open) {
      for (const other of [this.declared, this.reordered]) if (other !== card && other.open) other.set(false, { focus: false });
    }
    const open = this.declared.open || this.reordered.open;
    this.declaredBytes.setAttribute('mode', this.declared.open ? 'large' : 'small');
    this.reorderedBytes.setAttribute('mode', this.reordered.open ? 'large' : 'small');
    this.declaredRead.textContent = '';
    this.reorderedRead.textContent = '';
    // The figure above the cards is gone while a card is expanded. The expanded declared
    // card has the declared size, so the small reordered card says its own.
    this.reorderedSize.hidden = !this.declared.open;
    this.reset.hidden = this.untouched || this.declared.open;
    if (open !== this.headline.hasAttribute('data-gone')) {
      animateBox(this.headline, () => this.headline.toggleAttribute('data-gone', open));
      this.headline.setAttribute('aria-hidden', String(open));
    }
  }

  change(detail) {
    if (!this.engine) return;
    this.work[this.at] = detail.op === 'reset' ? copy(this.structs[this.at]) : edit(this.work[this.at], detail);
    this.show();
    this.dispatchEvent(
      new CustomEvent('dd-showcase-change', {
        bubbles: true,
        detail: { struct: this.work[this.at], declared: this.valid?.declared, reordered: this.valid?.reordered, error: this.error },
      }),
    );
  }

  // Lays the working struct out and fills every part in.
  show() {
    const struct = this.work[this.at];
    const untouched = JSON.stringify(struct) === JSON.stringify(this.structs[this.at]);
    let result;
    if (this.engine) result = layoutsOf(this.engine, struct);
    else if (untouched && this.given[this.at]?.declared) result = this.given[this.at];
    else result = null;
    if (!result) return;
    if (result.error) {
      this.error = result.error;
    } else {
      this.error = null;
      this.valid = result;
    }
    const valid = this.valid;
    const editable = Boolean(this.engine);

    for (const chip of this.picker.querySelectorAll('button')) chip.setAttribute('aria-pressed', String(Number(chip.dataset.struct) === this.at));
    for (const chip of this.rules.querySelectorAll('button')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.rule === struct.rule));
      chip.disabled = !editable;
    }
    for (const chip of this.packs.querySelectorAll('button')) {
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.pack) === (struct.pack ?? 0)));
      chip.disabled = !editable;
    }
    this.packs.hidden = struct.rule !== 'c';

    this.problem.replaceChildren();
    if (this.error) {
      this.problem.append(h('span', { text: this.error }));
      if (valid) this.problem.append(h('span', { class: 'dd-sc-badge', text: 'last valid layout' }));
    }
    this.toggleAttribute('data-stale', Boolean(this.error));
    this.declaredList.toggleAttribute('editable', editable);
    // The expanded declared card has Reset in its list, so the one down here steps aside.
    this.untouched = untouched;
    this.stamp.textContent = untouched ? this.taken : 'edited';
    this.reset.hidden = untouched || this.declared.open;
    if (!valid) {
      this.declaredList.rows = annotateStruct(struct);
      return;
    }

    const { declared, reordered } = valid;
    const rule = declared.rule + (struct.pack && !this.error ? `, pack ${struct.pack}` : '');
    this.headline.setAttribute('from', String(declared.size));
    if (reordered) this.headline.setAttribute('to', String(reordered.size));
    else this.headline.removeAttribute('to');
    this.headline.setAttribute('note', `${paddingNote(declared)} · rule ${rule}`);

    this.declaredTop.setAttribute('from', String(declared.size));
    this.declaredTop.setAttribute('note', `align ${declared.align} · ${declared.wasted} bytes of padding`);
    this.declaredBytes.keys = undefined;
    this.declaredBytes.layout = declared;
    this.declared.setAttribute('description', describe(declared));
    this.declaredList.rows = this.error ? annotateStruct(struct) : annotate(declared);

    if (!reordered) {
      if (this.reordered.open) {
        this.reordered.set(false, { focus: false });
        this.declared.focus({ preventScroll: true });
      }
      this.reordered.hidden = true;
      return;
    }
    this.reordered.hidden = false;
    const keys = keysOf(declared, reordered);
    this.reorderedTop.setAttribute('from', String(declared.size));
    this.reorderedTop.setAttribute('to', String(reordered.size));
    this.reorderedTop.setAttribute(
      'note',
      `saves ${declared.reordered.recoverable} bytes · align ${reordered.align} · ${reordered.wasted} bytes of padding`,
    );
    this.use.disabled = !editable || Boolean(this.error);
    this.reorderedBytes.keys = keys;
    this.reorderedBytes.layout = reordered;
    this.reordered.setAttribute('description', describe(reordered));
    this.reorderedSize.textContent = `${reordered.size} bytes`;
    this.reorderedList.rows = annotate(reordered, { keys, was: declared });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dd-struct-showcase')) {
  customElements.define('dd-struct-showcase', DdStructShowcase);
}
