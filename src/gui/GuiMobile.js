import TR from 'gui/GuiTR';
import Tools from 'editing/tools/Tools';
import GuiSculptingTools from 'gui/GuiSculptingTools';
import GuiPen from 'gui/GuiPen';
import GuiPieces from 'gui/GuiPieces';
import GuiZone from 'gui/GuiZone';
import Zone from 'editing/Zone';

// Phone and tablet layer on top of the desktop interface:
// - on narrow screens the top menu and the right panel become drawers, so
//   the 3D view gets the whole screen;
// - yagui sliders and colour pickers only listen to the mouse, so finger
//   drags on them are translated into mouse events;
// - on touch screens a quick bar gives big buttons for the actions used
//   every few seconds while sculpting.

var GuiTools = GuiSculptingTools.tools;
var narrow = window.matchMedia('(max-width: 820px)');
var coarse = window.matchMedia('(pointer: coarse)');

var GuiMobile = {
  isPhone: function () {
    return narrow.matches;
  },
  isTouch: function () {
    return coarse.matches || narrow.matches;
  }
};

// --------------------------------------------------- finger → mouse shim
var DRAGGABLE = '.gui-slider, .gui-color-saturation, .gui-color-hue, .gui-color-alpha';
var dragging = null;

function sendMouse(type, target, ev) {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: ev.clientX,
    clientY: ev.clientY,
    screenX: ev.screenX,
    screenY: ev.screenY,
    button: 0,
    buttons: type === 'mouseup' ? 0 : 1
  }));
}

function installShim() {
  document.addEventListener('pointerdown', function (ev) {
    if (ev.pointerType === 'mouse' || dragging) return;
    var target = ev.target.closest && ev.target.closest(DRAGGABLE);
    if (!target) return;
    // also stops the browser's own (delayed) mouse events for this touch
    ev.preventDefault();
    dragging = ev.pointerId;
    sendMouse('mousedown', target, ev);
  }, true);
  window.addEventListener('pointermove', function (ev) {
    if (ev.pointerId !== dragging) return;
    ev.preventDefault();
    sendMouse('mousemove', window, ev);
  }, true);
  var end = function (ev) {
    if (ev.pointerId !== dragging) return;
    dragging = null;
    sendMouse('mouseup', window, ev);
  };
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
}

// ------------------------------------------------------------ drawers
// "Raggio (-X)" → "Raggio": keyboard hints mean nothing on a phone.
function label(key) {
  return TR(key).replace(/\s*\([^)]*\)\s*$/, '');
}

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setupDrawers(gui) {
  var guiMain = gui._guiMain;
  var topbar = gui._topbar;
  var sidebar = gui._sidebar;
  var body = document.body;

  // In phone layout the panels float over the view instead of shrinking it.
  var topbarUpdate = topbar._updateViewportPosition.bind(topbar);
  topbar._updateViewportPosition = function (viewport) {
    if (!GuiMobile.isPhone()) topbarUpdate(viewport);
  };
  var sidebarUpdate = sidebar._updateViewportPosition.bind(sidebar);
  sidebar._updateViewportPosition = function (viewport) {
    if (!GuiMobile.isPhone()) sidebarUpdate(viewport);
  };

  var backdrop = el('div', 'sgl-backdrop');
  body.appendChild(backdrop);

  var close = function () {
    body.classList.remove('sgl-menu-open', 'sgl-panel-open');
    var open = topbar.domUl.querySelector(':scope > li.sgl-open');
    if (open) open.classList.remove('sgl-open');
  };
  var toggle = function (name) {
    var wasOpen = body.classList.contains(name);
    close();
    if (!wasOpen) body.classList.add(name);
  };
  backdrop.addEventListener('click', close);

  // Hover menus do not exist on a phone: a tap opens or closes a menu.
  topbar.domUl.addEventListener('click', function (ev) {
    if (!GuiMobile.isPhone()) return;
    var item = ev.target.closest('li');
    if (!item || item.parentNode !== topbar.domUl) return;
    var wasOpen = item.classList.contains('sgl-open');
    var open = topbar.domUl.querySelector(':scope > li.sgl-open');
    if (open) open.classList.remove('sgl-open');
    if (!wasOpen) item.classList.add('sgl-open');
  });

  var apply = function () {
    body.classList.toggle('sgl-phone', GuiMobile.isPhone());
    body.classList.toggle('sgl-touch', GuiMobile.isTouch());
    if (!GuiMobile.isPhone()) close();
    guiMain._onWindowResize();
  };
  narrow.addEventListener('change', apply);
  coarse.addEventListener('change', apply);
  apply();

  return { toggle: toggle, close: close };
}

