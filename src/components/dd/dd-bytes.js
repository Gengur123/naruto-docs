// <dd-bytes>: a struct's bytes, one cell per byte, coloured by field, padding hatched.
//
//   <dd-bytes mode="small" data-layout='{ ...what layout_json answered... }'></dd-bytes>
//
// mode="small": the cells, a letter on each field, a mark at the side of each row with the
// index of its first byte, and one line under the cells that says what the pointer is on.
// The attribute `no-ruler` leaves the marks at the side out.
// mode="large": bigger cells with a letter on each field and nothing else. This is the
// strip beside a field list: the list has every name and number, so the strip repeats none.
// mode="annotated": for a strip with no list beside it. A ruler with every byte's index,
// each field's name where its bytes have room for it (three bytes or more in one row; a
// long name is cut), and each run of padding with its size on it.
//
// From script, set `.layout` (the parsed answer of layout_json) and, for a layout that is
// not the declared one, `.keys` (see keysOf in dd-annotate.js) so each field keeps its
// colour and letter. `.highlight(id)` marks one run ('f2' is the field with key 2, 'p28'
// the padding that starts at byte 28; null clears). Pointing at a cell fires
// `dd-bytes-hover` (bubbles, detail { id, text }; text is the pointer line).
//
// 16 bytes to a row, or 8 when the element is narrower than 520 pixels.

import { MODES, PALETTE_SIZE, describe, readout, rowsOf, runsOf, stripLabels } from './dd-annotate.js';

const NARROW = 520;
const Base = globalThis.HTMLElement ?? class {};

export class DdBytes extends Base {
  static observedAttributes = ['data-layout', 'data-keys', 'mode', 'no-ruler'];

  connectedCallback() {
    if (!this.hasAttribute('mode')) this.setAttribute('mode', 'small');
    if (!this.watch && typeof ResizeObserver === 'function') {
      this.watch = new ResizeObserver(() => {
        if (this.columns() !== this.cols) this.render();
      });
      this.watch.observe(this);
    }
    this.readAttributes();
  }

  disconnectedCallback() {
    this.watch?.disconnect();
    this.watch = undefined;
  }

  attributeChangedCallback() {
    if (this.isConnected) this.readAttributes();
  }

  readAttributes() {
    if (this.dataset.layout) {
      try {
        this._layout = JSON.parse(this.dataset.layout);
        this._keys = this.dataset.keys ? JSON.parse(this.dataset.keys) : undefined;
      } catch {
        return;
      }
    }
    this.render();
  }

  get layout() {
    return this._layout;
  }

  set layout(value) {
    this._layout = value;
    this.render();
  }

  set keys(value) {
    this._keys = value;
    this.render();
  }

  columns() {
    const width = this.clientWidth;
    return width > 0 && width < NARROW ? 8 : 16;
  }

  idOf(run) {
    if (run.kind === 'pad') return `p${run.offset}`;
    return `f${this._keys ? this._keys[run.field] : run.field}`;
  }

  render() {
    const layout = this._layout;
    if (!this.isConnected || !layout || layout.error) return;
    const runs = runsOf(layout);
    const cols = (this.cols = this.columns());
    this.runs = runs;
    this.style.setProperty('--dd-cols', String(cols));
    const mode = MODES.includes(this.getAttribute('mode')) ? this.getAttribute('mode') : 'small';

    const grid = document.createElement('div');
    grid.className = 'dd-bytes-grid';
    grid.setAttribute('role', 'img');
    grid.setAttribute('aria-label', describe(layout));
    for (const row of rowsOf(runs, layout.size, cols)) {
      const line = document.createElement('div');
      line.className = 'dd-bytes-row';
      if (mode === 'small' && !this.hasAttribute('no-ruler')) {
        const off = document.createElement('span');
        off.className = 'dd-bytes-off';
        off.textContent = String(row.start);
        line.append(off);
      }
      for (const piece of row.pieces) {
        const run = runs[piece.run];
        const id = this.idOf(run);
        const key = run.kind === 'field' ? (this._keys ? this._keys[run.field] : run.field) : undefined;
        const labels = stripLabels(layout, run, mode, key);
        for (let i = 0; i < piece.span; i++) {
          const column = piece.col + i + 2;
          if (mode === 'annotated') {
            const tick = document.createElement('span');
            tick.className = 'dd-bytes-tick';
            tick.style.gridColumn = String(column);
            tick.textContent = String(row.start + piece.col + i);
            line.append(tick);
          }
          const cell = document.createElement('span');
          cell.className = run.kind === 'pad' ? 'dd-cell dd-cell-pad' : 'dd-cell';
          cell.style.gridColumn = String(column);
          cell.dataset.id = id;
          cell.dataset.run = String(piece.run);
          if (run.kind === 'field') {
            cell.style.setProperty('--dd-c', `var(--dd-field-${key % PALETTE_SIZE})`);
            if (piece.first && i === 0) cell.textContent = labels.cell;
          } else if (piece.first && i === 0 && labels.cell) {
            const count = document.createElement('b');
            count.className = 'dd-cell-count';
            count.textContent = labels.cell;
            cell.append(count);
          }
          line.append(cell);
        }
        if (labels.name && piece.first && piece.span >= 3) {
          const name = document.createElement('span');
          name.className = 'dd-bytes-name';
          name.style.gridColumn = `${piece.col + 3} / span ${piece.span - 1}`;
          name.textContent = labels.name;
          line.append(name);
        }
      }
      grid.append(line);
    }
    const read = document.createElement('p');
    read.className = 'dd-bytes-read';
    grid.addEventListener('pointerover', (event) => {
      const cell = event.target.closest?.('.dd-cell');
      if (!cell) return;
      this.highlight(cell.dataset.id);
      const text = readout(layout, runs[Number(cell.dataset.run)]);
      read.textContent = text;
      this.dispatchEvent(new CustomEvent('dd-bytes-hover', { bubbles: true, detail: { id: cell.dataset.id, text } }));
    });
    grid.addEventListener('pointerleave', () => {
      this.highlight(null);
      read.textContent = '';
      this.dispatchEvent(new CustomEvent('dd-bytes-hover', { bubbles: true, detail: { id: null, text: '' } }));
    });
    if (mode === 'small') this.replaceChildren(grid, read);
    else this.replaceChildren(grid);
    if (this.marked) this.highlight(this.marked);
  }

  highlight(id) {
    this.marked = id ?? undefined;
    const grid = this.querySelector('.dd-bytes-grid');
    if (!grid) return;
    grid.toggleAttribute('data-hl', id != null);
    for (const cell of grid.querySelectorAll('.dd-cell')) cell.classList.toggle('dd-on', id != null && cell.dataset.id === id);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dd-bytes')) customElements.define('dd-bytes', DdBytes);
