import TR from 'gui/GuiTR';

// Touch "pen": the point that sculpts sits a little away from the finger so
// the finger never hides it. This file draws it (pen body from the finger to
// the tip, a cross on the exact point, a ring that fills while aiming, an
// arrow showing the stroke direction) and keeps its settings. The input
// handling lives in SculptGL.js.

var STORAGE = 'sculptgl-pen';

var GuiPen = {
  settings: {
    enabled: true,
    hand: 'right', // the tip goes on the other side of the hand
    distance: 75, // CSS pixels between finger and tip
    aim: true, // aim first, start sculpting after holding still
    hold: 350 // milliseconds to hold still before sculpting starts
  }
};

try {
  var saved = JSON.parse(window.localStorage.getItem(STORAGE) || 'null');
  if (saved && typeof saved === 'object') {
    var s = GuiPen.settings;
    if (typeof saved.enabled === 'boolean') s.enabled = saved.enabled;
    if (saved.hand === 'left' || saved.hand === 'right') s.hand = saved.hand;
    if (saved.distance >= 30 && saved.distance <= 160) s.distance = saved.distance;
    if (typeof saved.aim === 'boolean') s.aim = saved.aim;
    if (saved.hold >= 150 && saved.hold <= 900) s.hold = saved.hold;
  }
} catch (e) {
  // private mode or blocked storage: defaults are fine
}

GuiPen.save = function () {
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify(GuiPen.settings));
  } catch (e) {
    // not critical
  }
};

// Mostly sideways and a little up: a right hand comes from the bottom
// right, so the tip goes to the left.
GuiPen.offset = function () {
  var d = GuiPen.settings.distance;
  var side = GuiPen.settings.hand === 'right' ? -1 : 1;
  return { x: side * 0.88 * d, y: -0.47 * d };
};

// ------------------------------------------------------------ overlay
var NS = 'http://www.w3.org/2000/svg';
var svg = null;
var parts = {};
var RING = 2 * Math.PI * 17;

function make(tag, attrs, parent) {
  var node = document.createElementNS(NS, tag);
  Object.keys(attrs).forEach(function (key) {
    node.setAttribute(key, attrs[key]);
  });
  (parent || svg).appendChild(node);
  return node;
}

function build() {
  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'sgl-pen');
  svg.setAttribute('aria-hidden', 'true');
  document.body.appendChild(svg);
  parts.body = make('line', { class: 'sgl-pen-body' });
  parts.nib = make('line', { class: 'sgl-pen-nib' });
  parts.tip = make('g', { class: 'sgl-pen-tip' });
  make('circle', { r: 17, class: 'sgl-pen-ring-back' }, parts.tip);
  parts.ring = make('circle', { r: 17, class: 'sgl-pen-ring', 'stroke-dasharray': RING, 'stroke-dashoffset': RING, transform: 'rotate(-90)' }, parts.tip);
  make('line', { x1: -12, y1: 0, x2: -4, y2: 0, class: 'sgl-pen-cross' }, parts.tip);
  make('line', { x1: 4, y1: 0, x2: 12, y2: 0, class: 'sgl-pen-cross' }, parts.tip);
  make('line', { x1: 0, y1: -12, x2: 0, y2: -4, class: 'sgl-pen-cross' }, parts.tip);
  make('line', { x1: 0, y1: 4, x2: 0, y2: 12, class: 'sgl-pen-cross' }, parts.tip);
  make('circle', { r: 1.8, class: 'sgl-pen-dot' }, parts.tip);
  parts.arrow = make('path', { d: 'M 26 0 L 16 -6 L 16 6 Z', class: 'sgl-pen-arrow' }, parts.tip);
  parts.label = make('text', { class: 'sgl-pen-label', x: 0, y: -26, 'text-anchor': 'middle' });
}

// state: 'aim' | 'sculpt' | null; progress 0..1 while aiming; direction
// in screen pixels of the last movement (for the arrow); label: part name
GuiPen.show = function (finger, tip, state, progress, direction, label) {
  if (!svg) build();
  if (!state) {
    svg.style.display = 'none';
    return;
  }
  svg.style.display = 'block';
  svg.setAttribute('data-state', state);
  // the pen body stops short of the tip so the cross stays clear
  var dx = tip.x - finger.x;
  var dy = tip.y - finger.y;
  var len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  var ux = dx / len;
  var uy = dy / len;
  var setLine = function (node, a, b) {
    node.setAttribute('x1', finger.x + ux * a);
    node.setAttribute('y1', finger.y + uy * a);
    node.setAttribute('x2', finger.x + ux * b);
    node.setAttribute('y2', finger.y + uy * b);
  };
  setLine(parts.body, 18, Math.max(18, len - 34));
  setLine(parts.nib, Math.max(18, len - 34), Math.max(18, len - 20));
  parts.tip.setAttribute('transform', 'translate(' + tip.x + ' ' + tip.y + ')');
  parts.ring.setAttribute('stroke-dashoffset', RING * (1 - (state === 'aim' ? progress : 1)));
  var moving = direction && (direction.x || direction.y);
  parts.arrow.style.display = state === 'sculpt' && moving ? 'block' : 'none';
  if (moving) {
    var angle = Math.atan2(direction.y, direction.x) * 180 / Math.PI;
    parts.arrow.setAttribute('transform', 'rotate(' + angle + ')');
  }
  parts.label.textContent = label || '';
  parts.label.setAttribute('x', tip.x);
  parts.label.setAttribute('y', tip.y - 26);
};

// ------------------------------------------------------------ settings
GuiPen.initMenu = function (sidebar, main) {
  var s = GuiPen.settings;
  var menu = sidebar.addMenu(TR('penTitle'));
  menu.addCheckbox(TR('penEnabled'), s.enabled, function (value) {
    s.enabled = value;
    GuiPen.save();
  });
  menu.addCombobox(TR('penHand'), s.hand === 'right' ? 0 : 1, function (value) {
    s.hand = Number(value) === 0 ? 'right' : 'left';
    GuiPen.save();
  }, [TR('penHandRight'), TR('penHandLeft')]);
  menu.addSlider(TR('penDistance'), s.distance, function (value) {
    s.distance = value;
    GuiPen.save();
  }, 30, 160, 1);
  menu.addCheckbox(TR('penAim'), s.aim, function (value) {
    s.aim = value;
    GuiPen.save();
  });
  menu.addSlider(TR('penHold'), s.hold, function (value) {
    s.hold = value;
    GuiPen.save();
  }, 150, 900, 10);
  menu.addCheckbox(TR('penLock'), main, '_lockMesh');
  return menu;
};

// What the finger should do with each tool, by tool index (Enums.Tools).
GuiPen.hintKeys = ['hintBrush', 'hintInflate', 'hintTwist', 'hintSmooth', 'hintFlatten', 'hintPinch',
  'hintCrease', 'hintDrag', 'hintPaint', 'hintMove', 'hintMasking', 'hintLocalScale', 'hintTransform'];

export default GuiPen;
