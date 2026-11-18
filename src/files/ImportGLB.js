import { mat3, mat4, quat, vec3 } from 'gl-matrix';
import Utils from 'misc/Utils';
import MeshStatic from 'mesh/meshStatic/MeshStatic';

// Reads glTF binary files (.glb, and .vrm which is the same container) for
// sculpting, and remembers where every sculptable vertex came from so that
// the sculpted shape can later be written back into the untouched original
// file (see ExportGLB.js): rig, expressions, materials and textures stay.
//
// One SculptGL mesh is made per vertex buffer (POSITION accessor), because
// VRM-style models share one buffer between several materials: splitting
// them would tear the surface where two materials meet. Vertices duplicated
// along texture seams are welded for sculpting; the seams themselves are
// kept as separate texture coordinates.

var Import = {};

var MAGIC = 0x46546c67;
var JSON_CHUNK = 0x4e4f534a;
var COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
var ARRAYS = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array
};
var NORMALIZE = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

Import.parseGLB = function (buffer) {
  var view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== MAGIC)
    throw new Error('not a binary glTF file');
  if (view.getUint32(4, true) !== 2)
    throw new Error('only glTF 2.0 is supported');
  var total = Math.min(view.getUint32(8, true), buffer.byteLength);
  var chunks = [];
  var offset = 12;
  while (offset + 8 <= total) {
    var length = view.getUint32(offset, true);
    var type = view.getUint32(offset + 4, true);
    if (offset + 8 + length > total) throw new Error('truncated file');
    chunks.push({ type: type, data: new Uint8Array(buffer, offset + 8, length) });
    offset += 8 + length;
  }
  if (!chunks.length || chunks[0].type !== JSON_CHUNK) throw new Error('missing JSON chunk');
  var json = JSON.parse(new TextDecoder().decode(chunks[0].data));
  return { json: json, rest: chunks.slice(1) };
};

// Element i of an accessor as plain numbers (normalized integers → 0..1).
Import.readAccessor = function (gltf, index) {
  var json = gltf.json;
  var accessor = json.accessors[index];
  var size = COMPONENTS[accessor.type];
  var Type = ARRAYS[accessor.componentType];
  var out = new Float32Array(accessor.count * size);
  if (accessor.bufferView === undefined) return out; // all zeros (sparse only)
  var view = json.bufferViews[accessor.bufferView];
  if (view.buffer !== 0 || json.buffers[0].uri !== undefined || !gltf.rest[0])
    throw new Error('external buffers are not supported');
  var bin = gltf.rest[0].data;
  var start = bin.byteOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  var stride = view.byteStride || size * Type.BYTES_PER_ELEMENT;
  var scale = accessor.normalized ? NORMALIZE[accessor.componentType] : 1;
  for (var i = 0; i < accessor.count; ++i) {
    var src = new Type(bin.buffer, start + i * stride, size);
    for (var c = 0; c < size; ++c)
      out[i * size + c] = scale === 1 ? src[c] : Math.max(src[c] / scale, -1);
  }
  if (accessor.sparse) throw new Error('sparse accessors are not supported');
  return out;
};

function readIndices(gltf, primitive, count) {
  if (primitive.indices === undefined) {
    var all = new Uint32Array(count);
    for (var i = 0; i < count; ++i) all[i] = i;
    return all;
  }
  return Import.readAccessor(gltf, primitive.indices);
}

function nodeMatrix(node) {
  if (node.matrix) return mat4.clone(node.matrix);
  var m = mat4.create();
  mat4.fromRotationTranslationScale(m,
    node.rotation || quat.create(),
    node.translation || [0, 0, 0],
    node.scale || [1, 1, 1]);
  return m;
}

// World matrix of every node reachable from the default scene.
function worldMatrices(json) {
  var world = [];
  var visit = function (index, parent) {
    var m = mat4.create();
    mat4.mul(m, parent, nodeMatrix(json.nodes[index]));
    world[index] = m;
    var children = json.nodes[index].children || [];
    for (var i = 0; i < children.length; ++i) visit(children[i], m);
  };
  var scene = json.scenes ? json.scenes[json.scene || 0] : null;
  var roots = scene ? scene.nodes : json.nodes.map(function (n, i) {
    return i;
  });
  for (var i = 0; i < roots.length; ++i) visit(roots[i], mat4.create());
  return world;
}

