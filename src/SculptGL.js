import 'misc/Polyfill';
import { vec3 } from 'gl-matrix';
import { Manager as HammerManager, Pan, Pinch, Tap } from 'hammerjs';
import Tablet from 'misc/Tablet';
import GuiPen from 'gui/GuiPen';
import BrushGlow from 'render/shaders/BrushGlow';
import Enums from 'misc/Enums';
import Utils from 'misc/Utils';
import Scene from 'Scene';
import Multimesh from 'mesh/multiresolution/Multimesh';

var MOUSE_LEFT = 1;
var MOUSE_MIDDLE = 2;
var MOUSE_RIGHT = 3;

// Manage events
class SculptGL extends Scene {

  constructor() {
    super();

    // all x and y position are canvas based

    // controllers stuffs
    this._mouseX = 0;
    this._mouseY = 0;
    this._lastMouseX = 0;
    this._lastMouseY = 0;
    this._lastScale = 0;

    // NOTHING, MASK_EDIT, SCULPT_EDIT, CAMERA_ZOOM, CAMERA_ROTATE, CAMERA_PAN, CAMERA_PAN_ZOOM_ALT
    this._action = Enums.Action.NOTHING;
    this._lastNbPointers = 0;
    this._isWheelingIn = false;
    this._oneFingerView = false;
    this._touches = new Set(); // fingers currently on the canvas
    this._pen = null; // one-finger stroke driven by the offset pen (see _penDown)
    this._lockMesh = false; // sculpt only the selected mesh // touch: one finger turns the view instead of sculpting

    // masking
    this._maskX = 0;
    this._maskY = 0;
    this._hammer = new HammerManager(this._canvas);

    this._eventProxy = {};

    this.initHammer();
    this.addEvents();
  }

