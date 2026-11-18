import TR from 'gui/GuiTR';
import Enums from 'misc/Enums';
import Zone from 'editing/Zone';
import GuiPen from 'gui/GuiPen';

// Touch UI for zone + lever editing (see editing/Zone.js): the
// Brush / Zone switch, the shape and size controls, the outline drawn while
// placing a zone, and the lever on the right edge.

var GuiZone = {
  shape: 'circle', // circle | ellipse | rect | lasso
  width: 60, // half size in CSS pixels
  height: 40,
  soft: 35 // soft edge, % of the size
};

// tool index → what the lever does with it (null: not available with a zone)
var OPS = {};
OPS[Enums.Tools.BRUSH] = 'brush';
OPS[Enums.Tools.INFLATE] = 'inflate';
OPS[Enums.Tools.TWIST] = 'twist';
OPS[Enums.Tools.SMOOTH] = 'smooth';
OPS[Enums.Tools.FLATTEN] = 'flatten';
OPS[Enums.Tools.PINCH] = 'pinch';
OPS[Enums.Tools.CREASE] = 'brush';
OPS[Enums.Tools.DRAG] = 'move';
OPS[Enums.Tools.MOVE] = 'move';
OPS[Enums.Tools.LOCALSCALE] = 'scale';

var LABELS = {
  brush: ['zoneUp', 'zoneDown'],
  inflate: ['zoneInflate', 'zoneDeflate'],
  flatten: ['zoneFlatten', 'zoneSharpen'],
  smooth: ['zoneSmooth', 'zoneSmooth'],
  move: ['zoneMoveUp', 'zoneMoveDown'],
  scale: ['zoneGrow', 'zoneShrink'],
  twist: ['zoneTurnLeft', 'zoneTurnRight'],
  pinch: ['zonePinch', 'zoneSpread']
};

var main = null;
var nodes = {};

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, title, onClick) {
  var node = el('button', 'sgl-btn', text);
  node.type = 'button';
  node.title = title;
  node.setAttribute('aria-label', title);
  node.addEventListener('click', onClick);
  return node;
}

GuiZone.op = function () {
  return OPS[main.getSculptManager().getToolIndex()] || null;
};

GuiZone.editable = function () {
  return main.getMeshes().filter(function (mesh) {
    return !mesh.__frozen && mesh.isVisible();
  });
};

// shape spec in canvas pixels, centred on a point in CSS pixels
GuiZone.spec = function (x, y) {
  var ratio = main.getPixelRatio();
  var ox = main._canvasOffsetLeft || 0;
  var oy = main._canvasOffsetTop || 0;
  return {
    shape: GuiZone.shape,
    cx: (x - ox) * ratio,
    cy: (y - oy) * ratio,
    hw: GuiZone.width * ratio,
    hh: (GuiZone.shape === 'circle' ? GuiZone.width : GuiZone.height) * ratio
  };
};

GuiZone.lassoSpec = function (points) {
  var ratio = main.getPixelRatio();
  var ox = main._canvasOffsetLeft || 0;
  var oy = main._canvasOffsetTop || 0;
  return {
    shape: 'lasso',
    polygon: points.map(function (p) {
      return [(p.x - ox) * ratio, (p.y - oy) * ratio];
    })
  };
};

// ------------------------------------------------------------ overlay
var NS = 'http://www.w3.org/2000/svg';

function svgNode(tag, attrs, parent) {
  var node = document.createElementNS(NS, tag);
  Object.keys(attrs).forEach(function (k) {
    node.setAttribute(k, attrs[k]);
  });
  parent.appendChild(node);
  return node;
}

function buildOverlay() {
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'sgl-zone-overlay');
  svg.setAttribute('aria-hidden', 'true');
  nodes.outline = svgNode('ellipse', { class: 'sgl-zone-outline' }, svg);
  nodes.rect = svgNode('rect', { class: 'sgl-zone-outline' }, svg);
  nodes.path = svgNode('polyline', { class: 'sgl-zone-outline' }, svg);
  nodes.ringBack = svgNode('circle', { r: 30, class: 'sgl-zone-ring-back' }, svg);
  nodes.ring = svgNode('circle', { r: 30, class: 'sgl-zone-ring', transform: '' }, svg);
  document.body.appendChild(svg);
  nodes.overlay = svg;
}