// Order-sensitive fingerprint of the face list, to check before writing
// back that SculptGL did not renumber the vertices in the meantime.
Import.hashFaces = function (faces, count) {
  var h = 2166136261 >>> 0;
  for (var i = 0, n = count === undefined ? faces.length : count; i < n; ++i) {
    h ^= faces[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
};

Import.importGLB = function (buffer, gl) {
  var gltf = Import.parseGLB(buffer);
  var json = gltf.json;
  var world = worldMatrices(json);
  var meshes = [];
  var entries = [];
  var notes = [];
  var seenAccessor = {};

  (json.nodes || []).forEach(function (node, nodeIndex) {
    if (node.mesh === undefined || !world[nodeIndex]) return;
    var mesh = json.meshes[node.mesh];
    // glTF: a skinned mesh is placed by its joints and ignores its node
    // transform; in the rest pose that leaves its vertices where they are.
    var matrix = node.skin !== undefined ? mat4.create() : world[nodeIndex];

    var groups = {};
    mesh.primitives.forEach(function (primitive, p) {
      var position = primitive.attributes.POSITION;
      if (position === undefined) return;
      var mode = primitive.mode === undefined ? 4 : primitive.mode;
      if (mode !== 4) {
        notes.push((mesh.name || 'mesh') + ': primitive ' + p + ' is not made of triangles, skipped');
        return;
      }
      (groups[position] = groups[position] || []).push(primitive);
    });

    Object.keys(groups).forEach(function (key) {
      var position = Number(key);
      if (seenAccessor[position]) {
        notes.push((node.name || 'node ' + nodeIndex) + ': reuses another mesh, skipped');
        return;
      }
      seenAccessor[position] = true;
      var accessor = json.accessors[position];
      if (accessor.componentType !== 5126 || accessor.sparse) {
        notes.push((mesh.name || 'mesh') + ': compressed or sparse positions, skipped');
        return;
      }
      var entry = buildMesh(gltf, gl, groups[position], position, matrix);
      if (!entry) return;
      entry.name = node.name || mesh.name || 'mesh ' + node.mesh;
      entry.node = nodeIndex;
      meshes.push(entry.mesh);
      entries.push(entry);
    });
  });

  return { meshes: meshes, entries: entries, gltf: gltf, notes: notes, facing: facing(json, world) };
};

// +1 when the character looks towards +Z, -1 towards -Z: toes stick out
// in front of the feet. Without toes, VRM 0.x faces -Z and others +Z.
function facing(json, world) {
  var parent = [];
  (json.nodes || []).forEach(function (node, i) {
    (node.children || []).forEach(function (child) {
      parent[child] = i;
    });
  });
  for (var i = 0; i < (json.nodes || []).length; ++i) {
    var name = json.nodes[i].name || '';
    if (!/toe/i.test(name) || /_end$/i.test(name) || parent[i] === undefined) continue;
    if (!world[i] || !world[parent[i]]) continue;
    var dz = world[i][14] - world[parent[i]][14];
    if (Math.abs(dz) > 1e-4) return dz > 0 ? 1 : -1;
  }
  var ext = json.extensions || {};
  return ext.VRM && !ext.VRMC_vrm ? -1 : 1;
}

function buildMesh(gltf, gl, primitives, position, matrix) {
  var json = gltf.json;
  var points = Import.readAccessor(gltf, position);
  var count = points.length / 3;
  var first = primitives[0].attributes;
  var uv = first.TEXCOORD_0 !== undefined ? Import.readAccessor(gltf, first.TEXCOORD_0) : null;
  if (uv && uv.length !== count * 2) uv = null;

  // which original vertices are drawn, and by which primitive (for colours)
  var owner = new Int32Array(count).fill(-1);
  var triangles = [];
  var trianglePrimitive = [];
  primitives.forEach(function (primitive, p) {
    var indices = readIndices(gltf, primitive, count);
    for (var i = 0; i + 2 < indices.length; i += 3) {
      triangles.push(indices[i], indices[i + 1], indices[i + 2]);
      trianglePrimitive.push(p);
      for (var k = 0; k < 3; ++k) owner[indices[i + k]] = p;
    }
  });
  if (!triangles.length) return null;

  // weld vertices that sit at exactly the same place
  var weldOf = new Int32Array(count).fill(-1);
  var ids = new Map();
  var welded = [];
  var bits = new Uint32Array(points.buffer);
  for (var v = 0; v < count; ++v) {
    if (owner[v] < 0) continue;
    var key = bits[v * 3] + ',' + bits[v * 3 + 1] + ',' + bits[v * 3 + 2];
    var id = ids.get(key);
    if (id === undefined) {
      id = welded.length / 3;
      ids.set(key, id);
      welded.push(points[v * 3], points[v * 3 + 1], points[v * 3 + 2]);
    }
    weldOf[v] = id;
  }

  // One atlas texture per sculptable mesh: each material gets a cell, and
  // its UVs are moved into that cell. A vertex shared by two materials gets
  // one texture coordinate per material (SculptGL keeps UVs per corner).
  var atlas = atlasLayout(gltf, primitives, !!uv);
  var texCoords = [];
  var uvIndex = new Map();
  var cornerUV = function (vertex, primitive) {
    var slot = atlas.slotOf[primitive];
    var key = vertex * atlas.slots.length + slot;
    var index = uvIndex.get(key);
    if (index !== undefined) return index;
    index = texCoords.length / 2;
    uvIndex.set(key, index);
    var cell = atlas.slots[slot];
    var s = 0.5;
    var t = 0.5;
    if (cell.image !== null) {
      s = uv[vertex * 2];
      t = uv[vertex * 2 + 1];
      var tr = cell.transform;
      if (tr) {
        var scale = tr.scale || [1, 1];
        var offset = tr.offset || [0, 0];
        var rotation = tr.rotation || 0;
        var x0 = s * scale[0];
        var y0 = t * scale[1];
        s = Math.cos(rotation) * x0 + Math.sin(rotation) * y0 + offset[0];
        t = -Math.sin(rotation) * x0 + Math.cos(rotation) * y0 + offset[1];
      }
      if (s < 0 || s > 1) s -= Math.floor(s); // tiling cannot cross cells
      if (t < 0 || t > 1) t -= Math.floor(t);
    }
    var x = (cell.column + atlas.inset + s * (1 - 2 * atlas.inset)) / atlas.columns;
    var y = (cell.row + atlas.inset + t * (1 - 2 * atlas.inset)) / atlas.rows;
    texCoords.push(x, 1.0 - y); // textures are uploaded upside down (UNPACK_FLIP_Y)
    return index;
  };

  var faces = [];
  var uvFaces = [];
  for (var t = 0; t < triangles.length; t += 3) {
    var a = weldOf[triangles[t]];
    var b = weldOf[triangles[t + 1]];
    var c = weldOf[triangles[t + 2]];
    if (a === b || b === c || a === c) continue;
    var p = trianglePrimitive[t / 3];
    faces.push(a, b, c, Utils.TRI_INDEX);
    uvFaces.push(cornerUV(triangles[t], p), cornerUV(triangles[t + 1], p), cornerUV(triangles[t + 2], p), Utils.TRI_INDEX);
  }
  if (!faces.length) return null;

  var vertices = new Float32Array(welded);
  var tmp = vec3.create();
  for (var w = 0; w < vertices.length; w += 3) {
    vec3.transformMat4(tmp, [vertices[w], vertices[w + 1], vertices[w + 2]], matrix);
    vertices[w] = tmp[0];
    vertices[w + 1] = tmp[1];
    vertices[w + 2] = tmp[2];
  }

  var mesh = new MeshStatic(gl);
  mesh.setVertices(vertices);
  mesh.setFaces(new Uint32Array(faces));
  mesh.setColors(baseColours(gltf, primitives, owner, weldOf, vertices.length / 3, first));
  mesh.setMaterials(baseMaterials(gltf, primitives, owner, weldOf, vertices.length / 3));
  mesh.initTexCoordsDataFromOBJData(new Float32Array(texCoords), uvFaces);

  var inverse = mat4.create();
  mat4.invert(inverse, matrix);
  var normalMatrix = mat3.create();
  mat3.normalFromMat4(normalMatrix, inverse);

  return {
    mesh: mesh,
    position: position,
    normal: first.NORMAL,
    primitives: primitives,
    owner: owner,
    weldOf: weldOf,
    nbWelded: vertices.length / 3,
    matrix: matrix,
    inverse: inverse,
    normalMatrix: normalMatrix,
    atlas: atlas
  };
}

var ATLAS_SIZE = 2048;

// Cells of the atlas: one per (texture, tint, alpha mode) used by the mesh,
// or a plain colour cell for materials without texture.
function atlasLayout(gltf, primitives, hasUV) {
  var json = gltf.json;
  var slots = [];
  var keys = {};
  var slotOf = primitives.map(function (primitive) {
    var material = (json.materials && json.materials[primitive.material]) || {};
    var pbr = material.pbrMetallicRoughness || {};
    var factor = pbr.baseColorFactor || [1, 1, 1, 1];
    var info = pbr.baseColorTexture;
    var image = null;
    if (hasUV && info && (info.texCoord || 0) === 0 && json.textures && json.textures[info.index]) {
      var source = json.textures[info.index].source;
      if (source !== undefined && json.images[source] && json.images[source].bufferView !== undefined) image = source;
    }
    var mode = material.alphaMode || 'OPAQUE';
    // KHR_texture_transform (VRM uses it e.g. for the irises)
    var transform = image !== null && info.extensions && info.extensions.KHR_texture_transform || null;
    var key = image + '|' + factor.join(',') + '|' + mode + '|' + JSON.stringify(transform);
    if (keys[key] === undefined) {
      keys[key] = slots.length;
      slots.push({ image: image, factor: factor, opaque: mode === 'OPAQUE', transform: transform });
    }
    return keys[key];
  });
  var columns = Math.ceil(Math.sqrt(slots.length));
  var rows = Math.ceil(slots.length / columns);
  slots.forEach(function (slot, i) {
    slot.column = i % columns;
    slot.row = Math.floor(i / columns);
  });
  // a couple of texels of margin so filtering does not bleed between cells
  var cell = ATLAS_SIZE / Math.max(columns, rows);
  return { slots: slots, slotOf: slotOf, columns: columns, rows: rows, inset: Math.min(0.25, 3 / cell) };
}

// Roughness and metalness from the material: glossy defaults made skin and
// cloth look dark and plastic.
// Toon / unlit materials (VRM's MToon, KHR_materials_unlit) are flat
// colour, not metal; their PBR fields are often left out, and glTF's
// default for a missing metalness is "fully metallic", which drew those
// characters dark with black eyes.
function isMatte(json, index) {
  var material = (json.materials && json.materials[index]) || {};
  var ext = material.extensions || {};
  if (ext.KHR_materials_unlit || ext.VRMC_materials_mtoon) return true;
  var vrm = json.extensions && json.extensions.VRM;
  if (vrm) return true; // VRM 0.x: every material is drawn by its own toon shader
  var pbr = material.pbrMetallicRoughness || {};
  // no metalness given and no metal map: treat as "not set", not as metal
  return pbr.metallicFactor === undefined && !pbr.metallicRoughnessTexture;
}

function baseMaterials(gltf, primitives, owner, weldOf, nbWelded) {
  var json = gltf.json;
  var materials = new Float32Array(nbWelded * 3);
  for (var i = 0; i < nbWelded; ++i) {
    materials[i * 3] = 0.8;
    materials[i * 3 + 2] = 1.0; // not masked
  }
  for (var v = 0; v < owner.length; ++v) {
    var w = weldOf[v];
    if (w < 0) continue;
    var index = primitives[owner[v]].material;
    var material = (json.materials && json.materials[index]) || {};
    var pbr = material.pbrMetallicRoughness || {};
    if (isMatte(json, index)) {
      materials[w * 3] = 0.9;
      materials[w * 3 + 1] = 0.0;
    } else {
      materials[w * 3] = pbr.roughnessFactor === undefined ? 1.0 : pbr.roughnessFactor;
      materials[w * 3 + 1] = pbr.metallicFactor;
    }
  }
  return materials;
}

function toSRGB(value) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

// Flat colours to start with: vertex colours when the file has them,
// otherwise the material's base colour. Meshes with textures switch to
// the real textures once they are decoded (see Import.buildAtlases).
function baseColours(gltf, primitives, owner, weldOf, nbWelded, attributes) {
  var json = gltf.json;
  var colours = new Float32Array(nbWelded * 3).fill(1.0);
  var vertexColours = null;
  if (attributes.COLOR_0 !== undefined) {
    try {
      vertexColours = Import.readAccessor(gltf, attributes.COLOR_0);
    } catch (e) {
      vertexColours = null;
    }
  }
  var size = vertexColours ? COMPONENTS[json.accessors[attributes.COLOR_0].type] : 0;
  for (var v = 0; v < owner.length; ++v) {
    var w = weldOf[v];
    if (w < 0) continue;
    var material = json.materials && json.materials[primitives[owner[v]].material];
    var factor = (material && material.pbrMetallicRoughness && material.pbrMetallicRoughness.baseColorFactor) || [1, 1, 1, 1];
    for (var c = 0; c < 3; ++c) {
      var linear = factor[c] * (vertexColours ? vertexColours[v * size + c] : 1);
      colours[w * 3 + c] = toSRGB(Math.min(1, Math.max(0, linear)));
    }
  }
  return colours;
}

function decodeImage(gltf, imageIndex) {
  var json = gltf.json;
  var image = json.images[imageIndex];
  var view = json.bufferViews[image.bufferView];
  var bin = gltf.rest[0].data;
  var bytes = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
  var blob = new Blob([bytes], { type: image.mimeType || 'image/png' });
  return createImageBitmap(blob).catch(function () {
    return null;
  });
}

function cssColour(factor) {
  var c = [0, 1, 2].map(function (i) {
    return Math.round(255 * toSRGB(Math.min(1, Math.max(0, factor[i]))));
  });
  return 'rgb(' + c.join(',') + ')';
}

// Paints each mesh's atlas from the original textures (tinted by the base
// colour factor) and hands it to the mesh. Display only: the textures in
// the exported file are never touched.
Import.buildAtlases = function (result, gl, onMeshPainted) {
  var images = {};
  var load = function (index) {
    if (!images[index]) images[index] = decodeImage(result.gltf, index);
    return images[index];
  };
  return Promise.all(result.entries.map(function (entry) {
    var atlas = entry.atlas;
    var textured = atlas.slots.some(function (slot) {
      return slot.image !== null;
    });
    // flat colours are already in the vertex colours
    if (!textured) return null;
    return Promise.all(atlas.slots.map(function (slot) {
      return slot.image === null ? null : load(slot.image);
    })).then(function (bitmaps) {
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = ATLAS_SIZE;
      var ctx = canvas.getContext('2d');
      var w = ATLAS_SIZE / atlas.columns;
      var h = ATLAS_SIZE / atlas.rows;
      atlas.slots.forEach(function (slot, i) {
        var x = slot.column * w;
        var y = slot.row * h;
        var bitmap = bitmaps[i];
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        var tint = cssColour(slot.factor);
        if (!bitmap) {
          ctx.globalAlpha = slot.opaque ? 1 : slot.factor[3];
          ctx.fillStyle = tint;
          ctx.fillRect(x, y, w, h);
        } else {
          var ix = x + atlas.inset * w;
          var iy = y + atlas.inset * h;
          var iw = w * (1 - 2 * atlas.inset);
          var ih = h * (1 - 2 * atlas.inset);
          if (slot.opaque) {
            ctx.fillStyle = tint; // opaque materials ignore the texture's alpha
            ctx.fillRect(x, y, w, h);
          }
          // the margin repeats the border texels instead of being empty
          ctx.drawImage(bitmap, x, y, w, h);
          ctx.drawImage(bitmap, ix, iy, iw, ih);
          if (slot.factor.slice(0, 3).some(function (f) {
            return f < 1;
          })) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = tint;
            ctx.fillRect(x, y, w, h);
            if (!slot.opaque) {
              ctx.globalCompositeOperation = 'destination-in'; // keep the texture's alpha
              ctx.drawImage(bitmap, x, y, w, h);
              ctx.drawImage(bitmap, ix, iy, iw, ih);
            }
          }
        }
        ctx.restore();
      });
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, null);
      onMeshPainted(entry, texture);
    });
  }));
};

export default Import;
