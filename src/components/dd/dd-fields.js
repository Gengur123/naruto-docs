// <dd-fields>: the list beside a byte strip. One row per field and one per run of padding,
// in byte order: the field's letter and colour, name, type, offset, size and alignment;
// for padding its offset, its size and what forces it, when the numbers show that.
// What each cell says is listCells() in dd-annotate.js.
//
//   <dd-fields data-layout='{ ...what layout_json answered... }'></dd-fields>
//
// With the attribute `editable` the same rows are the editor: the name and the type are
// inputs, and each row has move up, move down and remove; under the list are Add field
// and Reset. The element computes nothing. Every edit fires `dd-fields-edit` (bubbles,
// detail { op, index, value?, by? }, the shape edit() in dd-annotate.js takes; Reset is
// { op: 'reset' }) and the owner lays the struct out again and sets `.rows`.
//
// With the attribute `compare` (rows made by annotate(layout, { keys, was })) the type
// column gives way to an order column, and the order and offset cells show where each
// field was and where it is now.
//
// From script: `.rows` (annotate(...) from dd-annotate.js), `.highlight(id)`. Pointing at
// a row fires `dd-fields-hover` (bubbles, detail { id }).

import { annotate, listCells } from './dd-annotate.js';

const Base = globalThis.HTMLElement ?? class {};

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = String(text);
  return node;
};

export class DdFields extends Base {
  static observedAttributes = ['data-layout', 'editable', 'compare'];

  connectedCallback() {
    if (!this.wired) {
      this.wired = true;
      this.addEventListener('input', (event) => this.typed(event));
      this.addEventListener('click', (event) => this.pressed(event));
      this.addEventListener('pointerover', (event) => {
        const row = event.target.closest?.('tr[data-row]');
        if (row) this.dispatchEvent(new CustomEvent('dd-fields-hover', { bubbles: true, detail: { id: row.dataset.row } }));
      });
      this.addEventListener('pointerleave', () => {
        this.dispatchEvent(new CustomEvent('dd-fields-hover', { bubbles: true, detail: { id: null } }));
      });
    }
    this.readAttributes();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.readAttributes();
  }

  readAttributes() {
    if (this.dataset.layout) {
      try {
        this._rows = annotate(JSON.parse(this.dataset.layout));
      } catch {
        return;
      }
    }
    this.render();
  }

  get rows() {
    return this._rows;
  }

  set rows(value) {
    this._rows = value;
    this.render();
  }

  get editable() {
    return this.hasAttribute('editable');
  }

  get compare() {
    return this.hasAttribute('compare');
  }

  fire(detail) {
    this.dispatchEvent(new CustomEvent('dd-fields-edit', { bubbles: true, detail }));
  }

  typed(event) {
    const input = event.target;
    const row = input.closest?.('tr[data-index]');
    if (!row || !input.dataset.op) return;
    this.fire({ op: input.dataset.op, index: Number(row.dataset.index), value: input.value });
  }

  pressed(event) {
    const button = event.target.closest?.('button[data-op]');
    if (!button || button.disabled) return;
    const op = button.dataset.op;
    const row = button.closest('tr[data-index]');
    const index = row ? Number(row.dataset.index) : -1;
    if (op === 'up' || op === 'down') {
      const by = op === 'up' ? -1 : 1;
      this.fire({ op: 'move', index, by });
      const moved = this.querySelector(`tr[data-index="${index + by}"]`);
      const same = moved?.querySelector(`button[data-op="${op}"]`);
      (same && !same.disabled ? same : moved?.querySelector('button[data-op]:not([disabled])'))?.focus();
    } else if (op === 'remove') {
      this.fire({ op: 'remove', index });
      const next = this.querySelector(`tr[data-index="${index}"]`) ?? this.querySelector(`tr[data-index="${index - 1}"]`);
      (next?.querySelector('input') ?? this.querySelector('button[data-op="add"]'))?.focus();
    } else if (op === 'add') {
      this.fire({ op: 'add' });
      const rows = this.querySelectorAll('tr[data-index]');
      const input = rows[rows.length - 1]?.querySelector('input');
      input?.focus();
      input?.select();
    } else if (op === 'reset') {
      this.fire({ op: 'reset' });
    }
  }

  head() {
    const row = el('tr');
    const names = this.compare ? ['', 'field', 'order', 'offset', 'size', 'align'] : ['', 'field', 'type', 'offset', 'size', 'align'];
    if (this.editable) names.push('');
    names.forEach((name, at) => {
      const th = el('th', at >= 3 && at <= 5 ? 'dd-n' : '', name);
      th.scope = 'col';
      row.append(th);
    });
    return row;
  }