// placing: { x, y, progress } or { points } for the free outline; null hides
GuiZone.showPlacing = function (placing) {
  var svg = nodes.overlay;
  if (!placing) {
    svg.style.display = 'none';
    return;
  }
  svg.style.display = 'block';
  var shape = GuiZone.shape;
  nodes.outline.style.display = shape === 'circle' || shape === 'ellipse' ? 'block' : 'none';
  nodes.rect.style.display = shape === 'rect' ? 'block' : 'none';
  nodes.path.style.display = shape === 'lasso' ? 'block' : 'none';
  var ringOn = shape !== 'lasso';
  nodes.ring.style.display = nodes.ringBack.style.display = ringOn ? 'block' : 'none';
  if (shape === 'lasso') {
    nodes.path.setAttribute('points', placing.points.map(function (p) {
      return p.x + ',' + p.y;
    }).join(' '));
    return;
  }
  var w = GuiZone.width;
  var h = shape === 'circle' ? w : GuiZone.height;
  nodes.outline.setAttribute('cx', placing.x);
  nodes.outline.setAttribute('cy', placing.y);
  nodes.outline.setAttribute('rx', w);
  nodes.outline.setAttribute('ry', h);
  nodes.rect.setAttribute('x', placing.x - w);
  nodes.rect.setAttribute('y', placing.y - h);
  nodes.rect.setAttribute('width', 2 * w);
  nodes.rect.setAttribute('height', 2 * h);
  var c = 2 * Math.PI * 30;
  [nodes.ring, nodes.ringBack].forEach(function (n) {
    n.setAttribute('cx', placing.x);
    n.setAttribute('cy', placing.y);
  });
  nodes.ring.setAttribute('stroke-dasharray', c);
  nodes.ring.setAttribute('stroke-dashoffset', c * (1 - placing.progress));
  nodes.ring.setAttribute('transform', 'rotate(-90 ' + placing.x + ' ' + placing.y + ')');
};

