// <dd-struct-picker>: many structs, a few of them in view. Hand it dataflow ledger entries.
//
//   <dd-struct-picker commit="337baa3" date="2026-10-11" data-open='["render.mesh.Mesh"]'>
//     <script type="application/json">[ ...entries of ledgers/dataflow.json... ]</script>
//   </dd-struct-picker>
//
// A short list may also stand in the attribute `data-structs`, or be set from script as
// `.structs` before the element is put on the page.
//
// The search box is a combobox. Typing filters by name, group, rule, language, a repr
// item or a derive, or a field's name or type. Its list is grouped by the system or module part of each id, and
// the groups beside it are a table of contents: one press jumps the list to that group.
// Arrow keys move, Page Up and Page Down go a group at a time, Enter adds the struct to
// the view or takes it out, Escape closes. Only the rows in the box are drawn, so several
// hundred structs cost what twenty do.
//
// Each struct in view is one <dd-struct-showcase>: its own before and after figure and the
// two cards that expand in place. Side by side where the width allows. Each has Remove.
//
// An entry whose layout the source does not fix, or with a field type the layout code
// does not know, is listed and can be added. It shows its fields as written and a line
// saying why no byte layout is drawn. It never gets a size, an offset or a strip
// (drawBlocks() in dd-pick.js).
//
// Under a struct, "Where the name appears": the places its ledger entry records (`moves`).
// A place that names a second struct offers that struct, so a chain can be walked one
// press at a time. Signatures are grouped by system. These are places where the type's
// name appears, found by syntax. Nothing is drawn as an order in time. An entry with no
// recorded place shows nothing there. Above the structs in view one line says, once, what
// the scan does not see and which folder it read (`scanned`, or the folders the entries'
// paths share), so an empty list is not read as "this struct goes nowhere".
//
// Attributes: `data-open` (ids in view at the start; default the first struct that may be
// drawn), `data-layouts` ({ id: layouts } worked out when the page was built, so those
// draw at once), `engine` (see dd-engine.js), `commit`, `date`. An entry's own `commit`
// and `date` win over the element's.
//
// Event `dd-picker-change` (bubbles, detail { ids }) fires when the view changes.

import './dd-card.js';
import './dd-struct-showcase.js';
import { getEngine } from './dd-engine.js';
import { layoutsOf } from './dd-annotate.js';
import { bodyOf, followOf, groupOf, indexOf, mayDraw, namedBy, nameOf, rowsInView, scannedFolder, scopeNote, search, sourceLine, stepGroup, stepRow } from './dd-pick.js';

const Base = globalThis.HTMLElement ?? class {};

const ROW = 34; // The height of one row of the list, as dd-components.css draws it.
const BOX = 9; // Rows in the box when its height is not known yet.
const FEW = 6; // Links shown before "Show all".

let pickers = 0;

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name === 'class') node.className = value;
    else if (name === 'text') node.textContent = value;
    else if (value === true) node.setAttribute(name, '');
    else if (value !== false && value != null) node.setAttribute(name, value);
  }
  node.append(...children.filter((child) => child != null));
  return node;
}

export class DdStructPicker extends Base {
  set structs(value) {
    this._structs = value;
  }

  get structs() {
    return this._structs;
  }

  connectedCallback() {
    if (this.built) return;
    let entries = this._structs;
    let open = null;
    this.given = {};
    try {
      const held = this.querySelector(':scope > script[type="application/json"]');
      if (!entries && held) entries = JSON.parse(held.textContent);
      if (!entries) entries = JSON.parse(this.dataset.structs ?? '[]');
      if (this.dataset.layouts) this.given = JSON.parse(this.dataset.layouts);
      if (this.dataset.open) open = JSON.parse(this.dataset.open);
    } catch (error) {
      this.dataset.failed = String(error);
      return;
    }
    if (!Array.isArray(entries)) return;
    this.built = true;
    this.uid = `dd-pk-${++pickers}`;
    this.entries = entries;
    this.byId = new Map(entries.map((entry) => [entry.id, entry]));
    this.back = namedBy(entries);
    // How many entries go by each name, so two structs of one name are told apart.
    this.named = new Map();
    for (const entry of entries) this.named.set(nameOf(entry), (this.named.get(nameOf(entry)) ?? 0) + 1);
    this.index = indexOf(entries);
    this.view = [];
    this.active = -1;
    this.engine = undefined;
    this.build();
    this.refresh();

    const first = this.entries.find(mayDraw) ?? this.entries[0];
    for (const id of open ?? (first ? [first.id] : [])) this.add(id, { quiet: true });
    this.counted();

    getEngine(this.getAttribute('engine') ?? undefined).then(
      (engine) => {
        this.engine = engine;
        this.dataset.engine = 'ready';
        for (const item of this.view) if (item.waiting) this.fill(item);
      },
      (error) => {
        this.engine = null;
        this.dataset.engine = 'none';
        for (const item of this.view) if (item.waiting) this.fill(item);
      },
    );
  }