// ---------------------------------------------------------- quick bar
function button(label, title, onClick) {
  var node = el('button', 'sgl-btn', label);
  node.type = 'button';
  node.title = title;
  node.setAttribute('aria-label', title);
  node.addEventListener('click', onClick);
  return node;
}

function range(label, min, max, onInput) {
  var wrap = el('label', 'sgl-range');
  var name = el('span', '', label);
  var input = el('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = 1;
  var value = el('output');
  input.addEventListener('input', function () {
    value.textContent = input.value;
    onInput(Number(input.value));
  });
  wrap.appendChild(name);
  wrap.appendChild(input);
  wrap.appendChild(value);
  return { wrap: wrap, input: input, value: value };
}

function setupQuickBar(gui, drawers) {
  var main = gui._main;
  var sculpting = gui._ctrlSculpting;
  var manager = main.getSculptManager();

  var top = el('div', 'sgl-top');
  var bar = el('div', 'sgl-bar');
  var rows = el('div', 'sgl-rows');
  var buttons = el('div', 'sgl-buttons');

  top.appendChild(button('☰', TR('mobileMenu'), function () {
    drawers.toggle('sgl-menu-open');
  }));
  top.appendChild(button('⚙', TR('mobileTools'), function () {
    drawers.toggle('sgl-panel-open');
  }));

  var undo = button('↶', TR('mobileUndo'), function () {
    gui._ctrlStates.onUndo();
  });
  var redo = button('↷', TR('mobileRedo'), function () {
    gui._ctrlStates.onRedo();
  });

  var tool = el('select', 'sgl-select');
  tool.setAttribute('aria-label', label('sculptTool'));
  for (var i = 0; i < Tools.length; ++i) {
    if (!Tools[i]) continue;
    var option = el('option', '', TR(Tools[i].uiName));
    option.value = i;
    tool.appendChild(option);
  }
  tool.addEventListener('change', function () {
    sculpting._ctrlSculpt.setValue(Number(tool.value));
    sync(true);
  });

  var negative = button('−', label('sculptNegative'), function () {
    var widget = GuiTools[manager.getToolIndex()];
    if (widget && widget.toggleNegative) widget.toggleNegative();
    sync(true);
  });
  var symmetry = button('⇋', label('sculptSymmetry'), function () {
    sculpting._ctrlSymmetry.setValue(!manager._symmetry);
    sync(true);
  });
  var pieces = button('🧩', TR('piecesTitle'), function () {
    GuiPieces.toggle(main);
  });

  [undo, redo, tool, negative, symmetry, pieces].forEach(function (node) {
    buttons.appendChild(node);
  });

  // View column on the left edge: one-finger view mode, zoom, frame, turn.
  var camera = main.getCamera();
  var view = el('div', 'sgl-view');
  var look = button('✋', TR('mobileView'), function () {
    main._oneFingerView = !main._oneFingerView;
    sync(true);
  });
  var zoomIn = button('＋', TR('viewZoomIn'), function () {
    camera.pinch(1.3);
    main.render();
  });
  var zoomOut = button('－', TR('viewZoomOut'), function () {
    camera.pinch(1 / 1.3);
    main.render();
  });
  var frame = button('⤢', TR('viewFrame'), function () {
    camera.setViewAngles(0, main._frontYaw || 0);
    main.resetCameraMeshes();
  });
  var turn = button('⟲', TR('viewTurn'), function () {
    // next quarter turn around the model, from the front
    var front = main._frontYaw || 0;
    var steps = Math.round((camera.getViewAngles()[1] - front) / (Math.PI / 2)) + 1;
    camera.setViewAngles(0, front + steps * Math.PI / 2);
    main.render();
  });
  [look, zoomIn, zoomOut, frame, turn].forEach(function (node) {
    view.appendChild(node);
  });
  document.body.appendChild(view);
  // what the finger should do with the current tool
  var hint = el('p', 'sgl-hint');
  hint.title = TR('hintClose');
  hint.addEventListener('click', function () {
    main._hideHints = true;
    sync(true);
  });

  var radius = range(label('sculptRadius'), 5, 300, function (val) {
    var widget = GuiTools[manager.getToolIndex()];
    if (widget && widget._ctrlRadius) widget._ctrlRadius.setValue(val);
  });
  var intensity = range(label('sculptIntensity'), 0, 100, function (val) {
    var widget = GuiTools[manager.getToolIndex()];
    if (widget && widget._ctrlIntensity) widget._ctrlIntensity.setValue(val);
  });
  radius.wrap.classList.add('sgl-range-radius');
  rows.appendChild(radius.wrap);
  rows.appendChild(intensity.wrap);
  bar.appendChild(hint);
  bar.appendChild(buttons);
  bar.appendChild(rows);
  document.body.appendChild(top);
  document.body.appendChild(bar);
  GuiZone.init(gui, top, bar);

  // The quick bar mirrors controls that can also change from the panels or
  // the keyboard, so it re-reads them instead of keeping its own copy.
  var last = '';
  function sync(force) {
    var index = manager.getToolIndex();
    var current = manager.getCurrentTool();
    var widget = GuiTools[index] || {};
    var selected = main.getMesh();
    var state = [index, current._negative, manager._symmetry, main._oneFingerView,
      current._radius, current._intensity, selected && selected.getID(), main._touchMode, !!Zone.state].join();
    if (!force && state === last) return;
    last = state;
    tool.value = index;
    negative.hidden = !widget.toggleNegative;
    negative.setAttribute('aria-pressed', !!current._negative);
    symmetry.setAttribute('aria-pressed', !!manager._symmetry);
    symmetry.hidden = !sculpting._ctrlSymmetry.domContainer || sculpting._ctrlSymmetry.domContainer.hidden;
    look.setAttribute('aria-pressed', !!main._oneFingerView);
    hint.textContent = GuiZone.hint() || TR(GuiPen.hintKeys[index]);
    GuiZone.sync();
    hint.hidden = !!main._hideHints;
    radius.wrap.hidden = !widget._ctrlRadius;
    intensity.wrap.hidden = !widget._ctrlIntensity;
    if (widget._ctrlRadius) {
      radius.input.value = Math.round(widget._ctrlRadius.getValue());
      radius.value.textContent = radius.input.value;
    }
    if (widget._ctrlIntensity) {
      intensity.input.value = Math.round(widget._ctrlIntensity.getValue());
      intensity.value.textContent = intensity.input.value;
    }
  }
  sync(true);
  return sync;
}

GuiMobile.init = function (gui) {
  if (!GuiMobile._shim) {
    installShim();
    GuiMobile._shim = true;
  }
  // initGui can run again (language change): keep one quick bar.
  var old = document.querySelectorAll('.sgl-top, .sgl-bar, .sgl-backdrop, .sgl-view, .sgl-zone-overlay, .sgl-lever');
  for (var i = 0; i < old.length; ++i) old[i].remove();
  if (GuiMobile._timer) window.clearInterval(GuiMobile._timer);
  GuiPieces.init(gui);
  var sync = setupQuickBar(gui, setupDrawers(gui));
  GuiMobile._timer = window.setInterval(sync, 300);
};

export default GuiMobile;
