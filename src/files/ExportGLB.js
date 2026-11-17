import { mat3, mat4, vec3 } from 'gl-matrix';
import Import from 'files/ImportGLB';

// Writes the sculpted shape back into the original .glb/.vrm. Only vertex
// positions (and the normals of vertices that moved) change: skeleton,
// skin weights, expressions (morph targets), materials, textures and every
// other byte of the file are copied as they were.

var Export = {};

var MAGIC = 0x46546c67;
var JSON_CHUNK = 0x4e4f534a;

function buildGlb(json, rest) {
  var text = new TextEncoder().encode(JSON.stringify(json));
  var jsonLength = Math.ceil(text.length / 4) * 4;
  var total = 12 + 8 + jsonLength;
  rest.forEach(function (chunk) {
    total += 8 + Math.ceil(chunk.data.length / 4) * 4;
  });
  var out = new Uint8Array(total);
  var view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, JSON_CHUNK, true);
  out.fill(0x20, 20, 20 + jsonLength);
  out.set(text, 20);
  var offset = 20 + jsonLength;
  rest.forEach(function (chunk) {
    var length = Math.ceil(chunk.data.length / 4) * 4;
    view.setUint32(offset, length, true);
    view.setUint32(offset + 4, chunk.type, true);
    out.set(chunk.data, offset + 8);
    offset += 8 + length;
  });
  return out;
}

// Where an accessor's elements live in the binary chunk.
function layout(json, index) {
  var accessor = json.accessors[index];
  var view = json.bufferViews[accessor.bufferView];
  return {
    accessor: accessor,
    start: (view.byteOffset || 0) + (accessor.byteOffset || 0),
    stride: view.byteStride || 12
  };
}

// The base (lowest) resolution of a mesh, with details sculpted at higher
// resolutions folded down into it. Returns a function that puts the mesh
// back to the resolution the user was working at.
function baseResolution(mesh) {
  if (!mesh._meshes || mesh._meshes.length < 2) return { mesh: mesh, restore: function () {} };
  var selected = mesh._sel;
  mesh.selectResolution(0);
  return {
    mesh: mesh._meshes[0],
    restore: function () {
      mesh.selectResolution(selected);
    },
    multires: true
  };
}

// source: what ImportGLB returned, plus for each entry the SculptGL mesh id
// and the mesh matrix right after import. Returns { bytes, report }.
Export.exportGLB = function (main, source) {
  var json = JSON.parse(JSON.stringify(source.gltf.json));
  var bin = source.gltf.rest[0].data.slice();
  var data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  var report = { written: [], skipped: [], multires: [] };
  var meshes = main.getMeshes();

  source.entries.forEach(function (entry) {
    var mesh = null;
    for (var i = 0; i < meshes.length; ++i) {
      if (meshes[i].getID() === entry.id) mesh = meshes[i];
    }
    if (!mesh) {
      report.skipped.push(entry.name + ': removed from the scene');
      return;
    }

    var base = baseResolution(mesh);
    try {
      var level = base.mesh;
      if (level.getNbVertices() !== entry.nbWelded ||
        Import.hashFaces(level.getFaces(), level.getNbFaces() * 4) !== entry.faceHash) {
        report.skipped.push(entry.name + ': topology changed (dynamic topology, remesh or ' +
          'decimation), it can only be saved as OBJ/STL/PLY/SGL');
        return;
      }
      if (base.multires) report.multires.push(entry.name);
      writeEntry(json, data, entry, level, mesh.getMatrix());
      report.written.push(entry.name);
    } finally {
      base.restore();
    }
  });

  var rest = source.gltf.rest.slice();
  rest[0] = { type: rest[0].type, data: bin };
  return { bytes: buildGlb(json, rest), report: report };
};

function writeEntry(json, data, entry, level, sceneMatrix) {
  // Moving or scaling a whole piece with the gizmo also counts: undo the
  // import-time framing, keep what the user added on top of it.
  var relative = mat4.create();
  var undoFraming = mat4.create();
  mat4.invert(undoFraming, entry.sceneMatrix);
  mat4.mul(relative, undoFraming, sceneMatrix);
  var toFile = mat4.create();
  mat4.mul(toFile, entry.inverse, relative);
  var normalToFile = mat3.create();
  mat3.normalFromMat4(normalToFile, toFile);

  var vertices = level.getVertices();
  var normals = level.getNormals();
  var pos = layout(json, entry.position);
  var nor = entry.normal !== undefined && json.accessors[entry.normal].componentType === 5126 &&
    json.accessors[entry.normal].bufferView !== undefined ? layout(json, entry.normal) : null;

  var p = vec3.create();
  var n = vec3.create();
  var epsilon = 1e-7;
  var min = [Infinity, Infinity, Infinity];
  var max = [-Infinity, -Infinity, -Infinity];
  var count = pos.accessor.count;

  for (var v = 0; v < count; ++v) {
    var at = pos.start + v * pos.stride;
    var w = entry.weldOf[v];
    if (w >= 0) {
      vec3.set(p, vertices[w * 3], vertices[w * 3 + 1], vertices[w * 3 + 2]);
      vec3.transformMat4(p, p, toFile);
      var moved = false;
      for (var c = 0; c < 3; ++c) {
        if (Math.abs(p[c] - data.getFloat32(at + c * 4, true)) > epsilon) moved = true;
      }
      if (moved) {
        // untouched vertices keep their exact original bytes
        for (var k = 0; k < 3; ++k) data.setFloat32(at + k * 4, p[k], true);
        if (nor) {
          vec3.set(n, normals[w * 3], normals[w * 3 + 1], normals[w * 3 + 2]);
          vec3.transformMat3(n, n, normalToFile);
          vec3.normalize(n, n);
          var atN = nor.start + v * nor.stride;
          for (var m = 0; m < 3; ++m) data.setFloat32(atN + m * 4, n[m], true);
        }
      }
    }
    for (var d = 0; d < 3; ++d) {
      var value = data.getFloat32(at + d * 4, true);
      if (value < min[d]) min[d] = value;
      if (value > max[d]) max[d] = value;
    }
  }
  pos.accessor.min = min;
  pos.accessor.max = max;
}

export default Export;
