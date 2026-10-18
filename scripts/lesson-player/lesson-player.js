/* lesson-player.js: one screen that plays a lesson like a video and steps through it
   like cards. It knows nothing about any one lesson. The lesson is data:

     { title, tokens, legend, chapters: [ { title, steps: [ step, ... ] } ] }

   and a step is
     { caption, say, card, drag, draw(g, p, s), state(), handles(g, s), controls }
   The page tools/lesson-player.md of the site says what each field is for. The film's length comes from the words:
   a step is up for (words / 3 + 1) seconds, a step with no caption for 1 second. */
var LessonPlayer = (function () {
  'use strict';
  var C = {};                       /* colours read from the CSS tokens; one object, refilled on a theme change */
  var PACE = { wordsPerSecond: 3, pad: 1, silent: 1 };

  /* ---- small arithmetic and text helpers, also handed to lessons ---- */
  function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = cl(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function out(t) { t = cl(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function sub(p, a, b) { return cl((p - a) / (b - a), 0, 1); }
  /* Numbers as a lesson prints them: a real minus sign, no trailing zeros. */
  function N(v, d, keep) {
    if (d === undefined) d = 4;
    if (!isFinite(v)) return String(v);
    if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0;
    var s = v.toFixed(d);
    if (!keep && s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('-', '−');
  }
  function PT(p, d) { return '(' + N(p[0], d) + ', ' + N(p[1], d) + ')'; }
  function rgb(hex) {
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
    var n = parseInt(hex, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function al(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clock(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }

  /* ---- terms: [[term]] or [[term|the words shown]] in any caption or card ---- */
  var MARK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  function plain(text) { return String(text || '').replace(MARK, function (_, term, shown) { return shown || term; }).replace(/<[^>]*>/g, ' '); }
  function words(text) { var m = plain(text).trim().match(/\S+/g); return m ? m.length : 0; }
  function termsIn(text) { var o = [], m; MARK.lastIndex = 0; while ((m = MARK.exec(String(text || '')))) o.push(m[1].trim()); return o; }
  /* The same anchor the site's Glossary page gives a term (glossify.mjs, slugOf): letters and digits of any alphabet are kept. */
  function slug(term) { return term.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''); }

  /* ---- the timeline: every step's start and length, in seconds at speed 1 ---- */
  function stepSeconds(step, pace) {
    pace = pace || PACE;
    if (step.dur != null) return step.dur;
    var w = words(step.caption);
    return w ? w / pace.wordsPerSecond + pace.pad : pace.silent;
  }
  function plan(lesson) {
    var steps = [], chapters = [], t = 0;
    lesson.chapters.forEach(function (ch, ci) {
      chapters.push({ title: ch.title, start: t, first: steps.length, n: ch.steps.length });
      ch.steps.forEach(function (step, k) {
        var d = stepSeconds(step, lesson.pace);
        steps.push({ ch: ci, k: k, id: step.id || (ci + 1) + '-' + (k + 1), step: step, start: t, dur: d });
        t += d;
      });
    });
    return { steps: steps, chapters: chapters, total: t };
  }

  /* ---- canvas kit: what a step's draw function gets as g ---- */
  function makeG(ctx, w, hh) {
    var g = { ctx: ctx, w: w, h: hh, C: C, fs: cl(Math.min(w, hh * 1.25) / 460, 0.92, 1.4) };
    function font(o) { return (o.bold ? '600 ' : '') + Math.round((o.size || 13) * g.fs * 10) / 10 + 'px ' + (o.mono ? C.fontNum : C.fontBody); }
    g.line = function (x1, y1, x2, y2, col, lw, dash) {
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw || 1; if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
    };
    g.path = function (pts, o) {
      if (pts.length < 2) return;
      ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (o.close) ctx.closePath();
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.lineJoin = 'round'; ctx.lineCap = o.cap || 'round'; if (o.dash) ctx.setLineDash(o.dash); ctx.stroke(); }
      ctx.restore();
    };
    g.rect = function (x, y, ww, h2, o) {
      ctx.save();
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fillRect(x, y, ww, h2); }
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; if (o.dash) ctx.setLineDash(o.dash); ctx.strokeRect(x, y, ww, h2); }
      ctx.restore();
    };
    g.rrect = function (x, y, ww, h2, rad, o) {
      rad = Math.min(rad, ww / 2, h2 / 2); ctx.save(); ctx.beginPath();
      ctx.moveTo(x + rad, y); ctx.arcTo(x + ww, y, x + ww, y + h2, rad); ctx.arcTo(x + ww, y + h2, x, y + h2, rad); ctx.arcTo(x, y + h2, x, y, rad); ctx.arcTo(x, y, x + ww, y, rad); ctx.closePath();
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; if (o.dash) ctx.setLineDash(o.dash); ctx.stroke(); }
      ctx.restore();
    };
    g.dot = function (x, y, r, col, hollow) {
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
      if (hollow) { ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); }
      else { ctx.fillStyle = col; ctx.fill(); }
      ctx.restore();
    };
    g.ring = function (x, y, r, col, lw) { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw || 2; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke(); ctx.restore(); };
    g.tbox = function (s, x, y, o) {
      o = o || {};
      ctx.save(); ctx.font = font(o); var m = ctx.measureText(s).width; ctx.restore();
      var sz = (o.size || 13) * g.fs, bx = o.align === 'center' ? x - m / 2 : o.align === 'right' ? x - m : x;
      var by = o.base === 'middle' ? y - sz * 0.62 : o.base === 'top' ? y - 1 : y - sz * 0.95;
      return { x0: bx - 3, y0: by - 1, x1: bx + m + 3, y1: by + sz * 1.25 + 1, w: m };
    };
    g.text = function (s, x, y, o) {
      o = o || {};
      ctx.save(); ctx.font = font(o); ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      if (o.bg) { var b = g.tbox(s, x, y, o); ctx.fillStyle = al(C.bg, 0.86); ctx.fillRect(b.x0 + 1, b.y0 + 1, b.x1 - b.x0 - 2, b.y1 - b.y0 - 2); }
      ctx.fillStyle = o.col || C.text; ctx.fillText(s, x, y); ctx.restore();
    };
    g.hits = function (a, list) { return list.some(function (b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }); };
    /* A label at the first of its candidate places [x, y, align] that is on the stage and clear of `taken`. */
    g.label = function (s, cands, o, taken) {
      var pick = null, first = null, i, k;
      for (i = 0; i < cands.length && !pick; i++) {
        var oo = {}; for (k in o) oo[k] = o[k];
        if (cands[i][2]) oo.align = cands[i][2];
        var b = g.tbox(s, cands[i][0], cands[i][1], oo), cand = { c: cands[i], o: oo, b: b };
        if (!first) first = cand;
        if (!g.hits(b, taken) && b.x0 >= 0 && b.x1 <= w && b.y0 >= 0 && b.y1 <= hh) pick = cand;
      }
      pick = pick || first;
      g.text(s, pick.c[0], pick.c[1], pick.o); taken.push(pick.b);
      return pick.b;
    };
    g.arrow = function (x1, y1, x2, y2, col, lw, dash) {
      var a = Math.atan2(y2 - y1, x2 - x1), L = 9;
      if (Math.hypot(x2 - x1, y2 - y1) < 3) return;
      g.line(x1, y1, x2 - Math.cos(a) * 4, y2 - Math.sin(a) * 4, col, lw || 2, dash);
      g.path([[x2, y2], [x2 - L * Math.cos(a - 0.42), y2 - L * Math.sin(a - 0.42)], [x2 - L * Math.cos(a + 0.42), y2 - L * Math.sin(a + 0.42)]], { fill: col, close: true });
    };
    g.clip = function (pts, fn) {
      ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.clip(); fn(); ctx.restore();
    };
    g.clipRect = function (r, fn) { ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); fn(); ctx.restore(); };
    g.alpha = function (a, fn) { if (a <= 0) return; ctx.save(); ctx.globalAlpha *= cl(a, 0, 1); fn(); ctx.restore(); };
    g.hatch = function (x, y, ww, h2, col, gap) {
      gap = gap || 7; ctx.save(); ctx.beginPath(); ctx.rect(x, y, ww, h2); ctx.clip();
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
      for (var d = -h2; d < ww + h2; d += gap) { ctx.moveTo(x + d, y + h2); ctx.lineTo(x + d + h2, y); }
      ctx.stroke(); ctx.restore();
    };
    g.dots = function (x, y, ww, h2, col) {
      ctx.save(); ctx.fillStyle = col;
      for (var yy = y + 2; yy < y + h2; yy += 4) for (var xx = x + 2 + ((Math.round((yy - y) / 4)) % 2) * 2; xx < x + ww; xx += 4) ctx.fillRect(xx, yy, 1.3, 1.3);
      ctx.restore();
    };
    g.disc = function (x, y, glyph, col, r) {
      r = r || 9; g.dot(x, y, r, col);
      ctx.save(); ctx.strokeStyle = C.bg; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x + r * 0.5, y);
      if (glyph === '+') { ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x, y + r * 0.5); }
      ctx.stroke(); ctx.restore();
    };
    return g;
  }

  /* ---- DOM helper ---- */
  function h(tag, attrs) {
    var e = document.createElement(tag), i, k;
    for (k in (attrs || {})) {
      if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    for (i = 2; i < arguments.length; i++) if (arguments[i] != null) e.append(arguments[i]);
    return e;
  }
  var ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h4.5v15H6zM13.5 4.5H18v15h-4.5z"/></svg>',
    replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V1.5L6.5 6 12 10.5V7a5.5 5.5 0 1 1-5.5 5.5h-2A7.5 7.5 0 1 0 12 5z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2.5v14H6zM19 5v14L9.5 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 5H18v14h-2.5zM5 5v14l9.5-7z"/></svg>',
    voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM15.5 8.5v7a4.5 4.5 0 0 0 0-7zM15.5 4.3v2.1a6 6 0 0 1 0 11.2v2.1a8 8 0 0 0 0-15.4z"/></svg>'
  };

  /* ---- the player ---- */
  function mount(root, lesson, opt) {
    opt = opt || {};
    var P = plan(lesson), steps = P.steps, total = P.total, last = steps.length - 1;
    var gloss = {}; (opt.glossary || []).forEach(function (e) { gloss[e.term] = e; });
    var base = opt.glossaryBase || root.getAttribute('data-glossary-base') || '';
    var RM = window.matchMedia('(prefers-reduced-motion: reduce)');
    var st = { idx: 0, p: 0, playing: false, single: false, speed: 1, fresh: true, s: {}, tab: 'card', voice: false };
    /* narration: opt.narration maps a step's id to its clip's address. One audio element, made only when there are clips. */
    var narr = opt.narration || {}, audio = null, bVoice = null, vo = { idx: -1, done: true };
    var ctlSync = [], spaceHeld = false, FADE = 260, fade = 0, snap = null, raf = 0, lastTs = 0, queued = false, drag = null, down = null, lastG = null, cardHtml = null, seenCap = {}, overFrom = null;

    /* theme */
    var TOK = { bg: '--bg', panel: '--panel', rule: '--rule', ink: '--ink', text: '--text', accent: '--accent' }, k;
    for (k in (lesson.tokens || {})) TOK[k] = lesson.tokens[k];
    function readTheme() {
      var cs = getComputedStyle(document.documentElement), n;
      for (n in TOK) C[n] = cs.getPropertyValue(TOK[n]).trim();
      C.fontBody = cs.getPropertyValue('--font-body').trim() || 'sans-serif';
      C.fontNum = cs.getPropertyValue('--font-num').trim() || 'monospace';
      for (n in (lesson.numbers || {})) C[n] = parseFloat(cs.getPropertyValue(lesson.numbers[n])) || 0;
    }
    readTheme();

    /* DOM */
    var cv = h('canvas', { 'aria-label': lesson.title + ': the picture. Click to play or pause.' }), ctx = cv.getContext('2d');
    var big = h('button', { type: 'button', class: 'lp-big', html: ICON.play + '<span>Play</span><small>' + clock(total) + '</small>', onclick: function () { play(); } });
    var hint = h('div', { class: 'lp-hint', hidden: '' });
    var over = h('div', { class: 'lp-over', hidden: '' });
    var stage = h('div', { class: 'lp-stage' }, cv, hint, big, over);
    var eyebrow = h('p', { class: 'lp-eyebrow' }), cap = h('p', { class: 'lp-cap', 'aria-live': 'polite' });
    var main = h('div', { class: 'lp-main' }, stage, h('div', { class: 'lp-capbox' }, eyebrow, cap));
    var tabCard = h('button', { type: 'button', class: 'lp-tab', role: 'tab', text: 'This step', onclick: function () { setTab('card'); } });
    var tabCh = h('button', { type: 'button', class: 'lp-tab', role: 'tab', text: 'Chapters', onclick: function () { setTab('chapters'); } });
    var cardBody = h('div'), cardDrag = h('p', { class: 'lp-drag', hidden: '' }), cardCtl = h('div', { class: 'lp-ctl' }), cardH = h('h2');
    var cardEl = h('div', { class: 'lp-card' }, cardH, cardDrag, cardCtl, cardBody);
    var chList = h('ol', { class: 'lp-chapters', hidden: '' });
    /* A card or the chapter list that is taller than its area is cut into pages, turned with two buttons. Nothing scrolls. */
    var pgPrev = h('button', { type: 'button', 'aria-label': 'Previous page of this card', text: '‹', onclick: function () { turnPage(-1); } });
    var pgNext = h('button', { type: 'button', 'aria-label': 'Next page of this card', text: '›', onclick: function () { turnPage(1); } });
    var pgLabel = h('span', { 'aria-live': 'polite' }), pager = h('div', { class: 'lp-pager', hidden: '' }, pgPrev, pgLabel, pgNext);
    var pane = h('div', { class: 'lp-pane', role: 'tabpanel' }, cardEl, chList, pager);
    var side = h('aside', { class: 'lp-side', 'aria-label': 'Step card and chapters' }, h('div', { class: 'lp-tabs', role: 'tablist' }, tabCard, tabCh), pane);
    var chBtns = P.chapters.map(function (c, i) {
      var b = h('button', { type: 'button', onclick: function () { var film = st.playing && !st.single; goStep(c.first, true); if (film && st.playing) st.single = false; } }, h('i', { text: String(i + 1) }), h('span', { text: c.title }), h('small', { text: clock(c.start) }));
      chList.appendChild(h('li', null, b)); return b;
    });
    var fill = h('div', { class: 'lp-fill' }), thumb = h('div', { class: 'lp-thumb' });
    var scrub = h('div', { class: 'lp-scrub', role: 'slider', tabindex: '0', 'aria-label': 'Position in the film', 'aria-valuemin': '0', 'aria-valuemax': String(Math.round(total)) }, h('div', { class: 'lp-track' }), fill);
    P.chapters.forEach(function (c, i) { if (i) scrub.appendChild(h('div', { class: 'lp-mark', style: 'left:' + (c.start / total * 100) + '%', title: (i + 1) + '. ' + c.title })); });
    scrub.appendChild(thumb);
    var bPrev = h('button', { type: 'button', class: 'lp-btn', 'aria-label': 'Previous step', title: 'Previous step (left arrow)', html: ICON.prev, onclick: function () { prev(); } });
    var bPlay = h('button', { type: 'button', class: 'lp-btn lp-play', onclick: function () { toggle(); } });
    var bNext = h('button', { type: 'button', class: 'lp-btn', 'aria-label': 'Next step', title: 'Next step (right arrow)', html: ICON.next, onclick: function () { next(); } });
    var timeEl = h('span', { class: 'lp-time' }), stepEl = h('span', { class: 'lp-stepno' });
    var speed = h('select', { class: 'lp-speed', 'aria-label': 'Playback speed' });
    [0.75, 1, 1.5, 2].forEach(function (v) { var o = h('option', { value: String(v), text: v + '×' }); if (v === 1) o.selected = true; speed.appendChild(o); });
    speed.addEventListener('change', function () { st.speed = parseFloat(speed.value) || 1; speed.blur(); });
    var row = h('div', { class: 'lp-row' }, bPrev, bPlay, bNext, timeEl, stepEl, h('span', { class: 'lp-space' }), speed);
    var bLegend = null;
    if (lesson.legend && lesson.legend.length) {
      bLegend = h('button', { type: 'button', class: 'lp-btn', 'aria-label': 'Colour code', title: 'Colour code', 'aria-expanded': 'false', onclick: function () { if (overFrom === bLegend) closeOver(); else openLegend(); } },
        h('span', { class: 'lp-dots', html: lesson.legend.map(function (l) { return '<i style="background:var(' + l.token + ')"></i>'; }).join('') }));
      row.appendChild(bLegend);
    }
    if (steps.some(function (e) { return narr[e.id]; })) {
      audio = new Audio();
      audio.addEventListener('ended', function () { vo.done = true; });
      audio.addEventListener('error', function () { vo.done = true; });
      bVoice = h('button', { type: 'button', class: 'lp-btn', 'aria-label': 'Narration', title: 'Narration', 'aria-pressed': 'false', html: ICON.voice, onclick: function () {
        st.voice = !st.voice; vo.idx = -1; bVoice.setAttribute('aria-pressed', String(st.voice)); ui();
      } });
      row.appendChild(bVoice); root.classList.add('lp-voiced');
    }
    root.classList.add('lp');
    root.append(main, side, h('div', { class: 'lp-bar' }, scrub, row));
    function fit() { root.style.height = ''; if (root.clientHeight < 120) root.style.height = window.innerHeight + 'px'; }

    /* text with [[terms]]: each term becomes a link the first time it appears on a step */
    function markup(text, seen, isHtml) {
      return String(text || '').replace(isHtml ? MARK : /[^[]+|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[/g, function (m, term, shown) {
        if (term === undefined) return isHtml ? m : esc(m);
        term = term.trim(); var label = isHtml ? (shown || term) : esc(shown || term);
        if (!gloss[term] || seen[term]) return label;
        seen[term] = 1;
        return base ? '<a class="lp-term" target="_top" href="' + esc(base + slug(term)) + '" data-term="' + esc(term) + '">' + label + '</a>'
                    : '<button type="button" class="lp-term" data-term="' + esc(term) + '" aria-expanded="false">' + label + '</button>';
      });
    }
    root.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('.lp-term'); if (!t) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;   /* with a base address, these open the real entry */
      e.preventDefault(); openTerm(t.getAttribute('data-term'), t);
    });
    function openOver(from, node) {
      pause(); over.innerHTML = ''; overFrom = from;
      var x = h('button', { type: 'button', class: 'lp-close', 'aria-label': 'Close', text: '×', onclick: closeOver });
      node.appendChild(x); over.appendChild(node); over.hidden = false;
      if (from) from.setAttribute('aria-expanded', 'true');
      x.focus({ preventScroll: true });
    }
    function closeOver() {
      if (over.hidden) return;
      over.hidden = true; over.innerHTML = '';
      if (overFrom) { overFrom.setAttribute('aria-expanded', 'false'); if (document.contains(overFrom)) overFrom.focus({ preventScroll: true }); }
      overFrom = null;
    }
    over.addEventListener('click', function (e) { if (e.target === over) closeOver(); });
    function openTerm(term, from) {
      var g = gloss[term]; if (!g) return;
      var sheet = h('div', { class: 'lp-sheet', role: 'dialog', 'aria-label': 'Glossary: ' + term }, h('h2', { text: term }), h('p', { text: g.plain }));
      if (g.seen_in) sheet.appendChild(h('small', { text: 'seen in ' + g.seen_in }));
      if (base) sheet.appendChild(h('p', null, h('a', { href: base + slug(term), target: '_top', text: 'Open this entry in the glossary' })));
      openOver(from, sheet);
    }
    function openLegend() {
      var sheet = h('div', { class: 'lp-sheet', role: 'dialog', 'aria-label': 'Colour code' }, h('h2', { text: 'Colour code' }),
        h('ul', { class: 'lp-legend', html: lesson.legend.map(function (l) { return '<li>' + (l.swatch || '<svg width="44" height="22" aria-hidden="true"><rect x="8" y="3" width="28" height="16" rx="3" fill="var(' + l.token + ')"/></svg>') + '<span>' + esc(l.text) + '</span></li>'; }).join('') }));
      openOver(bLegend, sheet);
    }

    function pageEl() { return st.tab === 'chapters' ? chList : cardEl; }
    function pageStep(el) { var cs = getComputedStyle(el); return el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.columnGap) || 0); }
    function pageCount(el) { var w = pageStep(el); return w > 1 ? Math.max(1, Math.round((el.scrollWidth - el.clientWidth) / w) + 1) : 1; }
    function paginate() {
      var el = pageEl(), n;
      pager.hidden = true; n = pageCount(el);
      if (n > 1) { pager.hidden = false; n = Math.max(2, pageCount(el)); }   /* the buttons take a line, so count again */
      if (el === chList && chList._follow && chBtns.length) {   /* turn to the page that holds the chapter now playing */
        var cur = chBtns[steps[st.idx].ch].getBoundingClientRect(), box = el.getBoundingClientRect();
        el._pg = Math.floor((cur.left - box.left + el.scrollLeft + 2) / pageStep(el)); chList._follow = false;
      }
      el._pg = cl(el._pg || 0, 0, n - 1); el.scrollLeft = el._pg * pageStep(el);
      pgLabel.textContent = 'page ' + (el._pg + 1) + ' of ' + n; pgPrev.disabled = el._pg === 0; pgNext.disabled = el._pg >= n - 1;
    }
    function turnPage(d) { var el = pageEl(); el._pg = (el._pg || 0) + d; paginate(); }
    /* the browser moves a page into view by itself when the Tab key reaches something on it: keep the count in step */
    [cardEl, chList].forEach(function (el) { el.addEventListener('scroll', function () { var w = pageStep(el), pg = Math.round(el.scrollLeft / w); if (pg !== el._pg) { el._pg = pg; paginate(); } }); });

    /* the step's words */
    function setTab(t) {
      st.tab = t; cardEl.hidden = t !== 'card'; chList.hidden = t !== 'chapters'; paginate();
      tabCard.setAttribute('aria-selected', String(t === 'card')); tabCh.setAttribute('aria-selected', String(t === 'chapters'));
    }
    function captionOf(i) { while (i > 0 && !steps[i].step.caption && steps[i - 1].ch === steps[i].ch) i--; return steps[i].step.caption || ''; }
    function renderStep() {
      var e = steps[st.idx], step = e.step, ch = P.chapters[e.ch];
      seenCap = {};
      var html = markup(captionOf(st.idx), seenCap, false);
      if (cap._h !== html) { cap._h = html; cap.innerHTML = html; if (st.playing && !RM.matches) { cap.classList.add('swap'); requestAnimationFrame(function () { cap.classList.remove('swap'); }); } }
      eyebrow.textContent = (e.ch + 1) + ' of ' + P.chapters.length + ' · ' + ch.title;
      cardH.textContent = step.title || ch.title; cardH.className = step.title ? '' : 'lp-same';
      cardDrag.hidden = !step.drag; cardDrag.textContent = step.drag ? 'While paused, drag ' + step.drag + '.' : '';
      cardCtl.innerHTML = ''; cardHtml = null; ctlSync = [];
      (step.controls || []).forEach(function (c) { cardCtl.appendChild(makeControl(c)); });
      chBtns.forEach(function (b, i) { b.setAttribute('aria-current', String(i === e.ch)); });
      cardEl._pg = 0; if (chList._ch !== e.ch) { chList._ch = e.ch; chList._follow = true; }
      renderCard();
    }
    function renderCard() {
      var step = steps[st.idx].step, raw = typeof step.card === 'function' ? step.card(st.s) : (step.card || '');
      if (raw === cardHtml) return;
      cardHtml = raw; var seen = {}, n; for (n in seenCap) seen[n] = 1;
      cardBody.innerHTML = markup(raw, seen, true);
      paginate();
    }
    function changed() { st.s.touched = true; if (st.p < 1) st.p = 1; redraw(); }
    function makeControl(c) {
      if (c.type === 'range') {
        var o = h('output'), inp = h('input', { type: 'range', min: c.min, max: c.max, step: c.step || 1 });
        var show = function () { o.textContent = c.fmt ? c.fmt(+inp.value) : inp.value; };
        var sync = function () { var v = c.get(st.s); if (inp._v !== v) { inp._v = v; inp.value = v; show(); } };
        sync(); ctlSync.push(sync);
        inp.addEventListener('input', function () { pause(); c.set(st.s, +inp.value); inp._v = c.get(st.s); show(); changed(); });
        return h('label', null, h('span', { text: c.label }), inp, o);
      }
      var wrap = h('div', { class: 'lp-seg', role: 'group', 'aria-label': c.label }, h('span', { text: c.label }));
      var btns = c.options.map(function (name, i) {
        var b = h('button', { type: 'button', text: name, 'aria-pressed': String(c.get(st.s) === i), onclick: function () {
          pause(); c.set(st.s, i); btns.forEach(function (x, j) { x.setAttribute('aria-pressed', String(j === i)); }); changed();
        } });
        wrap.appendChild(b); return b;
      });
      ctlSync.push(function () { var v = c.get(st.s); btns.forEach(function (x, j) { var on = String(j === v); if (x.getAttribute('aria-pressed') !== on) x.setAttribute('aria-pressed', on); }); });
      return wrap;
    }

    /* drawing */
    function size() {
      var w = Math.max(120, Math.floor(stage.clientWidth)), hh = Math.max(120, Math.floor(stage.clientHeight)), d = Math.min(window.devicePixelRatio || 1, 2);
      if (cv._w !== w || cv._h !== hh || cv._d !== d) { cv._w = w; cv._h = hh; cv._d = d; cv.width = Math.round(w * d); cv.height = Math.round(hh * d); }
    }
    function drawNow() {
      queued = false; size();
      ctx.setTransform(cv._d, 0, 0, cv._d, 0, 0); ctx.clearRect(0, 0, cv._w, cv._h);
      var g = makeG(ctx, cv._w, cv._h); g.dpr = cv._d; g.moving = st.playing || !!drag; g.paused = !st.playing; g.rm = RM.matches;
      steps[st.idx].step.draw(g, st.p, st.s);
      if (fade > 0 && snap) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = fade * fade; ctx.drawImage(snap, 0, 0, cv.width, cv.height); ctx.restore(); }
      lastG = g; renderCard(); ctlSync.forEach(function (f) { f(); }); ui();
    }
    function redraw() { if (!queued) { queued = true; requestAnimationFrame(drawNow); } }
    function takeSnap() {
      if (RM.matches || !cv.width) { snap = null; return; }
      if (!snap) snap = document.createElement('canvas');
      if (snap.width !== cv.width || snap.height !== cv.height) { snap.width = cv.width; snap.height = cv.height; }
      var c = snap.getContext('2d'); c.clearRect(0, 0, snap.width, snap.height); c.drawImage(cv, 0, 0);
    }
    function now() { return steps[st.idx].start + st.p * steps[st.idx].dur; }
    function ui() {
      var t = now(), e = steps[st.idx], ended = st.idx === last && st.p >= 1, f = (t / total * 100) + '%';
      fill.style.width = f; thumb.style.left = f;
      timeEl.textContent = clock(t) + ' / ' + clock(total);
      stepEl.textContent = 'step ' + (st.idx + 1) + ' of ' + steps.length;
      var mode = st.playing ? 'pause' : ended ? 'replay' : 'play';
      if (bPlay._m !== mode) { bPlay._m = mode; bPlay.innerHTML = ICON[mode]; bPlay.setAttribute('aria-label', mode === 'pause' ? 'Pause' : mode === 'replay' ? 'Play again from the start' : 'Play'); bPlay.title = (mode === 'pause' ? 'Pause' : 'Play') + ' (space)'; }
      bPrev.disabled = st.idx === 0 && st.p <= 0; bNext.disabled = ended;
      scrub.setAttribute('aria-valuenow', String(Math.round(t)));
      scrub.setAttribute('aria-valuetext', clock(t) + ' of ' + clock(total) + ', ' + P.chapters[e.ch].title);
      big.hidden = !st.fresh;
      var canDrag = !st.playing && !!e.step.drag;
      hint.hidden = !canDrag || st.fresh; if (canDrag) hint.textContent = 'Drag: ' + e.step.drag;
      var film = st.playing && !st.single ? 'chapters' : 'card';   /* the film shows where it is; a pause or a step shows the card */
      if (film !== st.auto) { st.auto = film; setTab(film); }
      root.setAttribute('data-state', st.playing ? 'playing' : 'paused');
      voiceSync();
    }
    /* Narration. While it is on and the film runs, the step's clip plays, at its own speed whatever the film's;
       the step's finished picture then waits for the clip (busy). Off, or with no clip, nothing here changes anything. */
    function busy() { return st.voice && vo.idx === st.idx && !vo.done; }
    function voiceSync() {
      if (!audio) return;
      if (!st.voice || !st.playing) { if (!audio.paused) audio.pause(); return; }
      var i = st.idx, src = narr[steps[i].id], pr;
      if (vo.idx !== i) { vo.idx = i; vo.done = !src; if (!src) { audio.pause(); return; } audio.src = src; }
      else if (vo.done || !audio.paused) return;
      pr = audio.play();   /* a clip the browser refuses or cannot play must not hold the film */
      if (pr && pr.catch) pr.catch(function (e) { if (vo.idx === i && (!e || e.name !== 'AbortError')) vo.done = true; });
    }

    /* moving through the film */
    function enter(i) { vo.idx = -1; st.idx = cl(i, 0, last); var step = steps[st.idx].step; st.s = step.state ? step.state() : {}; renderStep(); }
    function kick() { if (!raf) { lastTs = performance.now(); raf = requestAnimationFrame(tick); } }
    function tick(ts) {
      raf = 0;
      var raw = Math.min(100, ts - lastTs); lastTs = ts;
      if (fade > 0) fade = Math.max(0, fade - raw / FADE);
      if (st.playing) {
        st.p += raw / 1000 * st.speed / steps[st.idx].dur;
        while (st.p >= 1) {
          if (busy()) { st.p = 1; break; }
          if (st.single || st.idx === last) { st.p = 1; st.playing = false; st.single = false; break; }
          var spill = (st.p - 1) * steps[st.idx].dur;
          takeSnap(); enter(st.idx + 1); st.p = spill / steps[st.idx].dur; fade = snap ? 1 : 0;
        }
      }
      drawNow();
      if (st.playing || fade > 0) raf = requestAnimationFrame(tick);
    }
    function play() {
      closeOver(); st.fresh = false; st.single = false;
      if (st.p >= 1 && !busy()) { if (st.idx === last) { enter(0); } else { takeSnap(); enter(st.idx + 1); fade = snap ? 1 : 0; } st.p = 0; }
      st.playing = true; ui(); kick();
    }
    function pause() { if (!st.playing) return; st.playing = false; st.single = false; redraw(); }
    function toggle() { if (st.playing) pause(); else play(); }
    /* Go to a step and show it: its motion runs once and stops at its end. With reduced motion it shows the finished picture. */
    function goStep(i, animate) {
      closeOver(); st.fresh = false; fade = 0;
      enter(i);
      var clip = st.voice && narr[steps[st.idx].id];   /* with reduced motion a narrated step shows its finished picture while it speaks */
      if (animate && (!RM.matches || clip)) { st.p = RM.matches ? 1 : 0; st.playing = true; st.single = true; voiceSync(); kick(); }
      else { st.p = 1; st.playing = false; st.single = false; redraw(); }
    }
    function next() { if (st.fresh) goStep(0, true); else if (st.idx < last) goStep(st.idx + 1, true); else goStep(last, false); }
    function prev() { goStep(Math.max(0, st.idx - 1), true); }
    function seek(t) {
      t = cl(t, 0, total); var i = last;
      for (var j = 0; j < steps.length; j++) if (t < steps[j].start + steps[j].dur) { i = j; break; }
      st.fresh = false; fade = 0;
      if (i !== st.idx) enter(i);
      st.p = cl((t - steps[i].start) / steps[i].dur, 0, 1);
      redraw();
    }

    /* scrubber */
    (function () {
      var held = false, was = false;
      function at(e) { var r = scrub.getBoundingClientRect(); return cl((e.clientX - r.left) / r.width, 0, 1) * total; }
      scrub.addEventListener('pointerdown', function (e) {
        held = true; was = st.playing && !st.single; st.playing = false; st.single = false; closeOver();
        try { scrub.setPointerCapture(e.pointerId); } catch (x) {}
        seek(at(e)); e.preventDefault();
      });
      scrub.addEventListener('pointermove', function (e) { if (held) seek(at(e)); });
      function up() { if (!held) return; held = false; if (was && !(st.idx === last && st.p >= 1)) { st.playing = true; kick(); } else redraw(); }
      scrub.addEventListener('pointerup', up); scrub.addEventListener('pointercancel', up);
      scrub.addEventListener('keydown', function (e) {
        var ci = steps[st.idx].ch;
        if (e.key === 'Home') { pause(); seek(0); }
        else if (e.key === 'End') { pause(); seek(total); }
        else if (e.key === 'PageDown') { pause(); goStep(P.chapters[Math.min(P.chapters.length - 1, ci + 1)].first, false); }
        else if (e.key === 'PageUp') { pause(); goStep(P.chapters[Math.max(0, ci - 1)].first, false); }
        else return;
        e.preventDefault();
      });
    })();

    /* the stage: a click plays or pauses; while paused, things can be dragged */
    function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function handles() { var step = steps[st.idx].step; return !st.playing && step.handles && lastG ? step.handles(lastG, st.s) || [] : []; }
    function pick(x, y, rad) {
      var best = null, bd = 1e9, hs = handles();
      hs.forEach(function (hd) { if (hd.area) return; var d = Math.hypot(hd.x - x, hd.y - y); if (d <= Math.max(rad, hd.r || 0) && d < bd) { bd = d; best = hd; } });
      if (!best) hs.forEach(function (hd) { if (!best && hd.area && x >= hd.area.x && x <= hd.area.x + hd.area.w && y >= hd.area.y && y <= hd.area.y + hd.area.h) best = hd; });
      return best;
    }
    function begin(hd, x, y) { drag = hd; cv.classList.add('grabbing'); st.fresh = false; if (hd.start) hd.start(x, y); }
    cv.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      var p = pos(e), hd = pick(p[0], p[1], e.pointerType === 'mouse' ? 16 : 30);
      down = { p: p, hd: hd, moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      if (hd && !hd.area) { begin(hd, p[0], p[1]); hd.drag(p[0], p[1]); changed(); }
      e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) {
      var p = pos(e);
      if (!down) { cv.classList.toggle('grab', !!pick(p[0], p[1], 16)); return; }
      if (!down.moved && Math.hypot(p[0] - down.p[0], p[1] - down.p[1]) > 5) { down.moved = true; if (down.hd && !drag) begin(down.hd, down.p[0], down.p[1]); }
      if (drag) { drag.drag(p[0], p[1]); changed(); }
    });
    function lift(e) {
      if (!down) return;
      var tap = !down.moved && !(down.hd && !down.hd.area), was = drag;
      down = null; drag = null; cv.classList.remove('grabbing');
      if (was) redraw();
      if (tap && e.type === 'pointerup') { if (st.fresh) play(); else toggle(); }
    }
    cv.addEventListener('pointerup', lift); cv.addEventListener('pointercancel', lift);

    /* keys: space plays or pauses, the arrows step, Escape closes what is open over the stage.
       Space is play or pause wherever the focus is, as in a video player, except on the controls that
       belong to a card, the chapter list or an open entry (there it presses the control, as usual; Enter
       presses any button). On the speed list the left and right arrows still step; up and down change the speed. */
    function ownSpace(t) { return !!(t && t.closest && t.closest('.lp-side, .lp-over, .lp-term')); }
    document.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var t = e.target, tag = t && t.tagName, space = e.key === ' ' || e.key === 'Spacebar', arrow = e.key === 'ArrowRight' || e.key === 'ArrowLeft';
      if (e.key === 'Escape') { if (!over.hidden) { closeOver(); e.preventDefault(); } return; }
      if (tag === 'TEXTAREA' || (tag === 'INPUT' && !(space && t.type === 'range')) || (tag === 'SELECT' && !arrow)) return;
      if (space) { if ((tag === 'BUTTON' || tag === 'A') && ownSpace(t)) return; e.preventDefault(); spaceHeld = true; if (e.repeat) return; if (st.fresh) play(); else toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    });
    /* a focused button would be pressed when the space bar comes up: stop that when space was taken as play or pause */
    document.addEventListener('keyup', function (e) { if ((e.key === ' ' || e.key === 'Spacebar') && spaceHeld) { spaceHeld = false; e.preventDefault(); } });

    function themeChanged() { readTheme(); redraw(); }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
    new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    if (window.ResizeObserver) new ResizeObserver(function () { redraw(); }).observe(stage);
    window.addEventListener('resize', function () { fit(); paginate(); redraw(); });
    if (window.ResizeObserver) new ResizeObserver(function () { paginate(); }).observe(pane);
    document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });

    fit(); setTab('card'); enter(0); st.p = 0; drawNow();
    return {
      plan: P, play: play, pause: pause, toggle: toggle, next: next, prev: prev, seek: seek, goStep: goStep, redraw: redraw,
      state: function () { return { step: st.idx, p: st.p, playing: st.playing, time: now(), total: total, speed: st.speed, voice: st.voice, s: st.s }; },
      handles: handles, openTerm: openTerm
    };
  }

  return {
    mount: mount, plan: plan, stepSeconds: stepSeconds, words: words, plain: plain, termsIn: termsIn, slug: slug, makeG: makeG,
    C: C, cl: cl, lerp: lerp, ease: ease, out: out, sub: sub, N: N, PT: PT, al: al, rgb: rgb, esc: esc, clock: clock
  };
})();
if (typeof module !== 'undefined') module.exports = LessonPlayer;
