// <dd-card>: a showcase card with a small state and an expanded state. It grows in place.
// It knows nothing about what is inside it.
//
//   <dd-card label="declared order">
//     <div data-dd-small>shown only while small</div>
//     <div>shown in both states</div>
//     <div data-dd-large>shown only while expanded</div>
//   </dd-card>
//
// Small, the whole card is one button: a click anywhere in it, or Enter or Space with the
// card focused, expands it. Expanded, it has a Collapse button, and Escape collapses it.
// Focus goes to the Collapse button on expanding and back to the card on collapsing.
// aria-expanded is on the card while small and on the Collapse button while expanded.
//
// Attribute `description` is what the small card holds, in words. A button hides what is
// inside it from a screen reader, so the small card reads it out as its description.
//
// Attribute `open` holds the state. Methods: expand(), collapse(), toggle().
// Event `dd-card-toggle` (bubbles, detail { open }) fires after the state changed and
// before the box is measured, so a listener can fill the expanded part in time.
// The box animates from its old height to its new one, unless the viewer asked for
// reduced motion.

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Runs `change`, then animates `box` from the height it had to the height it has now.
export function animateBox(box, change) {
  const from = box.getBoundingClientRect().height;
  change();
  if (reducedMotion() || typeof box.animate !== 'function') return;
  const to = box.getBoundingClientRect().height;
  if (Math.abs(from - to) < 1) return;
  box.style.overflow = 'hidden';
  const run = box.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: 260,
    easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  });
  const done = () => {
    box.style.overflow = '';
  };
  run.onfinish = done;
  run.oncancel = done;
}

let cards = 0;

const Base = globalThis.HTMLElement ?? class {};

export class DdCard extends Base {
  static observedAttributes = ['open', 'label', 'description'];

  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    if (!this.id) this.id = `dd-card-${++cards}`;
    this.mark = document.createElement('span');
    this.mark.className = 'dd-card-mark';
    this.mark.setAttribute('aria-hidden', 'true');
    this.mark.innerHTML =
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2H14v4.5M14 2 9 7M6.5 14H2V9.5M2 14l5-5"/></svg>';
    this.close = document.createElement('button');
    this.close.type = 'button';
    this.close.className = 'dd-card-close';
    this.close.textContent = 'Collapse';
    this.close.setAttribute('aria-expanded', 'true');
    this.close.setAttribute('aria-controls', this.id);
    this.close.addEventListener('click', (event) => {
      event.stopPropagation();
      this.collapse();
    });
    this.prepend(this.mark, this.close);
    // A click expands the card only if the card was small when the click began: a control
    // inside an expanded card may collapse it, and that same click must not open it again.
    this.addEventListener('click', () => (this.wasOpen = this.open), true);
    this.addEventListener('click', () => {
      if (!this.open && !this.wasOpen) this.expand();
    });
    this.addEventListener('keydown', (event) => {
      if (event.defaultPrevented) return;
      if (!this.open && event.target === this && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        this.expand();
      } else if (this.open && event.key === 'Escape') {
        event.preventDefault();
        this.collapse();
      }
    });
    this.sync();
  }

  get open() {
    return this.hasAttribute('open');
  }

  expand() {
    this.set(true);
  }

  collapse() {
    this.set(false);
  }

  toggle() {
    this.set(!this.open);
  }

  // `focus: false` changes the state and leaves the focus where it is.
  set(open, { focus = true } = {}) {
    if (open === this.open) return;
    animateBox(this, () => {
      this.toggleAttribute('open', open);
      this.dispatchEvent(new CustomEvent('dd-card-toggle', { bubbles: true, detail: { open } }));
    });
    if (focus) (open ? this.close : this).focus({ preventScroll: true });
    if (open && typeof this.scrollIntoView === 'function') {
      this.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  attributeChangedCallback() {
    if (this.ready) this.sync();
  }

  sync() {
    const label = this.getAttribute('label') ?? '';
    if (this.open) {
      this.removeAttribute('role');
      this.removeAttribute('aria-expanded');
      this.removeAttribute('aria-label');
      this.removeAttribute('aria-description');
      this.tabIndex = -1;
      this.close.setAttribute('aria-label', label ? `Collapse ${label}` : 'Collapse');
    } else {
      this.setAttribute('role', 'button');
      this.setAttribute('aria-expanded', 'false');
      this.setAttribute('aria-label', label ? `Expand ${label}` : 'Expand');
      const description = this.getAttribute('description');
      if (description) this.setAttribute('aria-description', description);
      else this.removeAttribute('aria-description');
      this.tabIndex = 0;
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dd-card')) customElements.define('dd-card', DdCard);