  addEvents() {
    var canvas = this._canvas;

    var cbMouseWheel = this.onMouseWheel.bind(this);
    var cbOnPointer = this.onPointer.bind(this);

    // pointer
    canvas.addEventListener('pointerdown', cbOnPointer, false);
    canvas.addEventListener('pointermove', cbOnPointer, false);
    var cbOnPointerEnd = this.onPointerEnd.bind(this);
    window.addEventListener('pointerup', cbOnPointerEnd, true);
    window.addEventListener('pointercancel', cbOnPointerEnd, true);

    // mouse
    canvas.addEventListener('mousedown', this.onMouseDown.bind(this), false);
    canvas.addEventListener('mouseup', this.onMouseUp.bind(this), false);
    canvas.addEventListener('mouseout', this.onMouseOut.bind(this), false);
    canvas.addEventListener('mouseover', this.onMouseOver.bind(this), false);
    canvas.addEventListener('mousemove', Utils.throttle(this.onMouseMove.bind(this), 16.66), false);
    canvas.addEventListener('mousewheel', cbMouseWheel, false);
    canvas.addEventListener('DOMMouseScroll', cbMouseWheel, false);

    //key
    window.addEventListener('keydown', this.onKeyDown.bind(this), false);
    window.addEventListener('keyup', this.onKeyUp.bind(this), false);

    var cbLoadFiles = this.loadFiles.bind(this);
    var cbStopAndPrevent = this.stopAndPrevent.bind(this);
    // misc
    canvas.addEventListener('webglcontextlost', this.onContextLost.bind(this), false);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored.bind(this), false);
    window.addEventListener('dragenter', cbStopAndPrevent, false);
    window.addEventListener('dragover', cbStopAndPrevent, false);
    window.addEventListener('drop', cbLoadFiles, false);
    document.getElementById('fileopen').addEventListener('change', cbLoadFiles, false);
  }

  onPointer(event) {
    // Fingers report a meaningless pressure (full, or zero on some phones),
    // which silently made the brush bigger or smaller than its circle: only
    // styluses and mice drive the pressure.
    Tablet.pressure = event.pointerType === 'touch' ? 0.5 : event.pressure;
    if (event.pointerType === 'mouse') return;
    if (event.type === 'pointermove') {
      if (this._pen && event.pointerId === this._pen.id) this._penMove(event);
      return;
    }
    // no emulated mouse clicks after a touch: they sculpted a dot under the finger
    event.preventDefault();
    // A finger landing alone starts a new gesture. Without this, after a
    // pinch Hammer can leave the finger count at 2 and the next one-finger
    // stroke turns the view instead of sculpting.
    this._touches.add(event.pointerId);
    if (this._touches.size === 1) {
      this._lastNbPointers = 0;
      if (this._penAvailable()) this._penDown(event);
    } else {
      this._penEnd(); // two fingers: view gestures take over
    }
  }

  onPointerEnd(event) {
    this._touches.delete(event.pointerId);
    if (this._pen && event.pointerId === this._pen.id) this._penEnd();
  }

  ////////////////
  // TOUCH PEN
  ////////////////
  // One finger on a touch screen drives a "pen" whose tip, a little away
  // from the finger, is the point that sculpts: the finger no longer hides
  // the spot. With aiming on, the tip only shows where it would act; holding
  // still for a moment starts the stroke, lifting the finger ends it. Off the
  // model one finger still turns the view, as before.
  _penAvailable() {
    return GuiPen.settings.enabled && !this._oneFingerView && this._meshes.length > 0;
  }

  _penProxy(pen, which) {
    return { pageX: pen.tip.x, pageY: pen.tip.y, which: which };
  }

  _penOnModel(pen) {
    this.setMousePosition(this._penProxy(pen));
    return !!this._picking.intersectionMouseMeshes();
  }

  _penDown(event) {
    var offset = GuiPen.offset();
    var pen = this._pen = {
      id: event.pointerId,
      finger: { x: event.clientX, y: event.clientY },
      tip: { x: event.clientX + offset.x, y: event.clientY + offset.y },
      anchor: { x: event.clientX, y: event.clientY },
      since: performance.now(),
      direction: { x: 0, y: 0 },
      mode: null,
      timer: 0
    };
    this._focusGui = false;
    if (!this._penOnModel(pen)) {
      pen.mode = 'view';
      this.onDeviceDown(this._penProxy(pen, MOUSE_RIGHT));
    } else if (GuiPen.settings.aim) {
      pen.mode = 'aim';
      this.onDeviceMove(this._penProxy(pen)); // brush preview only
      pen.timer = window.setInterval(this._penTick.bind(this), 30);
    } else {
      this._penStart(pen);
    }
    this._penDraw();
  }

  _penStart(pen) {
    pen.mode = 'sculpt';
    window.clearInterval(pen.timer);
    this.onDeviceDown(this._penProxy(pen, MOUSE_LEFT));
  }

  _penTick() {
    var pen = this._pen;
    if (!pen || pen.mode !== 'aim') return;
    if (performance.now() - pen.since >= GuiPen.settings.hold && this._penOnModel(pen)) this._penStart(pen);
    this._penDraw();
  }

  _penMove(event) {
    var pen = this._pen;
    var offset = GuiPen.offset();
    var x = event.clientX + offset.x;
    var y = event.clientY + offset.y;
    // smoothed direction, for the arrow on the tip
    pen.direction.x = 0.7 * pen.direction.x + 0.3 * (x - pen.tip.x);
    pen.direction.y = 0.7 * pen.direction.y + 0.3 * (y - pen.tip.y);
    pen.finger.x = event.clientX;
    pen.finger.y = event.clientY;
    pen.tip.x = x;
    pen.tip.y = y;
    if (pen.mode === 'aim') {
      // moving restarts the hold; tiny tremors do not
      var dx = pen.finger.x - pen.anchor.x;
      var dy = pen.finger.y - pen.anchor.y;
      if (dx * dx + dy * dy > 64) {
        pen.anchor.x = pen.finger.x;
        pen.anchor.y = pen.finger.y;
        pen.since = performance.now();
      }
    }
    this.onDeviceMove(this._penProxy(pen));
    this._penDraw();
  }

  // Light zone on the model under the pen (see BrushGlow)
  _penGlow() {
    var pen = this._pen;
    var picking = this._picking;
    var mesh = pen && pen.mode !== 'view' ? picking.getMesh() : null;
    if (!mesh || !BrushGlow.enabled) {
      if (BrushGlow.state) {
        BrushGlow.state = null;
        this.render();
      }
      return;
    }
    var symmetry = this._sculptManager.getSymmetry() ? this._pickingSym : null;
    BrushGlow.state = {
      mesh: mesh,
      center: picking.getIntersectionPoint().slice(),
      mirror: symmetry && symmetry.getMesh() === mesh ? symmetry.getIntersectionPoint().slice() : null,
      radius: picking.getLocalRadius(),
      color: pen.mode === 'sculpt' ? [1.0, 0.45, 0.08] : [0.25, 0.75, 0.95]
    };
    this.render(); // the light is drawn by the model itself: redraw it
  }

  _penEnd() {
    var pen = this._pen;
    if (!pen) return;
    this._pen = null;
    window.clearInterval(pen.timer);
    if (pen.mode === 'sculpt' || pen.mode === 'view') this.onDeviceUp();
    BrushGlow.state = null;
    this.render(); // remove the brush preview and the light zone
    GuiPen.show(null, null, null);
  }

  _penDraw() {
    var pen = this._pen;
    if (!pen || pen.mode === 'view') return GuiPen.show(null, null, null);
    var progress = Math.min(1, (performance.now() - pen.since) / GuiPen.settings.hold);
    var picked = this._picking.getMesh();
    if (picked) this._penPiece = picked; // the lock button locks the piece last aimed at
    this._penGlow();
    GuiPen.show(pen.finger, pen.tip, pen.mode, progress, pen.direction, picked ? picked.__sglName : '');
  }

  initHammer() {
    this._hammer.options.enable = true;
    this._initHammerRecognizers();
    this._initHammerEvents();
  }

  _initHammerRecognizers() {
    var hm = this._hammer;
    // double tap
    hm.add(new Tap({
      event: 'doubletap',
      pointers: 1,
      taps: 2,
      time: 250, // def : 250.  Maximum press time in ms.
      interval: 450, // def : 300. Maximum time in ms between multiple taps.
      threshold: 5, // def : 2. While doing a tap some small movement is allowed.
      posThreshold: 50 // def : 30. The maximum position difference between multiple taps.
    }));

    // double tap 2 fingers
    hm.add(new Tap({
      event: 'doubletap2fingers',
      pointers: 2,
      taps: 2,
      time: 250,
      interval: 450,
      threshold: 5,
      posThreshold: 50
    }));

    // pan
    hm.add(new Pan({
      event: 'pan',
      pointers: 0,
      threshold: 0
    }));

    // pinch
    hm.add(new Pinch({
      event: 'pinch',
      pointers: 2,
      threshold: 0.1 // Set a minimal thresold on pinch event, to be detected after pan
    }));
    hm.get('pinch').recognizeWith(hm.get('pan'));
  }

  _initHammerEvents() {
    var hm = this._hammer;
    hm.on('panstart', this.onPanStart.bind(this));
    hm.on('panmove', this.onPanMove.bind(this));
    hm.on('panend pancancel', this.onPanEnd.bind(this));

    hm.on('doubletap', this.onDoubleTap.bind(this));
    hm.on('doubletap2fingers', this.onDoubleTap2Fingers.bind(this));
    hm.on('pinchstart', this.onPinchStart.bind(this));
    hm.on('pinchin pinchout', this.onPinchInOut.bind(this));
  }

  stopAndPrevent(event) {
    event.stopPropagation();
    event.preventDefault();
  }

  onContextLost() {
    window.alert('Oops... WebGL context lost.');
  }

  onContextRestored() {
    window.alert('Wow... Context is restored.');
  }

  ////////////////
  // KEY EVENTS
  ////////////////
  onKeyDown(e) {
    this._gui.callFunc('onKeyDown', e);
  }

  onKeyUp(e) {
    this._gui.callFunc('onKeyUp', e);
  }

  ////////////////
  // MOBILE EVENTS
  ////////////////
  onPanStart(e) {
    if (e.pointerType === 'mouse' || this._pen)
      return;
    this._focusGui = false;
    var evProxy = this._eventProxy;
    evProxy.pageX = e.center.x;
    evProxy.pageY = e.center.y;
    this.onPanUpdateNbPointers(Math.min(3, e.pointers.length));
  }

  onPanMove(e) {
    if (e.pointerType === 'mouse' || this._pen)
      return;
    var evProxy = this._eventProxy;
    evProxy.pageX = e.center.x;
    evProxy.pageY = e.center.y;

    var nbPointers = Math.min(3, e.pointers.length);
    if (nbPointers !== this._lastNbPointers) {
      this.onDeviceUp();
      this.onPanUpdateNbPointers(nbPointers);
    }
    this.onDeviceMove(evProxy);

    if (this._isIOS()) {
      window.clearTimeout(this._timerResetPointer);
      this._timerResetPointer = window.setTimeout(function () {
        this._lastNbPointers = 0;
      }.bind(this), 60);
    }
  }

  _isIOS() {
    if (this._isIOS !== undefined) return this._isIOS;
    this._isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return this._isIOS;
  }

  onPanUpdateNbPointers(nbPointers) {
    // called on panstart or panmove (not consistent)
    var evProxy = this._eventProxy;
    evProxy.which = nbPointers === 1 && (this._lastNbPointers >= 1 || this._oneFingerView) ? 3 : nbPointers;
    this._lastNbPointers = nbPointers;
    this.onDeviceDown(evProxy);
  }

  onPanEnd(e) {
    if (e.pointerType === 'mouse' || this._pen)
      return;
    this.onDeviceUp();
    // we need to detect when all fingers are released
    window.setTimeout(function () {
      if (!e.pointers.length) this._lastNbPointers = 0;
    }.bind(this), 60);
  }

  onDoubleTap(e) {
    if (this._focusGui) {
      return;
    }

    var evProxy = this._eventProxy;
    evProxy.pageX = e.center.x;
    evProxy.pageY = e.center.y;
    this.setMousePosition(evProxy);

    var picking = this._picking;
    var res = picking.intersectionMouseMeshes();
    var cam = this._camera;
    var pivot = [0.0, 0.0, 0.0];
    if (!res) {
      return this.resetCameraMeshes();
    }

    vec3.transformMat4(pivot, picking.getIntersectionPoint(), picking.getMesh().getMatrix());
    var zoom = cam._trans[2];
    if (!cam.isOrthographic()) {
      zoom = Math.min(zoom, vec3.dist(pivot, cam.computePosition()));
    }

    cam.setAndFocusOnPivot(pivot, zoom);
    this.render();
  }

  onDoubleTap2Fingers() {
    if (this._focusGui) return;
    this.resetCameraMeshes();
  }

  onPinchStart(e) {
    this._focusGui = false;
    this._lastScale = e.scale;
  }

  onPinchInOut(e) {
    // The old mapping (scale change × 25 wheel steps) zoomed far past the
    // model with a normal pinch on a phone; follow the fingers instead.
    var ratio = e.scale / this._lastScale;
    this._lastScale = e.scale;
    this._camera.pinch(ratio);
    Multimesh.RENDER_HINT = Multimesh.CAMERA;
    this.render();
  }

  resetCameraMeshes(meshes) {
    if (!meshes) meshes = this._meshes;

    if (meshes.length > 0) {
      var pivot = [0.0, 0.0, 0.0];
      var box = this.computeBoundingBoxMeshes(meshes);
      var zoom = 0.8 * this.computeRadiusFromBoundingBox(box);
      zoom *= this._camera.computeFrustumFit();
      vec3.set(pivot, (box[0] + box[3]) * 0.5, (box[1] + box[4]) * 0.5, (box[2] + box[5]) * 0.5);
      this._camera.setAndFocusOnPivot(pivot, zoom);
    } else {
      this._camera.resetView();
    }

    this.render();
  }

  ////////////////
  // LOAD FILES
  ////////////////
  getFileType(name) {
    var lower = name.toLowerCase();
    if (lower.endsWith('.obj')) return 'obj';
    if (lower.endsWith('.sgl')) return 'sgl';
    if (lower.endsWith('.stl')) return 'stl';
    if (lower.endsWith('.ply')) return 'ply';
    if (lower.endsWith('.glb') || lower.endsWith('.vrm')) return 'glb';
    return;
  }

  loadFiles(event) {
    event.stopPropagation();
    event.preventDefault();
    var files = event.dataTransfer ? event.dataTransfer.files : event.target.files;
    for (var i = 0, nb = files.length; i < nb; ++i) {
      var file = files[i];
      var fileType = this.getFileType(file.name);
      this.readFile(file, fileType);
    }
  }

  readFile(file, ftype) {
    var fileType = ftype || this.getFileType(file.name);
    if (!fileType)
      return;

    var reader = new FileReader();
    var self = this;
    reader.onload = function (evt) {
      self.loadScene(evt.target.result, fileType, file.name);
      document.getElementById('fileopen').value = '';
    };

    if (fileType === 'obj')
      reader.readAsText(file);
    else
      reader.readAsArrayBuffer(file);
  }

  ////////////////
  // MOUSE EVENTS
  ////////////////
  onMouseDown(event) {
    event.stopPropagation();
    event.preventDefault();

    this._gui.callFunc('onMouseDown', event);
    this.onDeviceDown(event);
  }

  onMouseMove(event) {
    event.stopPropagation();
    event.preventDefault();

    this._gui.callFunc('onMouseMove', event);
    this.onDeviceMove(event);
  }

  onMouseOver(event) {
    this._focusGui = false;
    this._gui.callFunc('onMouseOver', event);
  }

  onMouseOut(event) {
    this._focusGui = true;
    this._gui.callFunc('onMouseOut', event);
    this.onMouseUp(event);
  }

  onMouseUp(event) {
    event.preventDefault();

    this._gui.callFunc('onMouseUp', event);
    this.onDeviceUp();
  }

  onMouseWheel(event) {
    event.stopPropagation();
    event.preventDefault();

    this._gui.callFunc('onMouseWheel', event);
    var dir = event.wheelDelta === undefined ? -event.detail : event.wheelDelta;
    this.onDeviceWheel(dir > 0 ? 1 : -1);
  }

  ////////////////
  // HANDLES EVENTS
  ////////////////
  onDeviceUp() {
    this.setCanvasCursor('default');
    Multimesh.RENDER_HINT = Multimesh.NONE;
    this._sculptManager.end();

    if (this._action === Enums.Action.MASK_EDIT && this._mesh) {

      if (this._lastMouseX === this._maskX && this._lastMouseY === this._maskY)
        this.getSculptManager().getTool(Enums.Tools.MASKING).invert();
      else
        this.getSculptManager().getTool(Enums.Tools.MASKING).clear();

    }

    this._action = Enums.Action.NOTHING;
    this.render();
    this._stateManager.cleanNoop();
  }

  onDeviceWheel(dir) {
    if (dir > 0.0 && !this._isWheelingIn) {
      this._isWheelingIn = true;
      this._camera.start(this._mouseX, this._mouseY);
    }
    this._camera.zoom(dir * 0.02);
    Multimesh.RENDER_HINT = Multimesh.CAMERA;
    this.render();
    // workaround for "end mouse wheel" event
    if (this._timerEndWheel)
      window.clearTimeout(this._timerEndWheel);
    this._timerEndWheel = window.setTimeout(this._endWheel.bind(this), 300);
  }

  _endWheel() {
    Multimesh.RENDER_HINT = Multimesh.NONE;
    this._isWheelingIn = false;
    this.render();
  }

  setMousePosition(event) {
    this._mouseX = this._pixelRatio * (event.pageX - this._canvasOffsetLeft);
    this._mouseY = this._pixelRatio * (event.pageY - this._canvasOffsetTop);
  }

  onDeviceDown(event) {
    if (this._focusGui)
      return;

    this.setMousePosition(event);

    var mouseX = this._mouseX;
    var mouseY = this._mouseY;
    var button = event.which;

    var canEdit = false;
    if (button === MOUSE_LEFT)
      canEdit = this._sculptManager.start(event.shiftKey);

    if (button === MOUSE_LEFT && canEdit)
      this.setCanvasCursor('none');

    if (button === MOUSE_RIGHT && event.ctrlKey)
      this._action = Enums.Action.CAMERA_ZOOM;
    else if (button === MOUSE_MIDDLE)
      this._action = Enums.Action.CAMERA_PAN;
    else if (!canEdit && event.ctrlKey) {
      this._maskX = mouseX;
      this._maskY = mouseY;
      this._action = Enums.Action.MASK_EDIT;
    } else if ((!canEdit || button === MOUSE_RIGHT) && event.altKey)
      this._action = Enums.Action.CAMERA_PAN_ZOOM_ALT;
    else if (button === MOUSE_RIGHT || (button === MOUSE_LEFT && !canEdit))
      this._action = Enums.Action.CAMERA_ROTATE;
    else
      this._action = Enums.Action.SCULPT_EDIT;

    if (this._action === Enums.Action.CAMERA_ROTATE || this._action === Enums.Action.CAMERA_ZOOM)
      this._camera.start(mouseX, mouseY);

    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;
  }

  getSpeedFactor() {
    return this._cameraSpeed / (this._canvasHeight * this.getPixelRatio());
  }

  onDeviceMove(event) {
    if (this._focusGui)
      return;
    this.setMousePosition(event);

    var mouseX = this._mouseX;
    var mouseY = this._mouseY;
    var action = this._action;
    var speedFactor = this.getSpeedFactor();

    if (action === Enums.Action.CAMERA_ZOOM || (action === Enums.Action.CAMERA_PAN_ZOOM_ALT && !event.altKey)) {

      Multimesh.RENDER_HINT = Multimesh.CAMERA;
      this._camera.zoom((mouseX - this._lastMouseX + mouseY - this._lastMouseY) * speedFactor);
      this.render();

    } else if (action === Enums.Action.CAMERA_PAN_ZOOM_ALT || action === Enums.Action.CAMERA_PAN) {

      Multimesh.RENDER_HINT = Multimesh.CAMERA;
      this._camera.translate((mouseX - this._lastMouseX) * speedFactor, (mouseY - this._lastMouseY) * speedFactor);
      this.render();

    } else if (action === Enums.Action.CAMERA_ROTATE) {

      Multimesh.RENDER_HINT = Multimesh.CAMERA;
      if (!event.shiftKey)
        this._camera.rotate(mouseX, mouseY);
      this.render();

    } else {

      Multimesh.RENDER_HINT = Multimesh.PICKING;
      this._sculptManager.preUpdate();

      if (action === Enums.Action.SCULPT_EDIT) {
        Multimesh.RENDER_HINT = Multimesh.SCULPT;
        this._sculptManager.update(this);
        if (this.getMesh().isDynamic)
          this._gui.updateMeshInfo();
      }
    }

    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;
    this.renderSelectOverRtt();
  }
}

export default SculptGL;
