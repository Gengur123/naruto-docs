/* lesson.js: a tiny lesson, to copy from. Two values, a weight, and their blend.
   One script that defines one global, the lesson object. The player is already loaded,
   so its helpers can be taken from LessonPlayer. */
var EXAMPLE_LESSON = (function () {
  'use strict';
  var LP = LessonPlayer, lerp = LP.lerp, sub = LP.sub, ease = LP.ease, cl = LP.cl, N = LP.N;
  var LEFT = 10, RIGHT = 30;

  /* The line the two values sit on, sized from the stage. */
  function track(g) { var m = Math.max(48, g.w * 0.16); return { x0: m, x1: g.w - m, y: g.h * 0.5 }; }

  /* The picture every step shares. `show` is how much of the line is drawn, 0 to 1.
     `w` is the weight, or null to leave the moving dot out. `shares` fades the bars in. */
  function picture(g, show, w, shares) {
    var T = track(g), C = g.C, taken = [];
    g.line(T.x0, T.y, lerp(T.x0, T.x1, show), T.y, C.rule, 3);
    g.dot(T.x0, T.y, 7 * g.fs, C.left);
    g.label(String(LEFT), [[T.x0, T.y - 16 * g.fs, 'center']], { size: 15, bold: true, mono: true, col: C.left }, taken);
    g.alpha(show, function () {
      g.dot(T.x1, T.y, 7 * g.fs, C.right);
      g.label(String(RIGHT), [[T.x1, T.y - 16 * g.fs, 'center']], { size: 15, bold: true, mono: true, col: C.right }, taken);
    });
    if (w === null) return;
    var x = lerp(T.x0, T.x1, w), value = lerp(LEFT, RIGHT, w);
    g.alpha(shares, function () {
      /* each value's share, as a bar under the line: the nearer end has the longer bar */
      var by = T.y + 30 * g.fs, bh = 10 * g.fs;
      g.rect(T.x0, by, x - T.x0, bh, { fill: C.right });
      g.rect(x, by, T.x1 - x, bh, { fill: C.left });
      g.text('share of ' + RIGHT + ': ' + N(w, 2), T.x0, by + bh + 16 * g.fs, { size: 12, col: C.right });
      g.text('share of ' + LEFT + ': ' + N(1 - w, 2), T.x1, by + bh + 16 * g.fs, { size: 12, col: C.left, align: 'right' });
    });
    g.dot(x, T.y, 9 * g.fs, C.mix);
    g.label(N(value, 1), [[x, T.y - 18 * g.fs, 'center'], [x, T.y + 26 * g.fs, 'center']], { size: 15, bold: true, mono: true, col: C.mix, bg: true }, taken);
  }

  /* One handle for both steps that have one: the dot, dragged along the line. */
  function dotHandle(g, s) {
    var T = track(g);
    return [{ x: lerp(T.x0, T.x1, s.w), y: T.y, drag: function (x) { s.w = cl((x - T.x0) / (T.x1 - T.x0), 0, 1); } }];
  }

  function sum(w) {
    return '<span class="n">' + LEFT + ' × ' + N(1 - w, 2) + ' + ' + RIGHT + ' × ' + N(w, 2) + ' = ' + N(lerp(LEFT, RIGHT, w), 2) + '</span>';
  }

  return {
    title: 'Blending two values',
    tokens: { left: '--left', right: '--right', mix: '--mix' },
    legend: [
      { token: '--left', text: 'the value on the left' },
      { token: '--right', text: 'the value on the right' },
      { token: '--mix', text: 'the value in between' },
    ],
    chapters: [
      { title: 'Two values', steps: [
        {
          caption: 'Two values sit at the ends of a line.',
          say: 'Start with two numbers, ten and thirty, one at each end of a line.',
          card: '<p>The left end is <span class="n">' + LEFT + '</span> and the right end is <span class="n">' + RIGHT + '</span>. Every place on the line between them is a value between them.</p>' +
            '<p class="sub">Press play for the film, or use the arrow keys to go one step at a time.</p>',
          draw: function (g, p) { picture(g, ease(p), null, 0); },
        },
        {
          caption: 'A [[weight]] from 0 to 1 picks a place between them.',
          say: 'Now slide a dot along the line. How far along it sits is called the weight.',
          drag: 'the green dot',
          state: function () { return { w: 0.25 }; },
          handles: dotHandle,
          card: function (s) {
            return '<p>The [[weight]] is how far along the line the dot is: <span class="n">0</span> at the left end, <span class="n">1</span> at the right end.</p>' +
              '<p>Here it is <span class="n">' + N(s.w, 2) + '</span>, and the dot reads <span class="n">' + N(lerp(LEFT, RIGHT, s.w), 1) + '</span>.</p>';
          },
          /* The frame at p = 0 has the dot on the left end, where the step before ended.
             After a drag the player sets s.touched: show the finished picture. */
          draw: function (g, p, s) { picture(g, 1, s.touched ? s.w : lerp(0, s.w, ease(p)), 0); },
        },
      ] },
      { title: 'The blend', steps: [
        {
          caption: 'The [[blend]] is each value times its share, added up.',
          say: 'The dot\'s value is a bit of each end. The closer end gets the bigger share, and the shares always add up to one.',
          title: 'The sum',
          drag: 'the green dot',
          state: function () { return { w: 0.25 }; },
          handles: dotHandle,
          controls: [{ type: 'range', label: 'weight', min: 0, max: 1, step: 0.05, get: function (s) { return s.w; }, set: function (s, v) { s.w = v; }, fmt: function (v) { return N(v, 2); } }],
          card: function (s) {
            return '<p>The right value takes the [[weight]] as its share. The left value takes what is left, so the two shares add up to 1.</p>' +
              '<p>' + sum(s.w) + '</p>' +
              '<p class="sub">That one line is the whole [[blend]]. Drag the dot, or move the slider, and the sum follows.</p>';
          },
          draw: function (g, p, s) { picture(g, 1, s.w, s.touched ? 1 : sub(p, 0.15, 0.7)); },
        },
      ] },
    ],
  };
})();