  // Fills one field row. An input the viewer is typing in keeps its text.
  fieldRow(tr, row, count) {
    const editable = this.editable;
    const shape = `${editable ? 'e' : 't'}${this.compare ? 'c' : ''}`;
    if (tr.dataset.shape !== shape) {
      tr.dataset.shape = shape;
      tr.replaceChildren();
      const key = el('td', 'dd-fields-key');
      key.append(el('span', 'dd-key'));
      const name = el('td', 'dd-fields-name');
      const second = el('td', this.compare ? 'dd-fields-order' : 'dd-fields-type');
      if (editable) {
        const nameInput = el('input');
        nameInput.dataset.op = 'rename';
        nameInput.spellcheck = false;
        nameInput.autocomplete = 'off';
        const typeInput = el('input');
        typeInput.dataset.op = 'retype';
        typeInput.spellcheck = false;
        typeInput.autocomplete = 'off';
        name.append(nameInput);
        second.append(typeInput);
      }
      tr.append(key, name, second, el('td', 'dd-n'), el('td', 'dd-n'), el('td', 'dd-n'));
      tr.children[3].dataset.label = 'offset';
      tr.children[4].dataset.label = 'size';
      tr.children[5].dataset.label = 'align';
      if (editable) {
        const ops = el('td', 'dd-fields-ops');
        for (const [op, text] of [['up', '↑'], ['down', '↓'], ['remove', '×']]) {
          const button = el('button', '', text);
          button.type = 'button';
          button.dataset.op = op;
          ops.append(button);
        }
        tr.append(ops);
      }
    }
    tr.className = 'dd-fields-f';
    tr.dataset.row = row.id;
    tr.dataset.index = String(row.index);
    const swatch = tr.querySelector('.dd-key');
    swatch.textContent = row.letter;
    swatch.style.setProperty('--dd-c', `var(--dd-field-${row.key % 10})`);
    const [, name, second, offset, size, align] = tr.children;
    const cells = listCells(row, { compare: this.compare });
    if (editable) {
      const [nameInput] = name.children;
      const [typeInput] = second.children;
      nameInput.setAttribute('aria-label', `name of field ${row.letter}`);
      typeInput.setAttribute('aria-label', `type of field ${row.letter}`);
      if (document.activeElement !== nameInput) nameInput.value = row.name;
      if (document.activeElement !== typeInput) typeInput.value = row.type;
      const [up, down, remove] = tr.querySelectorAll('button[data-op]');
      up.disabled = row.index === 0;
      down.disabled = row.index === count - 1;
      up.setAttribute('aria-label', `move ${row.name} up`);
      down.setAttribute('aria-label', `move ${row.name} down`);
      remove.setAttribute('aria-label', `remove ${row.name}`);
    } else {
      name.textContent = cells.name;
      second.textContent = cells.second;
    }
    offset.textContent = cells.offset;
    size.textContent = cells.size;
    align.textContent = cells.align;
    return tr;
  }

  padRow(row) {
    const tr = el('tr', 'dd-fields-p');
    tr.dataset.row = row.id;
    const key = el('td', 'dd-fields-key');
    key.append(el('span', 'dd-key dd-key-pad'));
    const cells = listCells(row, { compare: this.compare });
    const offset = el('td', 'dd-n', cells.offset);
    offset.dataset.label = 'offset';
    const size = el('td', 'dd-n', cells.size);
    size.dataset.label = 'size';
    tr.append(key, el('td', 'dd-fields-name', cells.name), el('td', 'dd-fields-why', cells.second), offset, size, el('td', 'dd-n'));
    if (this.editable) tr.append(el('td'));
    return tr;
  }

  render() {
    const rows = this._rows;
    if (!this.isConnected || !rows) return;
    const shape = `${this.editable ? 'e' : 't'}${this.compare ? 'c' : ''}`;
    let table = this.querySelector(':scope > table.dd-fields-table');
    if (!table || table.dataset.shape !== shape) {
      table = el('table', 'dd-fields-table');
      table.dataset.shape = shape;
      const thead = el('thead');
      thead.append(this.head());
      table.append(thead, el('tbody'));
      const parts = [table];
      if (this.editable) {
        const foot = el('div', 'dd-fields-foot');
        for (const [op, text] of [['add', 'Add field'], ['reset', 'Reset']]) {
          const button = el('button', '', text);
          button.type = 'button';
          button.dataset.op = op;
          foot.append(button);
        }
        parts.push(foot);
      }
      this.replaceChildren(...parts);
    }
    const body = table.tBodies[0];
    const old = new Map([...body.querySelectorAll('tr.dd-fields-f')].map((tr) => [tr.dataset.row, tr]));
    const active = document.activeElement;
    const held = active && body.contains(active) ? active : null;
    const caret = held && 'selectionStart' in held ? [held.selectionStart, held.selectionEnd] : null;
    const count = rows.filter((row) => row.kind === 'field').length;
    body.replaceChildren(
      ...rows.map((row) => (row.kind === 'pad' ? this.padRow(row) : this.fieldRow(old.get(row.id) ?? el('tr'), row, count))),
    );
    if (held && body.contains(held)) {
      held.focus({ preventScroll: true });
      if (caret) {
        try {
          held.setSelectionRange(caret[0], caret[1]);
        } catch {
          // not a text input
        }
      }
    }
    if (this.marked) this.highlight(this.marked);
  }

  highlight(id) {
    this.marked = id ?? undefined;
    for (const tr of this.querySelectorAll('tr[data-row]')) tr.classList.toggle('dd-on', id != null && tr.dataset.row === id);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dd-fields')) customElements.define('dd-fields', DdFields);
