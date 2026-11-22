import {rotate} from '../vendor/vanillajs/modules/math/index.js';
import {ColumnAtlas} from './columns.js';

// The CPU atlas is indexed by azimuth and elevation. Reconstruct each pixel's
// ray with the same camera basis, aspect and vertical FOV as the actor pass.
const vertexSource = `
  attribute vec2 corner;
  uniform vec3 forward, across, vertical;
  varying mediump vec3 ray;
  void main() {
    ray = forward + corner.x * across + corner.y * vertical;
    gl_Position = vec4(corner, 0., 1.);
  }`;
const fragmentSource = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif
  uniform sampler2D atlas;
  uniform vec2 heading, projectionScale;
  uniform float minElevation;
  varying mediump vec3 ray;
  void main() {
    vec3 d = normalize(ray);
    float across = dot(d.xz, vec2(-heading.y, heading.x));
    float along = dot(d.xz, heading);
    float azimuth = length(d.xz) < .00001 ? 0. : atan(across, along);
    float elevation = asin(clamp(d.y, -1., 1.));
    vec2 uv = vec2(.5 + azimuth * projectionScale.x,
                   (elevation - minElevation) * projectionScale.y);
    vec4 pixel = texture2D(atlas, uv);
    if (pixel.a < .5) discard;
    gl_FragColor = pixel;
  }`;

function compile(gl, program, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw Error('Could not create terrain shader.');
  try {
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  } finally {
    gl.deleteShader(shader);
  }
}

export class ColumnLayer {
  constructor(renderer, field, winter, profile) {
    this.renderer = renderer;
    this.profile = profile;
    const gl = renderer.gl;
    this.atlas = new ColumnAtlas(field, winter, profile);
    try {
      this.program = gl.createProgram();
      if (!this.program) throw Error('Could not create terrain program.');
      compile(gl, this.program, gl.VERTEX_SHADER, vertexSource);
      compile(gl, this.program, gl.FRAGMENT_SHADER, fragmentSource);
      gl.bindAttribLocation(this.program, renderer.position, 'corner');
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(this.program));
      this.uniforms = {};
      for (const name of ['forward','across','vertical','atlas','heading','projectionScale','minElevation']) {
        this.uniforms[name] = gl.getUniformLocation(this.program, name);
      }
      this.buffer = gl.createBuffer();
      this.texture = gl.createTexture();
      if (!this.buffer || !this.texture) throw Error('Could not create terrain texture or buffer.');
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      for (const param of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) {
        gl.texParameteri(gl.TEXTURE_2D, param, gl.NEAREST);
      }
      for (const param of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) {
        gl.texParameteri(gl.TEXTURE_2D, param, gl.CLAMP_TO_EDGE);
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.atlas.width, this.atlas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  draw(eye, camera, fov) {
    const r = this.renderer, gl = r.gl, a = this.atlas, u = this.uniforms;
    const forward = rotate(camera, [0,0,-1]), right = rotate(camera, [1,0,0]), up = rotate(camera, [0,1,0]);
    const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight, sy = Math.tan(fov / 2), sx = sy * aspect;
    a.render(eye, forward, fov, aspect);
    gl.useProgram(this.program);
    gl.uniform3fv(u.forward, forward);
    gl.uniform3f(u.across, right[0] * sx, right[1] * sx, right[2] * sx);
    gl.uniform3f(u.vertical, up[0] * sy, up[1] * sy, up[2] * sy);
    gl.uniform2f(u.heading, Math.sin(a.yaw), -Math.cos(a.yaw));
    gl.uniform2f(u.projectionScale, 1 / (2 * a.halfArc), 1 / (a.maxElevation - a.minElevation));
    gl.uniform1f(u.minElevation, a.minElevation);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(u.atlas, 0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, a.width, a.height, gl.RGBA, gl.UNSIGNED_BYTE, a.pixels);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.disableVertexAttribArray(r.color);
    gl.enableVertexAttribArray(r.position);
    gl.vertexAttribPointer(r.position, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(r.program);
  }

  dispose() {
    const gl = this.renderer.gl;
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.program) gl.deleteProgram(this.program);
    this.atlas = this.buffer = this.texture = this.program = null;
  }
}
