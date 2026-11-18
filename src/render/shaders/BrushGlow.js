// "Light zone": the lit shaders brighten the part of the touched piece that
// the brush will reach (and its mirror when symmetry is on), with the same
// soft falloff as the brush, so you see on the model itself what a stroke
// will affect. SculptGL.js fills BrushGlow.state while the touch pen is on
// the model and asks for a full redraw.

var BrushGlow = {
  enabled: true,
  state: null // { mesh, center, mirror, radius, color } in the mesh's own space
};

BrushGlow.vertexDeclarations = 'varying vec3 vLocal;';
BrushGlow.vertexMain = '  vLocal = aVertex;';

BrushGlow.fragmentDeclarations = [
  'varying vec3 vLocal;',
  'uniform float uGlowOn;',
  'uniform vec3 uGlowCenter;',
  'uniform vec3 uGlowMirror;',
  'uniform float uGlowMirrorOn;',
  'uniform float uGlowRadius;',
  'uniform vec3 uGlowColor;',
  'float glowAt(vec3 center) {',
  '  float d = length(vLocal - center) / uGlowRadius;',
  '  if (d >= 1.0) return 0.0;',
  '  float f = 1.0 - d * d;',
  '  float edge = smoothstep(0.88, 0.95, d) * (1.0 - smoothstep(0.95, 1.0, d));',
  '  return 0.45 * f * f + 0.9 * edge;',
  '}'
].join('\n');

// expects the lit colour in `color` (linear)
BrushGlow.fragmentApply = [
  '  if (uGlowOn > 0.5) {',
  '    float glow = glowAt(uGlowCenter);',
  '    if (uGlowMirrorOn > 0.5) glow = max(glow, glowAt(uGlowMirror));',
  '    color = mix(color, uGlowColor, min(glow, 0.85));',
  '  }'
].join('\n');

BrushGlow.install = function (shader) {
  shader.uniformNames.push('uGlowOn', 'uGlowCenter', 'uGlowMirror', 'uGlowMirrorOn', 'uGlowRadius', 'uGlowColor');
  var updateUniforms = shader.updateUniforms;
  shader.updateUniforms = function (mesh, main) {
    var gl = mesh.getGL();
    var uniforms = this.uniforms;
    var state = BrushGlow.state;
    var on = BrushGlow.enabled && state && state.mesh === mesh && state.radius > 0;
    gl.uniform1f(uniforms.uGlowOn, on ? 1.0 : 0.0);
    if (on) {
      gl.uniform3fv(uniforms.uGlowCenter, state.center);
      gl.uniform1f(uniforms.uGlowMirrorOn, state.mirror ? 1.0 : 0.0);
      gl.uniform3fv(uniforms.uGlowMirror, state.mirror || state.center);
      gl.uniform1f(uniforms.uGlowRadius, state.radius);
      gl.uniform3fv(uniforms.uGlowColor, state.color);
    }
    updateUniforms.call(this, mesh, main);
  };
};

export default BrushGlow;