// --------------------------------------------------------------- lever
function buildLever() {
  var lever = el('div', 'sgl-lever');
  var top = el('span', 'sgl-lever-label sgl-lever-top');
  var track = el('div', 'sgl-lever-track');
  var knob = el('div', 'sgl-lever-knob');
  var value = el('span', 'sgl-lever-value');
  var bottom = el('span', 'sgl-lever-label sgl-lever-bottom');
  track.appendChild(knob);
  knob.appendChild(value);
  lever.appendChild(top);
  lever.appendChild(track);
  lever.appendChild(bottom);
  document.body.appendChild(lever);
  nodes.lever = lever;
  nodes.leverTop = top;
  nodes.leverBottom = bottom;
  nodes.knob = knob;
  nodes.leverValue = value;

  var drag = null;
  var setKnob = function (amount) {
    var half = track.clientHeight / 2 - knob.clientHeight / 2;
    knob.style.transform = 'translateY(' + (-amount * half) + 'px)';
    nodes.leverValue.textContent = amount ? (amount > 0 ? '+' : '−') + Math.round(Math.abs(amount) * 100) : '';
  };
  track.addEventListener('pointerdown', function (ev) {
    var op = GuiZone.op();
    if (!op || drag) return;
    if (Zone.state && Zone.state.symmetry !== main.getSculptManager().getSymmetry()) {
      Zone.reshape(main, Zone.state.spec, GuiZone.editable());
    }
    if (!Zone.begin(main)) return;
    ev.preventDefault();
    track.setPointerCapture(ev.pointerId);
    knob.classList.add('sgl-active');
    drag = { id: ev.pointerId, y: ev.clientY, op: op };
    main.render();
  });
  track.addEventListener('pointermove', function (ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var half = track.clientHeight / 2;
    var amount = Math.max(-1, Math.min(1, (drag.y - ev.clientY) / half));
    setKnob(amount);
    var tool = main.getSculptManager().getCurrentTool();
    var gain = 0.25 + 1.5 * (tool._intensity === undefined ? 0.5 : tool._intensity);
    Zone.apply(main, drag.op, amount * gain);
  });
  var end = function (ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    drag = null;
    knob.classList.remove('sgl-active');
    Zone.end(main);
    setKnob(0); // springs back: the change stays, the next push adds to it
    main.render();
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
}

// ----------------------------------------------------------- controls
function slider(label, min, max, get, set) {
  var wrap = el('label', 'sgl-range');
  var input = el('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = 1;
  input.value = get();
  var out = el('output', '', String(get()));
  input.addEventListener('input', function () {
    set(Number(input.value));
    out.textContent = input.value;
  });
  input.addEventListener('change', reshape);
  wrap.appendChild(el('span', '', label));
  wrap.appendChild(input);
  wrap.appendChild(out);
  return wrap;
}

// Size and shape changes act on the fixed zone too, around the same spot.
function reshape() {
  var zone = Zone.state;
  if (!zone) return;
  var spec = zone.spec;
  if (spec.shape === 'lasso' || GuiZone.shape === 'lasso') return; // a free outline is redrawn instead
  var ratio = main.getPixelRatio();
  var next = {
    shape: GuiZone.shape,
    cx: spec.cx,
    cy: spec.cy,
    hw: GuiZone.width * ratio,
    hh: (GuiZone.shape === 'circle' ? GuiZone.width : GuiZone.height) * ratio
  };
  Zone.soft = GuiZone.soft / 100;
  zone.soft = Zone.soft;
  Zone.reshape(main, next, GuiZone.editable());
  main.render();
}

function buildControls(bar) {
  var box = el('div', 'sgl-zone');
  var shapes = el('div', 'sgl-zone-shapes');
  var choices = [['circle', '◯', 'zoneCircle'], ['ellipse', '⬭', 'zoneEllipse'], ['rect', '▭', 'zoneRect'], ['lasso', '✍', 'zoneLasso']];
  var clear = button('✕', TR('zoneClear'), function () {
    Zone.clear();
    GuiZone.sync();
    main.render();
  });
  clear.classList.add('sgl-zone-clear');
  nodes.clear = clear;
  nodes.shapeButtons = choices.map(function (c) {
    var b = button(c[1] + ' ' + TR(c[2]), TR(c[2]), function () {
      GuiZone.shape = c[0];
      GuiZone.sync();
      reshape();
    });
    b.dataset.shape = c[0];
    shapes.appendChild(b);
    return b;
  });
  shapes.appendChild(clear);
  var sizes = el('div', 'sgl-rows');
  nodes.widthRow = slider(TR('zoneWidth'), 10, 250, function () {
    return GuiZone.width;
  }, function (v) {
    GuiZone.width = v;
  });
  nodes.heightRow = slider(TR('zoneHeight'), 10, 250, function () {
    return GuiZone.height;
  }, function (v) {
    GuiZone.height = v;
  });
  nodes.softRow = slider(TR('zoneSoft'), 5, 90, function () {
    return GuiZone.soft;
  }, function (v) {
    GuiZone.soft = v;
    Zone.soft = v / 100;
  });
  sizes.appendChild(nodes.widthRow);
  sizes.appendChild(nodes.heightRow);
  sizes.appendChild(nodes.softRow);
  box.appendChild(shapes);
  box.appendChild(sizes);
  bar.appendChild(box);
  nodes.zone = box;
}

function buildModeSwitch(top) {
  var sw = el('div', 'sgl-mode');
  var pen = button('✎ ' + TR('modePen'), TR('modePen'), function () {
    main._touchMode = 'pen';
    GuiZone.sync();
  });
  var zone = button('◎ ' + TR('modeZone'), TR('modeZone'), function () {
    main._touchMode = 'zone';
    GuiZone.sync();
  });
  sw.appendChild(pen);
  sw.appendChild(zone);
  top.insertBefore(sw, top.lastChild);
  nodes.modePen = pen;
  nodes.modeZone = zone;
}

GuiZone.sync = function () {
  if (!main) return;
  var zoneMode = main._touchMode === 'zone';
  document.body.classList.toggle('sgl-zone-mode', zoneMode);
  nodes.modePen.setAttribute('aria-pressed', !zoneMode);
  nodes.modeZone.setAttribute('aria-pressed', zoneMode);
  nodes.shapeButtons.forEach(function (b) {
    b.setAttribute('aria-pressed', b.dataset.shape === GuiZone.shape);
  });
  nodes.widthRow.querySelector('span').textContent = TR(GuiZone.shape === 'circle' ? 'zoneSize' : 'zoneWidth');
  nodes.widthRow.hidden = GuiZone.shape === 'lasso';
  nodes.heightRow.hidden = GuiZone.shape === 'circle' || GuiZone.shape === 'lasso';
  nodes.clear.hidden = !Zone.state;
  var op = GuiZone.op();
  var showLever = zoneMode && !!Zone.state;
  nodes.lever.hidden = !showLever;
  if (showLever) {
    // fit between the top buttons and the bottom bar, whatever their size
    var bar = document.querySelector('.sgl-bar');
    var barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
    nodes.lever.style.top = '64px';
    nodes.lever.style.bottom = Math.max(8, window.innerHeight - barTop + 8) + 'px';
  }
  nodes.lever.classList.toggle('sgl-disabled', !op);
  if (op) {
    nodes.leverTop.textContent = '▲ ' + TR(LABELS[op][0]);
    nodes.leverBottom.textContent = '▼ ' + TR(LABELS[op][1]);
  } else {
    nodes.leverTop.textContent = '';
    nodes.leverBottom.textContent = TR('zoneNoTool');
  }
  if (!zoneMode) GuiZone.showPlacing(null);
};

GuiZone.hint = function () {
  if (main._touchMode !== 'zone') return null;
  if (!Zone.state) return TR(GuiZone.shape === 'lasso' ? 'zoneHintLasso' : 'zoneHintPlace');
  return GuiZone.op() ? TR('zoneHintLever') : TR('zoneNoTool');
};

GuiZone.init = function (gui, top, bar) {
  main = gui._main;
  if (main._touchMode === undefined) main._touchMode = 'pen';
  ['.sgl-zone-overlay', '.sgl-lever'].forEach(function (sel) {
    var old = document.querySelector(sel);
    if (old) old.remove();
  });
  buildOverlay();
  buildLever();
  buildControls(bar);
  buildModeSwitch(top);
  GuiZone.showPlacing(null);
  GuiZone.sync();
};

// hold time before a zone is fixed: the same as the pen's aiming
GuiZone.holdTime = function () {
  return GuiPen.settings.hold;
};

export default GuiZone;