  build() {
    const total = this.entries.length;
    this.input = h('input', {
      id: `${this.uid}-in`,
      class: 'dd-pk-input',
      type: 'text',
      role: 'combobox',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-autocomplete': 'list',
      'aria-expanded': 'false',
      'aria-controls': `${this.uid}-list`,
      placeholder: total === 1 ? '1 struct' : `Search ${total} structs: name, group, field or type`,
    });
    this.groups = h('div', { class: 'dd-pk-groups', role: 'group', 'aria-label': 'Groups' });
    this.list = h('div', { id: `${this.uid}-list`, class: 'dd-pk-list', role: 'listbox', 'aria-label': 'Structs', 'aria-multiselectable': 'true' });
    this.scroll = h('div', { class: 'dd-pk-scroll' }, this.list);
    this.hint = h('div', { class: 'dd-pk-hint' });
    this.pop = h('div', { class: 'dd-pk-pop', hidden: true }, this.groups, this.scroll, this.hint);
    this.box = h('div', { class: 'dd-pk-box' }, this.input, this.pop);
    this.count = h('span', { class: 'dd-pk-count' });
    this.clear = h('button', { type: 'button', class: 'dd-chip dd-pk-clear', hidden: true, text: 'Remove all' });
    this.said = h('span', { class: 'dd-pk-said', role: 'status', 'aria-live': 'polite' });
    const bar = h('div', { class: 'dd-pk-bar' }, h('label', { class: 'dd-pk-label', for: `${this.uid}-in`, text: 'Structs' }), this.box, this.count, this.clear, this.said);
    this.shown = h('div', { class: 'dd-pk-view' });
    this.none = h('p', { class: 'dd-pk-none', hidden: true });
    // Said once: what the lists of places leave out, and which folder was scanned.
    const scanned = this.getAttribute('scanned') ?? scannedFolder(this.entries);
    const places = this.entries.some((entry) => entry.moves?.length > 0);
    this.scope = h('p', { class: 'dd-pk-say dd-pk-scope', hidden: !places, text: scopeNote(scanned) });
    this.replaceChildren(h('div', { class: 'dd-pk' }, bar, this.none, this.scope, this.shown));
    if (total === 0) {
      bar.hidden = true;
      this.none.textContent = 'No struct is recorded yet. `dandori tracker scan --structs --write` lists the structs of a project.';
    }

    this.input.addEventListener('input', () => {
      this.active = -1;
      this.openPop();
      this.refresh();
      this.scroll.scrollTop = 0;
    });
    this.input.addEventListener('focus', () => this.openPop());
    this.input.addEventListener('click', () => this.openPop());
    this.input.addEventListener('keydown', (event) => this.key(event));
    this.box.addEventListener('focusout', (event) => {
      if (!this.box.contains(event.relatedTarget)) this.closePop();
    });
    // A press inside the list must not take the focus out of the search box.
    this.pop.addEventListener('mousedown', (event) => {
      if (!event.target.closest('button')) event.preventDefault();
    });
    this.pop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && event.target !== this.input) {
        event.preventDefault();
        this.input.focus();
        this.closePop();
      }
    });
    this.scroll.addEventListener('scroll', () => this.draw());
    this.list.addEventListener('click', (event) => {
      const option = event.target.closest('[role="option"]');
      if (!option) return;
      this.active = Number(option.dataset.row);
      this.toggle(this.result.rows[this.active].item.id);
    });
    this.groups.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-row]');
      if (!button) return;
      const row = Number(button.dataset.row);
      this.scroll.scrollTop = row * ROW;
      this.setActive(stepRow(this.result.rows, row, 1), { reveal: false });
      this.input.focus();
    });
    this.clear.addEventListener('click', () => {
      for (const item of this.view.slice()) this.remove(item.id, { quiet: true });
      this.say('Nothing in view.');
      this.input.focus();
    });
    this.shown.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const item = this.view.find((one) => one.node.contains(button));
      if (button.dataset.remove != null) this.remove(item.id);
      else if (button.dataset.add) this.follow(button.dataset.add, item);
      else if (button.dataset.more != null) {
        item.all = true;
        this.sites(item);
        item.node.querySelector('.dd-pk-links button')?.focus();
      }
    });
    // The places in signatures are drawn when their list is opened, not before.
    this.shown.addEventListener(
      'toggle',
      (event) => {
        const details = event.target;
        if (!details.open || !details.classList?.contains('dd-pk-sig') || details.dataset.filled) return;
        const item = this.view.find((one) => one.node.contains(details));
        details.dataset.filled = 'yes';
        for (const group of item.follow.signatures) {
          details.append(h('div', { class: 'dd-pk-sys' }, h('span', { class: 'dd-pk-mono', text: this.short(group.system) }), h('span', { text: group.summary })), this.places(group.places, true));
        }
      },
      true,
    );
  }

  // A group or system name without the part every group shares.
  short(name) {
    const prefix = this.index.prefix;
    return prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
  }

  inView(id) {
    return this.view.some((item) => item.id === id);
  }

  // ---- the combobox ----

  openPop() {
    if (!this.pop.hidden || this.entries.length === 0) return;
    this.pop.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.draw();
  }

  closePop() {
    if (this.pop.hidden) return;
    this.pop.hidden = true;
    this.active = -1;
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
  }

  // Searches again for what is typed and draws the groups and the rows in the box.
  refresh() {
    this.result = search(this.index, this.input.value);
    const { rows, groups, options } = this.result;
    if (this.active >= rows.length) this.active = -1;
    this.list.style.height = `${Math.max(rows.length, 1) * ROW}px`;
    // The table of contents: the groups that hold a match, each with how many.
    this.groups.replaceChildren(
      ...(this.index.prefix ? [h('span', { class: 'dd-pk-prefix', text: `in ${this.index.prefix.slice(0, -1)}` })] : []),
      ...groups
        .filter((g) => g.count > 0)
        .map((g) =>
          h(
            'button',
            // Out of the Tab order: with the keyboard, Page Up and Page Down go by group.
            { type: 'button', class: 'dd-pk-group', tabindex: '-1', 'data-row': String(g.row), title: g.group },
            h('span', { text: g.label }),
            h('span', { class: 'dd-pk-n', text: String(g.count) }),
          ),
        ),
    );
    this.groups.hidden = groups.length < 2;
    const total = this.entries.length;
    this.hint.textContent = `${options === total ? total : `${options} of ${total}`} · Enter adds or removes · PgUp PgDn by group · Esc closes`;
    this.draw();
  }

  // Draws the rows that are in the box and a few either side, and nothing else.
  draw() {
    if (this.pop.hidden) return;
    const { rows } = this.result;
    if (rows.length === 0) {
      this.list.replaceChildren(h('div', { class: 'dd-pk-nomatch', text: 'No struct matches.' }));
      return;
    }
    const [start, end] = rowsInView(this.scroll.scrollTop, this.scroll.clientHeight || ROW * BOX, ROW, rows.length);
    const nodes = [];
    let options = 0;
    for (let at = 0; at < start; at++) if (rows[at].kind === 'option') options++;
    for (let at = start; at < end; at++) {
      const row = rows[at];
      if (row.kind === 'group') {
        nodes.push(h('div', { class: 'dd-pk-head-row', role: 'presentation', style: `top:${at * ROW}px` }, h('span', { text: row.label }), h('span', { class: 'dd-pk-n', text: String(row.count) })));
        continue;
      }
      options++;
      const { item } = row;
      const inView = this.inView(item.id);
      nodes.push(
        h(
          'div',
          {
            id: `${this.uid}-row-${at}`,
            class: `dd-pk-opt${at === this.active ? ' dd-on' : ''}`,
            role: 'option',
            'data-row': String(at),
            'aria-selected': String(inView),
            'aria-posinset': String(options),
            'aria-setsize': String(this.result.options),
            title: item.id,
            style: `top:${at * ROW}px`,
          },
          h('span', { class: 'dd-pk-opt-name', text: item.name }),
          row.why ? h('span', { class: 'dd-pk-opt-why', text: row.why }) : h('span', { class: 'dd-pk-opt-why' }),
          h('span', { class: 'dd-pk-opt-rule', text: inView ? 'in view' : item.drawn ? item.rule : 'no byte layout' }),
        ),
      );
    }
    this.list.replaceChildren(...nodes);
    // The group at the top of the box is the current one in the table of contents.
    const top = Math.min(rows.length - 1, Math.floor(this.scroll.scrollTop / ROW));
    let current = -1;
    for (const g of this.result.groups) if (g.row >= 0 && g.row <= top) current = g.row;
    for (const button of this.groups.querySelectorAll('button')) {
      const on = Number(button.dataset.row) === current;
      if (on === (button.getAttribute('aria-current') === 'true')) continue;
      if (on) {
        button.setAttribute('aria-current', 'true');
        // Keeps the current group in sight without moving the page.
        const box = this.groups;
        if (button.offsetTop < box.scrollTop || button.offsetTop + button.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = button.offsetTop - 4;
        if (button.offsetLeft < box.scrollLeft || button.offsetLeft + button.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = button.offsetLeft - 4;
      } else button.removeAttribute('aria-current');
    }
  }

  setActive(row, { reveal = true } = {}) {
    this.active = row;
    if (row >= 0 && reveal) {
      // Room is kept above for the row's group heading.
      const top = row * ROW;
      const box = this.scroll;
      if (top - ROW < box.scrollTop) box.scrollTop = Math.max(0, top - ROW);
      else if (top + ROW > box.scrollTop + box.clientHeight) box.scrollTop = top + ROW - box.clientHeight;
    }
    this.draw();
    if (row >= 0) this.input.setAttribute('aria-activedescendant', `${this.uid}-row-${row}`);
    else this.input.removeAttribute('aria-activedescendant');
  }

  key(event) {
    const { rows } = this.result;
    const move = (step, by = stepRow) => {
      event.preventDefault();
      this.openPop();
      this.setActive(by(rows, this.active, step));
    };
    switch (event.key) {
      case 'ArrowDown':
        return move(1);
      case 'ArrowUp':
        return move(-1);
      case 'PageDown':
        return move(1, stepGroup);
      case 'PageUp':
        return move(-1, stepGroup);
      case 'Enter': {
        if (this.pop.hidden) return this.openPop();
        const at = this.active >= 0 ? this.active : stepRow(rows, -1, 1);
        if (at < 0) return undefined;
        event.preventDefault();
        this.setActive(at);
        return this.toggle(rows[at].item.id);
      }
      case 'Escape':
        if (!this.pop.hidden) {
          event.preventDefault();
          return this.closePop();
        }
        if (this.input.value) {
          event.preventDefault();
          this.input.value = '';
          this.refresh();
        }
        return undefined;
      default:
        return undefined;
    }
  }

  // ---- the view ----

  toggle(id) {
    if (this.inView(id)) this.remove(id, { focus: false });
    else this.add(id);
    this.draw();
  }

  say(text) {
    this.said.textContent = text;
  }

  counted() {
    const n = this.view.length;
    this.count.textContent = this.entries.length === 0 ? '' : `${n} in view`;
    this.clear.hidden = n < 2;
    if (this.entries.length > 0) {
      this.none.hidden = n > 0;
      this.none.textContent = 'No struct in view. Search above and press Enter to add one.';
    } else this.none.hidden = false;
    // Every "add" button under every struct says whether its struct is in view now.
    for (const button of this.shown.querySelectorAll('button[data-add]')) this.addLabel(button);
  }

  changed() {
    this.counted();
    this.dispatchEvent(new CustomEvent('dd-picker-change', { bubbles: true, detail: { ids: this.view.map((item) => item.id) } }));
  }

  // Puts a struct in view, after the struct `after` when one is given.
  add(id, { after = null, quiet = false } = {}) {
    const entry = this.byId.get(id);
    if (!entry || this.inView(id)) return null;
    const name = nameOf(entry);
    const item = { id, entry, name, all: false };
    item.heading = h('h3', { class: 'dd-pk-name', tabindex: '-1', text: name });
    item.body = h('div', { class: 'dd-pk-body' });
    item.places = h('div', { class: 'dd-pk-follow' });
    const facts = sourceLine(entry);
    item.node = h(
      'article',
      { class: 'dd-pk-item', 'data-id': id, 'aria-label': name },
      h(
        'header',
        { class: 'dd-pk-head' },
        h(
          'div',
          { class: 'dd-pk-title' },
          item.heading,
          h('p', { class: 'dd-pk-meta' }, h('span', { class: 'dd-pk-mono', text: groupOf(entry), title: id }), facts ? h('span', { text: facts }) : null),
          entry.where ? h('p', { class: 'dd-pk-where dd-pk-mono', text: entry.where }) : null,
        ),
        h('button', { type: 'button', class: 'dd-chip dd-pk-remove', 'data-remove': true, 'aria-label': `Remove ${name} from view`, text: 'Remove' }),
      ),
      item.body,
      item.places,
    );
    const at = after ? this.view.indexOf(after) + 1 : this.view.length;
    this.view.splice(at, 0, item);
    this.shown.insertBefore(item.node, this.shown.children[at] ?? null);
    this.fill(item);
    item.follow = followOf(entry, this);
    this.sites(item);
    if (!quiet) {
      this.say(`Added ${name}. ${this.view.length} in view.`);
      this.changed();
    }
    return item;
  }

  remove(id, { quiet = false, focus = true } = {}) {
    const at = this.view.findIndex((item) => item.id === id);
    if (at < 0) return;
    const [item] = this.view.splice(at, 1);
    const held = item.node.contains(document.activeElement);
    item.node.remove();
    if (held && focus) ((this.view[at] ?? this.view[at - 1])?.node.querySelector('.dd-pk-remove') ?? this.input).focus();
    if (!quiet) this.say(`Removed ${item.name}. ${this.view.length} in view.`);
    this.changed();
  }

  // One press on a struct that a place names: adds it beside this one, or goes to it.
  follow(id, from) {
    const there = this.view.find((item) => item.id === id) ?? this.add(id, { after: from });
    if (!there) return;
    there.node.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    there.heading.focus({ preventScroll: true });
  }

  // The body of one struct: its showcase cards, or its fields as written and why no byte
  // layout is drawn. bodyOf() in dd-pick.js decides which.
  fill(item) {
    const { entry } = item;
    const body = bodyOf(entry, (struct) => this.given[entry.id] ?? (this.engine ? layoutsOf(this.engine, struct) : this.engine));
    item.waiting = body.kind === 'wait';
    if (body.kind === 'wait') return item.body.replaceChildren(h('p', { class: 'dd-pk-why', text: 'Loading the layout code.' }));
    if (body.kind === 'fields') return item.body.replaceChildren(this.plain(item, body));
    return item.body.replaceChildren(
      h('dd-struct-showcase', {
        'data-structs': JSON.stringify([body.struct]),
        'data-layouts': JSON.stringify([body.layouts]),
        engine: this.getAttribute('engine'),
        commit: entry.commit ?? this.getAttribute('commit'),
        date: entry.date ?? this.getAttribute('date'),
      }),
    );
  }

  // Fields as the source writes them, with no number: the card for an entry that is not drawn.
  plain(item, { why, fields }) {
    const list = h('ul', { class: 'dd-pk-fields' });
    for (const field of fields) {
      list.append(
        h(
          'li',
          {},
          h('span', { class: 'dd-pk-mono', text: field.name }),
          h('span', { class: 'dd-pk-mono dd-pk-type', text: field.type }),
          field.unknown ? h('span', { class: 'dd-pk-unknown', text: 'type not known' }) : null,
        ),
      );
    }
    const count = fields.length === 1 ? '1 field' : `${fields.length} fields`;
    return h(
      'dd-card',
      { label: `${item.name}, fields as written`, class: 'dd-pk-plain', description: `${count}. No byte layout is drawn: ${why}.` },
      h('div', { class: 'dd-card-tag' }, h('span', { text: 'fields as written' }), h('span', { class: 'dd-sc-size', 'data-dd-small': true, text: count })),
      h('p', { class: 'dd-pk-why', text: `No byte layout is drawn: ${why}.` }),
      h('div', { 'data-dd-large': true }, fields.length > 0 ? list : h('p', { class: 'dd-pk-why', text: 'The source names no field.' })),
    );
  }

  addLabel(button) {
    const name = button.dataset.name;
    const here = this.inView(button.dataset.add);
    button.textContent = here ? `${name}, in view` : `Add ${name}`;
    button.setAttribute('aria-label', here ? `Go to ${name}, which is in view` : `Add ${name} to the view`);
  }

  // The list of places, each a path and line with the source line beside it.
  places(places, withKind = false) {
    const list = h('ul', { class: 'dd-pk-places' });
    for (const place of places) {
      list.append(
        h(
          'li',
          {},
          withKind ? h('span', { class: 'dd-pk-how', text: place.how }) : null,
          h('span', { class: 'dd-pk-mono dd-pk-at', text: place.at }),
          place.text ? h('code', { class: 'dd-pk-text', text: place.text }) : null,
          place.note ? h('span', { class: 'dd-pk-note', text: place.note }) : null,
        ),
      );
    }
    return list;
  }

  // "Where the name appears" for one struct. Nothing when the ledger records no place.
  sites(item) {
    const follow = item.follow;
    if (!follow) return item.places.replaceChildren();
    const parts = [
      h('h4', { class: 'dd-pk-sub', text: 'Where the name appears' }),
      h('p', { class: 'dd-pk-say', text: `${follow.count === 1 ? '1 place' : `${follow.count} places`} where the type’s name appears, found by syntax. Not a lifetime analysis.` }),
    ];
    if (follow.links.length > 0) {
      const list = h('ul', { class: 'dd-pk-links' });
      const some = item.all ? follow.links : follow.links.slice(0, FEW);
      for (const link of some) {
        const other = this.byId.get(link.other);
        let target;
        if (other) {
          // Two structs of one name: the button says which, by its group.
          const name = this.named.get(nameOf(other)) > 1 ? `${nameOf(other)} in ${this.short(groupOf(other))}` : nameOf(other);
          target = h('button', { type: 'button', class: 'dd-chip dd-chip-mono', 'data-add': link.other, 'data-name': name, title: link.other });
          this.addLabel(target);
        } else target = h('span', { class: 'dd-pk-mono', text: link.other });
        list.append(
          h(
            'li',
            {},
            h('div', { class: 'dd-pk-link' }, h('span', { class: 'dd-pk-how', text: link.words }), target, other ? h('span', { class: 'dd-pk-mono dd-pk-in', text: this.short(groupOf(other)) }) : null),
            this.places(link.places),
          ),
        );
      }
      parts.push(list);
      if (some.length < follow.links.length) parts.push(h('button', { type: 'button', class: 'dd-chip', 'data-more': true, text: `Show all ${follow.links.length} structs` }));
    }
    if (follow.sites.length > 0) parts.push(this.places(follow.sites, true));
    if (follow.signatures.length > 0) {
      const n = follow.signatures.reduce((sum, group) => sum + group.places.length, 0);
      const systems = follow.signatures.length;
      parts.push(h('details', { class: 'dd-pk-sig' }, h('summary', { text: `In signatures: ${n === 1 ? '1 place' : `${n} places`} in ${systems === 1 ? '1 system' : `${systems} systems`}` })));
    }
    return item.places.replaceChildren(...parts);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dd-struct-picker')) {
  customElements.define('dd-struct-picker', DdStructPicker);
}
