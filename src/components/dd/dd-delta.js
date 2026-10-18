// <dd-delta>: a before and after figure. One big number, an arrow, the number after.
//
//   <dd-delta from="48" to="40" unit="bytes" note="10 of 48 bytes are padding"></dd-delta>
//
// Leave `to` out, or give the same value as `from`, and it shows one number. The element
// writes its own content from its attributes and writes it again when one changes.

export function deltaLabel({ from, to, unit, note }) {
  const one = (n) => (unit ? `${n} ${unit}` : `${n}`);
  const figure = to != null && to !== '' && String(to) !== String(from) ? `${one(from)} to ${one(to)}` : one(from);
  return note ? `${figure}, ${note}` : figure;
}

const Base = globalThis.HTMLElement ?? class {};

export class DdDelta extends Base {
  static observedAttributes = ['from', 'to', 'unit', 'note'];

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  render() {
    const from = this.getAttribute('from') ?? '';
    const to = this.getAttribute('to');
    const unit = this.getAttribute('unit') ?? '';
    const note = this.getAttribute('note') ?? '';
    const number = (value, cls) => {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = value;
      if (unit) {
        const small = document.createElement('small');
        small.textContent = unit;
        span.append(small);
      }
      return span;
    };
    const parts = [number(from, 'dd-delta-n')];
    if (to != null && to !== '' && to !== from) {
      const arrow = document.createElement('span');
      arrow.className = 'dd-delta-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      parts.push(arrow, number(to, 'dd-delta-n dd-delta-to'));
    }
    if (note) {
      const text = document.createElement('span');
      text.className = 'dd-delta-note';
      text.textContent = note;
      parts.push(text);
    }
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', deltaLabel({ from, to, unit, note }));
    this.replaceChildren(...parts);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dd-delta')) customElements.define('dd-delta', DdDelta);
