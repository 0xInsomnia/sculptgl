import { mat3 } from 'gl-matrix';
import Zone from 'editing/Zone';

// Light for a fixed zone (see editing/Zone.js): the same projected mask the
// lever uses, evaluated per pixel, so the lit area is exactly the area that
// will change, and it stays on the model when the view turns. Needs the
// `vLocal` varying declared by BrushGlow.

var ZoneGlow = {};
var UNIT = 3;

ZoneGlow.vertexDeclarations = 'varying vec3 vLocalNormal;';
ZoneGlow.vertexMain = '  vLocalNormal = aNormal;';

ZoneGlow.fragmentDeclarations = [
  'varying vec3 vLocalNormal;',
  'uniform float uZoneOn;',
  'uniform mat4 uZoneClip;',
  'uniform mat4 uZoneView;',
  'uniform mat3 uZoneNormal;',
  'uniform vec2 uZoneDepth;',
  'uniform sampler2D uZoneMap;',
  'uniform vec3 uZoneColor;',
  'uniform float uZoneSym;',
  'uniform vec3 uZoneSymO;',
  'uniform vec3 uZoneSymN;',
  'float zoneAt(vec3 p, vec3 n) {',
  '  vec4 clip = uZoneClip * vec4(p, 1.0);',
  '  if (clip.w <= 0.0) return 0.0;',
  '  vec2 uv = clip.xy / clip.w * 0.5 + 0.5;',
  '  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return 0.0;',
  '  float w = texture2D(uZoneMap, uv).r;',
  '  float z = (uZoneView * vec4(p, 1.0)).z;',
  '  w *= 1.0 - smoothstep(uZoneDepth.y * 0.6, uZoneDepth.y, abs(z - uZoneDepth.x));',
  '  return w * smoothstep(-0.05, 0.25, (uZoneNormal * n).z);',
  '}'
].join('\n');

// expects the lit colour in `color` (linear)
ZoneGlow.fragmentApply = [
  '  if (uZoneOn > 0.5) {',
  '    vec3 zn = normalize(vLocalNormal);',
  '    float zw = zoneAt(vLocal, zn);',
  '    if (uZoneSym > 0.5) {',
  '      float zd = 2.0 * dot(vLocal - uZoneSymO, uZoneSymN);',
  '      zw = max(zw, zoneAt(vLocal - zd * uZoneSymN, zn - 2.0 * dot(zn, uZoneSymN) * uZoneSymN));',
  '    }',
  '    float edge = smoothstep(0.08, 0.2, zw) * (1.0 - smoothstep(0.2, 0.45, zw));',
  '    color = mix(color, uZoneColor, min(0.85, 0.38 * zw + 0.8 * edge));',
  '  }'
].join('\n');

var normal = mat3.create();

ZoneGlow.install = function (shader) {
  shader.uniformNames.push('uZoneOn', 'uZoneClip', 'uZoneView', 'uZoneNormal', 'uZoneDepth', 'uZoneMap', 'uZoneColor', 'uZoneSym', 'uZoneSymO', 'uZoneSymN');
  var updateUniforms = shader.updateUniforms;
  shader.updateUniforms = function (mesh, main) {
    var gl = mesh.getGL();
    var uniforms = this.uniforms;
    var zone = Zone.state;
    var on = !!zone && !mesh.__frozen && mesh.isVisible();
    gl.uniform1f(uniforms.uZoneOn, on ? 1.0 : 0.0);
    if (on) {
      var mats = Zone.matricesFor(zone, mesh);
      mat3.copy(normal, mats.normalToView);
      gl.uniformMatrix4fv(uniforms.uZoneClip, false, mats.toClip);
      gl.uniformMatrix4fv(uniforms.uZoneView, false, mats.toView);
      gl.uniformMatrix3fv(uniforms.uZoneNormal, false, normal);
      gl.uniform2f(uniforms.uZoneDepth, zone.depth, zone.tolerance);
      gl.uniform3fv(uniforms.uZoneColor, Zone.isActive() ? [1.0, 0.45, 0.08] : [0.25, 0.75, 0.95]);
      var sym = main.getSculptManager().getSymmetry();
      gl.uniform1f(uniforms.uZoneSym, sym ? 1.0 : 0.0);
      gl.uniform3fv(uniforms.uZoneSymO, mesh.getSymmetryOrigin());
      gl.uniform3fv(uniforms.uZoneSymN, mesh.getSymmetryNormal());
      gl.activeTexture(gl.TEXTURE0 + UNIT);
      gl.bindTexture(gl.TEXTURE_2D, Zone.textureFor(gl));
      gl.uniform1i(uniforms.uZoneMap, UNIT);
      gl.activeTexture(gl.TEXTURE0);
    } else {
      // a sampler must always point at a texture unit
      gl.uniform1i(uniforms.uZoneMap, UNIT);
    }
    updateUniforms.call(this, mesh, main);
  };
};

export default ZoneGlow;
