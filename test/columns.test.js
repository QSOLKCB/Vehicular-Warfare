import test from 'node:test';
import assert from 'node:assert/strict';
import {ColumnAtlas} from '../game/columns.js';
import {landscape} from '../game/scenery.js';
import {createWorld, step, receipt, replay, K} from '../sim/world.js';
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';

test('column samples agree with the WebGL triangles on vertices, edges and both sides of a diagonal', () => {
  const w = createWorld(), field = w.field;
  const {land} = landscape(w);
  const [x0,,z0] = field.triangleAt(0, 0)[0][0];
  const size = field.cellSize;
  let probes = 0;
  const observed = {
    cellsX: field.cellsX, cellsZ: field.cellsZ, cellSize: size, triangleAt: field.triangleAt.bind(field),
    sample(x, z) {
      const s = field.sample(x, z);
      // Decode the submitted WebGL XYZ/RGB stream, independently locating
      // its triangle and computing barycentric weights in the XZ plane.
      const gx = (x - x0) / size, gz = (z - z0) / size;
      const i = Math.min(field.cellsX - 1, Math.floor(gx)), j = Math.min(field.cellsZ - 1, Math.floor(gz));
      const base = 36 * (j * field.cellsX + i) + (gx - i + (gz - j) <= 1 ? 0 : 18);
      const ux = land[base+6] - land[base], uz = land[base+8] - land[base+2];
      const vx = land[base+12] - land[base], vz = land[base+14] - land[base+2];
      const px = x - land[base], pz = z - land[base+2];
      const u = (px*vz - pz*vx) / (ux*vz - uz*vx), v = (ux*pz - uz*px) / (ux*vz - uz*vx);
      const y = land[base+1]*(1-u-v) + land[base+7]*u + land[base+13]*v;
      assert.ok(Math.abs(y - s.height) < 1e-10);
      probes++;
      return s;
    }
  };
  const atlas = new ColumnAtlas(observed);
  for (const [x,z] of [[3,3],[3,3.000001],[3,2.999999],[0,0],[-144,-144],[144,144],[0,-144]]) {
    const before = probes;
    atlas.render([x,20,z], [0,0,-1], 1, 1.5);
    assert.equal(probes - before, atlas.samples);
  }
  assert.ok(probes > atlas.mapWidth * atlas.mapHeight);
});

const flatField = () => new Heightfield({
  cellsX:2, cellsZ:2, cellSize:60, originX:-60, originZ:-60, heights:Array(9).fill(0)
});

test('finite planar horizon and sky match the angular rows, including the last sample at the far edge', () => {
  const atlas = new ColumnAtlas(flatField());
  const eye = [0, 7, 0], fov = 1.02;
  atlas.render(eye, [0,0,-1], fov, 1.5);
  for (let x = 0; x < atlas.width; x++) {
    const yaw = ((x + .5) / atlas.width * 2 - 1) * atlas.halfArc;
    const exit = 60 / Math.max(Math.abs(Math.sin(yaw)), Math.abs(Math.cos(yaw)));
    const ridge = Math.atan2(-7, exit);
    for (let y = 0; y < atlas.height; y++) {
      const angle = atlas.minElevation + (y + .5) / atlas.height * (atlas.maxElevation - atlas.minElevation);
      assert.equal(atlas.pixels[(y * atlas.width + x) * 4 + 3], angle <= ridge ? 255 : 0);
    }
  }

  const buffers = [atlas.pixels, atlas.rowSlope, atlas.colours];
  atlas.render([0,7,-61], [0,0,-1], fov, 1.5);
  assert.equal(atlas.samples, 0); assert.ok(!atlas.pixels.some(Boolean));
  atlas.render([0,7,0], [0,1,0], fov, 1.5);
  assert.equal(atlas.halfArc, Math.PI); assert.ok(!atlas.pixels.some(Boolean));
  atlas.render([0,7,0], [0,-1,0], fov, 1.5);
  assert.equal(atlas.halfArc, Math.PI); assert.ok(atlas.pixels.filter((_,i)=>i%4===3).every(a=>a===255));
  for (const [i, a] of [atlas.pixels, atlas.rowSlope, atlas.colours].entries()) assert.equal(a,buffers[i]);
  assert.throws(() => atlas.render(eye, [0,0,NaN], fov, 1.5), RangeError);
  assert.throws(() => atlas.render(eye, [0,0,-1], fov, 0), RangeError);
  assert.throws(() => new ColumnAtlas(flatField(), false, 'huge'), RangeError);
});

test('a near ridge hides changes to the far surface behind it', () => {
  const render = farHeight => {
    const heights = [];
    for (const h of [farHeight, farHeight, 0, 16, 0]) heights.push(h, h, h, h, h);
    const field = new Heightfield({cellsX:4, cellsZ:4, cellSize:10, originX:-20, originZ:-40, heights});
    const atlas = new ColumnAtlas(field);
    atlas.render([0,2,0], [0,0,-1], 1.02, 1.5);
    return atlas.pixels;
  };
  const original = render(0);
  assert.deepEqual(render(12), original);
});

test('drawing alternate profiles leaves all three accepted command traces and replays identical', () => {
  for (const mission of ['sable', 'longwatch', 'frostline']) {
    const baseline = createWorld({seed:123}, mission), displayed = createWorld({seed:123}, mission);
    const survey = new ColumnAtlas(displayed.field, mission === 'frostline');
    const fine = new ColumnAtlas(displayed.field, mission === 'frostline', 'fine');
    for (let tick = 0; tick < 600; tick++) {
      const mask = tick < 140 ? K.up : K.fire;
      step(baseline, mask); step(displayed, mask);
      if (tick % 100 === 0) {
        const atlas = tick % 200 ? survey : fine;
        atlas.render(displayed.player.p, [0,0,-1], 1.02, 1.5);
        assert.ok(atlas.samples > 0 && atlas.samples <= atlas.width * 640);
      }
    }
    const recorded = receipt(displayed);
    assert.deepEqual(recorded, receipt(baseline));
    assert.deepEqual(receipt(replay(JSON.stringify(recorded))), recorded);
  }
});
