import Attribute from 'render/Attribute';

// Optional colour texture for the lit shaders (PBR, matcap). Imported
// characters show their real textures this way instead of a blurry
// per-vertex approximation, while keeping the lighting that makes the
// sculpted forms readable. Texels under 50% alpha (cut-out hair, lashes,
// lace) are not drawn.

var AlbedoMap = {};
var UNIT = 2; // 0 is the environment / matcap, 1 is left free

AlbedoMap.vertexDeclarations = [
  'attribute vec2 aTexCoord;',
  'varying vec2 vTexCoord;'
].join('\n');

AlbedoMap.vertexMain = '  vTexCoord = aTexCoord;';

AlbedoMap.fragmentDeclarations = [
  'uniform sampler2D uAlbedoMap;',
  'uniform float uUseAlbedoMap;',
  'varying vec2 vTexCoord;'
].join('\n');

// defines `albedoTex` (sRGB colour of the texture, white without one)
AlbedoMap.fragmentSample = [
  '  vec4 albedoTex = uUseAlbedoMap > 0.5 ? texture2D(uAlbedoMap, vTexCoord) : vec4(1.0);',
  '  if (albedoTex.a < 0.5) discard;'
].join('\n');

function usesMap(mesh) {
  return !!mesh.getAlbedoMap() && mesh.isUsingTexCoords();
}

AlbedoMap.install = function (shader) {
  shader.uniformNames.push('uAlbedoMap', 'uUseAlbedoMap');

  var initAttributes = shader.initAttributes;
  shader.initAttributes = function (gl) {
    initAttributes.call(this, gl);
    this.attributes.aTexCoord = new Attribute(gl, this.program, 'aTexCoord', 2, gl.FLOAT);
  };

  var bindAttributes = shader.bindAttributes;
  shader.bindAttributes = function (mesh) {
    bindAttributes.call(this, mesh);
    var attribute = this.attributes.aTexCoord;
    if (attribute._location < 0) return;
    if (usesMap(mesh)) {
      attribute.bindToBuffer(mesh.getTexCoordBuffer());
    } else {
      var gl = mesh.getGL();
      gl.disableVertexAttribArray(attribute._location);
      gl.vertexAttrib2f(attribute._location, 0.0, 0.0);
    }
  };

  var unbindAttributes = shader.unbindAttributes;
  shader.unbindAttributes = function () {
    unbindAttributes.call(this);
    if (this.attributes.aTexCoord._location >= 0) this.attributes.aTexCoord.unbind();
  };

  var updateUniforms = shader.updateUniforms;
  shader.updateUniforms = function (mesh, main) {
    var gl = mesh.getGL();
    var on = usesMap(mesh);
    gl.activeTexture(gl.TEXTURE0 + UNIT);
    gl.bindTexture(gl.TEXTURE_2D, on ? mesh.getAlbedoMap() : this.getDummyTexture(gl));
    gl.uniform1i(this.uniforms.uAlbedoMap, UNIT);
    gl.uniform1f(this.uniforms.uUseAlbedoMap, on ? 1.0 : 0.0);
    gl.activeTexture(gl.TEXTURE0);
    updateUniforms.call(this, mesh, main);
  };
};

export default AlbedoMap;
