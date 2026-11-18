import { mat3, mat4, vec3 } from 'gl-matrix';

// Zone + lever editing for touch screens.
//
// A zone is a 2D shape (circle, ellipse, rectangle or a free outline) drawn
// on the screen and "projected" onto the model from the point of view it was
// fixed in, like a slide projector: it stays glued to the model when the
// view turns. Only the surface facing that view, at about the depth of the
// touched point, is taken (not the back of the body behind it). The edge is
// soft. A vertical lever then applies the current tool to the zone: up adds
// / raises, down digs / lowers. Each push of the lever is one undo step.

var MASK_W = 256;

var Zone = {
  state: null, // the fixed zone, see Zone.fix
  soft: 0.35 // width of the soft edge, as a share of the zone size
};

// ----------------------------------------------------------------- mask
function smoothstep(a, b, x) {
  var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Fills a mask (0..255, row 0 = top of the screen) for the shape.
function rasterize(spec, width, height, soft) {
  var w = MASK_W;
  var h = Math.max(1, Math.round(MASK_W * height / width));
  var data = new Uint8Array(w * h);
  var sx = width / w;
  var sy = height / h;
  var x, y;
  if (spec.shape === 'lasso') {
    // inside test, then a few box blurs for the soft edge
    var poly = spec.polygon;
    for (y = 0; y < h; ++y) {
      var py = (y + 0.5) * sy;
      var nodes = [];
      for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        var a = poly[i];
        var b = poly[j];
        if ((a[1] < py) !== (b[1] < py)) nodes.push(a[0] + (py - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      nodes.sort(function (m, n) {
        return m - n;
      });
      for (var k = 0; k + 1 < nodes.length; k += 2) {
        var x0 = Math.max(0, Math.ceil(nodes[k] / sx - 0.5));
        var x1 = Math.min(w - 1, Math.floor(nodes[k + 1] / sx - 0.5));
        for (x = x0; x <= x1; ++x) data[y * w + x] = 255;
      }
    }
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    poly.forEach(function (p) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    });
    var radius = Math.round(soft * 0.5 * Math.min(maxX - minX, maxY - minY) / sx / 3);
    if (radius > 0) {
      // keep the inside solid: blur, then only let the blur eat inwards
      var solid = data.slice();
      for (var pass = 0; pass < 3; ++pass) boxBlur(data, w, h, radius);
      for (var q = 0; q < data.length; ++q) data[q] = solid[q] ? Math.min(255, data[q] * 2) : 0;
    }
  } else {
    var cx = spec.cx;
    var cy = spec.cy;
    var hw = Math.max(1, spec.hw);
    var hh = Math.max(1, spec.shape === 'circle' ? spec.hw : spec.hh);
    for (y = 0; y < h; ++y) {
      var dy = ((y + 0.5) * sy - cy) / hh;
      for (x = 0; x < w; ++x) {
        var dx = ((x + 0.5) * sx - cx) / hw;
        var r = spec.shape === 'rect' ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.sqrt(dx * dx + dy * dy);
        data[y * w + x] = Math.round(255 * (1 - smoothstep(1 - soft, 1, r)));
      }
    }
  }
  return { data: data, w: w, h: h };
}

function boxBlur(data, w, h, r) {
  var tmp = new Float32Array(data.length);
  var x, y, k, sum;
  for (y = 0; y < h; ++y) {
    sum = 0;
    for (k = -r; k <= r; ++k) sum += data[y * w + Math.min(w - 1, Math.max(0, k))];
    for (x = 0; x < w; ++x) {
      tmp[y * w + x] = sum / (2 * r + 1);
      sum += data[y * w + Math.min(w - 1, x + r + 1)] - data[y * w + Math.max(0, x - r)];
    }
  }
  for (x = 0; x < w; ++x) {
    sum = 0;
    for (k = -r; k <= r; ++k) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (y = 0; y < h; ++y) {
      data[y * w + x] = Math.round(sum / (2 * r + 1));
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
}

function sampleMask(mask, u, v) {
  if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0;
  var x = u * mask.w - 0.5;
  var y = (1 - v) * mask.h - 0.5;
  var x0 = Math.max(0, Math.floor(x));
  var y0 = Math.max(0, Math.floor(y));
  var x1 = Math.min(mask.w - 1, x0 + 1);
  var y1 = Math.min(mask.h - 1, y0 + 1);
  var fx = Math.min(1, Math.max(0, x - x0));
  var fy = Math.min(1, Math.max(0, y - y0));
  var d = mask.data;
  var top = d[y0 * mask.w + x0] * (1 - fx) + d[y0 * mask.w + x1] * fx;
  var bottom = d[y1 * mask.w + x0] * (1 - fx) + d[y1 * mask.w + x1] * fx;
  return (top * (1 - fy) + bottom * fy) / 255;
}

// ------------------------------------------------------------- weights
var _p = vec3.create();
var _n = vec3.create();
var _clip = [0, 0, 0, 0];

// Weight of a point (mesh space) for the zone: inside the mask, facing the
// view the zone was fixed in, near the depth of the touched surface.
function weightAt(zone, toClip, toView, normalToView, p, n) {
  var x = p[0];
  var y = p[1];
  var z = p[2];
  var m = toClip;
  _clip[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  _clip[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  _clip[3] = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (_clip[3] <= 0) return 0;
  var u = (_clip[0] / _clip[3]) * 0.5 + 0.5;
  var v = (_clip[1] / _clip[3]) * 0.5 + 0.5;
  var w = sampleMask(zone.mask, u, v);
  if (w <= 0) return 0;
  var mv = toView;
  var viewZ = mv[2] * x + mv[6] * y + mv[10] * z + mv[14];
  var dz = Math.abs(viewZ - zone.depth);
  w *= 1 - smoothstep(zone.tolerance * 0.6, zone.tolerance, dz);
  if (w <= 0) return 0;
  var nm = normalToView;
  var nz = nm[2] * n[0] + nm[5] * n[1] + nm[8] * n[2];
  return w * smoothstep(-0.05, 0.25, nz);
}

function mirror(out, p, origin, normal) {
  var d = 2 * ((p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1] + (p[2] - origin[2]) * normal[2]);
  out[0] = p[0] - d * normal[0];
  out[1] = p[1] - d * normal[1];
  out[2] = p[2] - d * normal[2];
  return out;
}

function mirrorVector(out, v, normal) {
  var d = 2 * (v[0] * normal[0] + v[1] * normal[1] + v[2] * normal[2]);
  out[0] = v[0] - d * normal[0];
  out[1] = v[1] - d * normal[1];
  out[2] = v[2] - d * normal[2];
  return out;
}

// Matrices taking mesh space to the zone's clip / view space.
Zone.matricesFor = function (zone, mesh) {
  var toClip = mat4.create();
  var toView = mat4.create();
  var normalToView = mat3.create();
  mat4.mul(toClip, zone.projView, mesh.getMatrix());
  mat4.mul(toView, zone.view, mesh.getMatrix());
  mat3.normalFromMat4(normalToView, toView);
  return { toClip: toClip, toView: toView, normalToView: normalToView };
};

function collect(zone, meshes, symmetry) {
  var p2 = vec3.create();
  var n2 = vec3.create();
  zone.targets = [];
  meshes.forEach(function (mesh) {
    var mats = Zone.matricesFor(zone, mesh);
    var vAr = mesh.getVertices();
    var nAr = mesh.getNormals();
    var origin = mesh.getSymmetryOrigin();
    var normal = mesh.getSymmetryNormal();
    var verts = [];
    var w1 = [];
    var w2 = [];
    for (var i = 0, n = mesh.getNbVertices(); i < n; ++i) {
      vec3.set(_p, vAr[i * 3], vAr[i * 3 + 1], vAr[i * 3 + 2]);
      vec3.set(_n, nAr[i * 3], nAr[i * 3 + 1], nAr[i * 3 + 2]);
      var a = weightAt(zone, mats.toClip, mats.toView, mats.normalToView, _p, _n);
      var b = 0;
      if (symmetry) {
        mirror(p2, _p, origin, normal);
        mirrorVector(n2, _n, normal);
        b = weightAt(zone, mats.toClip, mats.toView, mats.normalToView, p2, n2);
      }
      if (a > 0.002 || b > 0.002) {
        verts.push(i);
        w1.push(a);
        w2.push(b);
      }
    }
    if (verts.length) {
      zone.targets.push({
        mesh: mesh,
        verts: new Uint32Array(verts),
        w1: new Float32Array(w1),
        w2: new Float32Array(w2)
      });
    }
  });
}

// --------------------------------------------------------------- fixing
// spec: { shape, cx, cy, hw, hh, polygon } in canvas pixels.
// meshes: the pieces that can be edited. Returns the zone, or null when
// the shape does not cover any of them.
Zone.fix = function (main, spec, meshes) {
  var camera = main.getCamera();
  var width = main.getCanvasWidth();
  var height = main.getCanvasHeight();
  var projView = mat4.create();
  mat4.mul(projView, camera.getProjection(), camera.getView());
  var zone = {
    spec: spec,
    projView: projView,
    view: mat4.clone(camera.getView()),
    up: [0, 0, 0],
    width: width,
    height: height,
    soft: Zone.soft,
    depth: 0,
    tolerance: Infinity,
    mask: rasterize(spec, width, height, Zone.soft),
    texture: null,
    version: 1
  };
  // screen "up" in world space (for the Move tool)
  var view = zone.view;
  vec3.normalize(zone.up, [view[1], view[5], view[9]]);

  // depth of the touched surface: the surface at the centre of the shape,
  // otherwise the middle depth of what the shape covers
  var cx = spec.shape === 'lasso' ? spec.polygon.reduce(function (s, p) {
    return s + p[0];
  }, 0) / spec.polygon.length : spec.cx;
  var cy = spec.shape === 'lasso' ? spec.polygon.reduce(function (s, p) {
    return s + p[1];
  }, 0) / spec.polygon.length : spec.cy;
  var picking = main.getPicking();
  var hit = picking.intersectionMouseMeshes(meshes, cx, cy);
  var depths = [];
  if (hit) {
    var world = vec3.transformMat4(vec3.create(), picking.getIntersectionPoint(), picking.getMesh().getMatrix());
    zone.depth = vec3.transformMat4(vec3.create(), world, view)[2];
  } else {
    meshes.forEach(function (mesh) {
      var mats = Zone.matricesFor(zone, mesh);
      var vAr = mesh.getVertices();
      var nAr = mesh.getNormals();
      for (var i = 0, n = mesh.getNbVertices(); i < n; i += 7) {
        vec3.set(_p, vAr[i * 3], vAr[i * 3 + 1], vAr[i * 3 + 2]);
        vec3.set(_n, nAr[i * 3], nAr[i * 3 + 1], nAr[i * 3 + 2]);
        if (weightAt(zone, mats.toClip, mats.toView, mats.normalToView, _p, _n) > 0.5) {
          var m = mats.toView;
          depths.push(m[2] * _p[0] + m[6] * _p[1] + m[10] * _p[2] + m[14]);
        }
      }
    });
    if (!depths.length) return null;
    depths.sort(function (a, b) {
      return b - a; // nearest first (view space looks down -z)
    });
    zone.depth = depths[Math.floor(depths.length * 0.25)];
  }
  // how deep the zone reaches: about its own size in the world
  var halfPx = spec.shape === 'lasso' ? Math.sqrt(polygonArea(spec.polygon) / Math.PI) : Math.max(spec.hw, spec.shape === 'circle' ? spec.hw : spec.hh);
  zone.worldSize = pixelsToWorld(camera, zone.depth, halfPx, height);
  // How far in depth the zone reaches. Layers (a skirt over shorts, a sleeve
  // over the arm) are a few percent of the model apart and are taken
  // together; the far side of the body faces away and is left out anyway.
  var box = main.computeBoundingBoxMeshes(meshes);
  zone.modelSize = Math.sqrt(Math.pow(box[3] - box[0], 2) + Math.pow(box[4] - box[1], 2) + Math.pow(box[5] - box[2], 2));
  zone.tolerance = Math.max(zone.worldSize * 2, zone.modelSize * 0.05, 1e-4);
  zone.symmetry = main.getSculptManager().getSymmetry();
  collect(zone, meshes, zone.symmetry);
  if (!zone.targets.length) return null;
  Zone.state = zone;
  return zone;
};

// Changing the size or the shape keeps the same view and depth.
Zone.reshape = function (main, spec, meshes) {
  var zone = Zone.state;
  if (!zone) return;
  zone.spec = spec;
  zone.mask = rasterize(spec, zone.width, zone.height, zone.soft);
  zone.version++;
  var halfPx = spec.shape === 'lasso' ? Math.sqrt(polygonArea(spec.polygon) / Math.PI) : Math.max(spec.hw, spec.shape === 'circle' ? spec.hw : spec.hh);
  zone.worldSize = pixelsToWorld(main.getCamera(), zone.depth, halfPx, zone.height);
  zone.tolerance = Math.max(zone.worldSize * 2, zone.modelSize * 0.05, 1e-4);
  zone.symmetry = main.getSculptManager().getSymmetry();
  collect(zone, meshes, zone.symmetry);
};

function polygonArea(poly) {
  var a = 0;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a / 2);
}

function pixelsToWorld(camera, viewZ, pixels, height) {
  if (camera.isOrthographic()) return pixels * 2 / height * Math.abs(camera.getOrthoZoom ? camera.getOrthoZoom() : 1);
  var fov = camera.getFov() * Math.PI / 180;
  return pixels * 2 * Math.abs(viewZ) * Math.tan(fov / 2) / height;
}

Zone.clear = function () {
  Zone.state = null;
};

// ------------------------------------------------------------- applying
// The lever: begin() snapshots the zone, apply(value) recomputes the
// shape from the snapshot (value in -1..1), end() records one undo step.
var stroke = null;

function refresh(mesh, verts) {
  mesh.updateGeometry(mesh.getFacesFromVertices(verts), verts);
  if (mesh.isDynamic) mesh.updateBuffers();
  else mesh.updateGeometryBuffers();
}

Zone.begin = function (main) {
  var zone = Zone.state;
  if (!zone) return false;
  var alive = main.getMeshes();
  zone.targets = zone.targets.filter(function (t) {
    return alive.indexOf(t.mesh) >= 0 && !t.mesh.__frozen;
  });
  if (!zone.targets.length) return false;
  stroke = zone.targets.map(function (t) {
    var mesh = t.mesh;
    var vAr = mesh.getVertices();
    var nAr = mesh.getNormals();
    var count = t.verts.length;
    var before = new Float32Array(count * 3);
    var normals = new Float32Array(count * 3);
    var centre = [0, 0, 0];
    var axis = [0, 0, 0];
    var total = 0;
    for (var k = 0; k < count; ++k) {
      var i = t.verts[k] * 3;
      before[k * 3] = vAr[i];
      before[k * 3 + 1] = vAr[i + 1];
      before[k * 3 + 2] = vAr[i + 2];
      normals[k * 3] = nAr[i];
      normals[k * 3 + 1] = nAr[i + 1];
      normals[k * 3 + 2] = nAr[i + 2];
      var w = t.w1[k];
      centre[0] += vAr[i] * w;
      centre[1] += vAr[i + 1] * w;
      centre[2] += vAr[i + 2] * w;
      axis[0] += nAr[i] * w;
      axis[1] += nAr[i + 1] * w;
      axis[2] += nAr[i + 2] * w;
      total += w;
    }
    if (total > 0) vec3.scale(centre, centre, 1 / total);
    vec3.normalize(axis, axis);
    // screen up of the zone's view, in this mesh's space
    var inv = mat4.invert(mat4.create(), mesh.getMatrix());
    var up = vec3.normalize(vec3.create(), vec3.transformMat3(vec3.create(), zone.up, mat3.fromMat4(mat3.create(), inv)));
    var origin = mesh.getSymmetryOrigin();
    var symN = mesh.getSymmetryNormal();
    return {
      target: t,
      before: before,
      normals: normals,
      after: null,
      centre: centre,
      axis: axis,
      up: up,
      centre2: mirror(vec3.create(), centre, origin, symN),
      axis2: mirrorVector(vec3.create(), axis, symN),
      up2: mirrorVector(vec3.create(), up, symN),
      scale: zone.worldSize / Math.max(1e-6, mesh.getScale())
    };
  });
  return true;
};

var _q = vec3.create();
var _r = vec3.create();

// One vertex: original position p, normal n, weight w, frame (centre, axis,
// up) on its side of the symmetry plane.
function effect(tool, out, p, n, w, value, size, centre, axis, up, neighbours) {
  var d = value * size * 0.35 * w;
  switch (tool) {
  case 'inflate':
    return vec3.scaleAndAdd(out, p, n, d);
  case 'flatten':
    var dist = vec3.dot(vec3.sub(_q, p, centre), axis);
    return vec3.scaleAndAdd(out, p, axis, -dist * Math.min(1, Math.abs(value)) * w * (value >= 0 ? 1 : -1));
  case 'smooth':
    return neighbours ? vec3.lerp(out, p, neighbours, Math.min(1, Math.abs(value) * w)) : vec3.copy(out, p);
  case 'move':
    return vec3.scaleAndAdd(out, p, up, d);
  case 'scale':
    vec3.sub(_q, p, centre);
    return vec3.scaleAndAdd(out, centre, _q, 1 + value * 0.5 * w);
  case 'twist':
    vec3.sub(_q, p, centre);
    var angle = value * Math.PI / 3 * w;
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    vec3.cross(_r, axis, _q);
    var along = vec3.dot(axis, _q) * (1 - cos);
    out[0] = centre[0] + _q[0] * cos + _r[0] * sin + axis[0] * along;
    out[1] = centre[1] + _q[1] * cos + _r[1] * sin + axis[1] * along;
    out[2] = centre[2] + _q[2] * cos + _r[2] * sin + axis[2] * along;
    return out;
  case 'pinch':
    vec3.sub(_q, centre, p);
    vec3.scaleAndAdd(_q, _q, axis, -vec3.dot(_q, axis)); // stay on the surface
    return vec3.scaleAndAdd(out, p, _q, Math.max(-1, Math.min(1, value)) * 0.5 * w);
  default: // 'brush': lift the whole zone along its mean direction
    return vec3.scaleAndAdd(out, p, axis, d);
  }
}

// Average of the ring neighbours of each zone vertex, from the snapshot.
function neighbourAverages(mesh, verts, before) {
  var ring = mesh.getVerticesRingVert();
  var start = mesh.getVerticesRingVertStartCount();
  var vAr = mesh.getVertices();
  var local = new Map();
  for (var k = 0; k < verts.length; ++k) local.set(verts[k], k);
  var out = new Float32Array(verts.length * 3);
  for (var j = 0; j < verts.length; ++j) {
    var i = verts[j];
    var from = start[i * 2];
    var count = start[i * 2 + 1];
    var sx = 0;
    var sy = 0;
    var sz = 0;
    for (var c = 0; c < count; ++c) {
      var nb = ring[from + c];
      var at = local.get(nb);
      if (at !== undefined) {
        sx += before[at * 3];
        sy += before[at * 3 + 1];
        sz += before[at * 3 + 2];
      } else {
        sx += vAr[nb * 3];
        sy += vAr[nb * 3 + 1];
        sz += vAr[nb * 3 + 2];
      }
    }
    if (count) {
      out[j * 3] = sx / count;
      out[j * 3 + 1] = sy / count;
      out[j * 3 + 2] = sz / count;
    } else {
      out.set(before.subarray(j * 3, j * 3 + 3), j * 3);
    }
  }
  return out;
}

Zone.apply = function (main, tool, value) {
  if (!stroke) return;
  var p = vec3.create();
  var n = vec3.create();
  var a = vec3.create();
  var b = vec3.create();
  var avg = vec3.create();
  stroke.forEach(function (s) {
    var t = s.target;
    var mesh = t.mesh;
    var vAr = mesh.getVertices();
    if (tool === 'smooth' && !s.neighbours) s.neighbours = neighbourAverages(mesh, t.verts, s.before);
    for (var k = 0; k < t.verts.length; ++k) {
      vec3.set(p, s.before[k * 3], s.before[k * 3 + 1], s.before[k * 3 + 2]);
      vec3.set(n, s.normals[k * 3], s.normals[k * 3 + 1], s.normals[k * 3 + 2]);
      var nb = s.neighbours ? vec3.set(avg, s.neighbours[k * 3], s.neighbours[k * 3 + 1], s.neighbours[k * 3 + 2]) : null;
      vec3.copy(a, p);
      if (t.w1[k] > 0) effect(tool, a, p, n, t.w1[k], value, s.scale, s.centre, s.axis, s.up, nb);
      if (t.w2[k] > 0) {
        // the mirrored half moves the mirrored way
        effect(tool, b, p, n, t.w2[k], value, s.scale, s.centre2, s.axis2, s.up2, nb);
        vec3.add(a, a, vec3.sub(b, b, p));
      }
      var i = t.verts[k] * 3;
      vAr[i] = a[0];
      vAr[i + 1] = a[1];
      vAr[i + 2] = a[2];
    }
    refresh(mesh, t.verts);
  });
  main.render();
};

Zone.end = function (main) {
  if (!stroke) return;
  var done = stroke;
  stroke = null;
  var changed = false;
  done.forEach(function (s) {
    var vAr = s.target.mesh.getVertices();
    s.after = new Float32Array(s.before.length);
    for (var k = 0; k < s.target.verts.length; ++k) {
      var i = s.target.verts[k] * 3;
      s.after[k * 3] = vAr[i];
      s.after[k * 3 + 1] = vAr[i + 1];
      s.after[k * 3 + 2] = vAr[i + 2];
      if (!changed && (vAr[i] !== s.before[k * 3] || vAr[i + 1] !== s.before[k * 3 + 1] || vAr[i + 2] !== s.before[k * 3 + 2])) changed = true;
    }
  });
  if (!changed) return;
  var write = function (which) {
    done.forEach(function (s) {
      var vAr = s.target.mesh.getVertices();
      var src = s[which];
      for (var k = 0; k < s.target.verts.length; ++k) {
        var i = s.target.verts[k] * 3;
        vAr[i] = src[k * 3];
        vAr[i + 1] = src[k * 3 + 1];
        vAr[i + 2] = src[k * 3 + 2];
      }
      refresh(s.target.mesh, s.target.verts);
    });
    main.render();
  };
  main.getStateManager().pushStateCustom(write.bind(null, 'before'), write.bind(null, 'after'));
};

Zone.isActive = function () {
  return !!stroke;
};

// Mask texture for the light zone shader (see ZoneGlow).
Zone.textureFor = function (gl) {
  var zone = Zone.state;
  if (!zone) return null;
  if (zone.texture && zone.textureVersion === zone.version) return zone.texture;
  if (!zone.texture) zone.texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, zone.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, zone.mask.w, zone.mask.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, zone.mask.data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  zone.textureVersion = zone.version;
  return zone.texture;
};

export default Zone;
