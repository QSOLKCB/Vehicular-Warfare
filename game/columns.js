// Original CPU terrain pass. The atlas is in azimuth/elevation so a banked
// perspective camera can look it up without pretending the world tilts.
const profiles = Object.freeze({
  survey: {width: 256, height: 160, nearStep: .6, growth: .035, cellFraction: .65},
  fine: {width: 384, height: 240, nearStep: .4, growth: .024, cellFraction: .45}
});

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const halfPi = Math.PI / 2;
const colourScale = 4; // Four colour texels across each authoritative cell.
const maxRange = 1200;
const maxSteps = 640;

function paintMap(atlas, winter) {
  const {field, mapWidth, mapHeight, colours, x0, z0} = atlas;
  const spacing = field.cellSize / colourScale;
  for (let row = 0; row < mapHeight; row++) {
    for (let col = 0; col < mapWidth; col++) {
      const x = x0 + (col + .5) * spacing, z = z0 + (row + .5) * spacing;
      const {height, normal: [nx, ny, nz]} = field.sample(x, z);
      const sun = Math.max(0, -.57 * nx + .68 * ny - .46 * nz);
      // Broken horizontal strata on rock, wind-scoured deposits on the flats.
      const strata = Math.sin(.51 * height + .053 * x + .035 * z);
      const deposit = Math.cos(.068 * x + Math.sin(.051 * z)) + .48 * Math.sin(.117 * z);
      const grain = (Math.imul(col ^ Math.imul(row, 1531), 1597334677) >>> 26) / 64;
      const light = .58 + .44 * sun + .08 * grain + .055 * strata;
      let red, green, blue;
      if (winter) {
        const snow = clamp((ny - .56) * 2.7 + height * .005, 0, 1);
        red = 93 + 137 * snow; green = 117 + 125 * snow; blue = 139 + 108 * snow;
      } else {
        const scrub = clamp((deposit - .25) * ny, 0, 1);
        const crag = clamp((1 - ny) * 1.5 + height * .009, 0, 1);
        red = 194 - 51 * scrub - 34 * crag;
        green = 158 - 20 * scrub - 38 * crag;
        blue = 104 - 9 * scrub + 13 * crag;
      }
      const i = (row * mapWidth + col) * 3;
      colours[i] = red * light; colours[i + 1] = green * light; colours[i + 2] = blue * light;
    }
  }
}

export class ColumnAtlas {
  constructor(field, winter = false, quality = 'survey') {
    if (!Object.hasOwn(profiles, quality)) throw new RangeError('Unknown terrain quality');
    this.field = field;
    this.profile = profiles[quality];
    this.width = this.profile.width;
    this.height = this.profile.height;
    const [x0, , z0] = field.triangleAt(0, 0)[0][0];
    this.x0 = x0; this.z0 = z0;
    this.x1 = x0 + field.cellsX * field.cellSize;
    this.z1 = z0 + field.cellsZ * field.cellSize;
    this.mapWidth = colourScale * field.cellsX;
    this.mapHeight = colourScale * field.cellsZ;
    this.colours = new Uint8ClampedArray(this.mapWidth * this.mapHeight * 3);
    this.pixels = new Uint8Array(this.width * this.height * 4);
    this.rowSlope = new Float64Array(this.height);
    this.bytes = this.colours.byteLength + this.rowSlope.byteLength + this.pixels.byteLength;
    paintMap(this, winter);
  }

  render(eye, forward, fov, aspect) {
    if (!eye.every(Number.isFinite) || !forward.every(Number.isFinite) ||
        eye.length !== 3 || forward.length !== 3 || Math.abs(Math.hypot(...forward) - 1) > 1e-5 ||
        !Number.isFinite(fov) || fov < .2 || fov > 2.5 || !Number.isFinite(aspect) || aspect <= 0)
      throw new RangeError('Invalid terrain camera');

    const pitch = Math.asin(clamp(forward[1], -1, 1));
    this.yaw = Math.atan2(forward[0], -forward[2]);
    // All four corners lie in this spherical cap at every roll angle.
    const cap = Math.atan(Math.tan(fov / 2) * Math.hypot(1, aspect));
    this.minElevation = Math.max(-halfPi, pitch - cap);
    this.maxElevation = Math.min(halfPi, pitch + cap);
    this.halfArc = Math.abs(pitch) + cap >= halfPi ? Math.PI :
      Math.asin(Math.min(1, Math.sin(cap) / Math.cos(pitch)));
    for (let i = 0; i < this.height; i++) {
      const elevation = this.minElevation + (i + .5) / this.height * (this.maxElevation - this.minElevation);
      this.rowSlope[i] = Math.tan(elevation);
    }
    this.pixels.fill(0);
    this.samples = 0;
    for (let col = 0; col < this.width; col++) {
      const azimuth = this.yaw + ((col + .5) / this.width * 2 - 1) * this.halfArc;
      this.drawColumn(col, eye, Math.sin(azimuth), -Math.cos(azimuth));
    }
  }

  drawColumn(col, [ox, oy, oz], dx, dz) {
    // Clip the horizontal ray against the finite field. A parallel ray can
    // lie on an outer edge, where (bound - origin) / direction would be 0/0.
    let entry = 0, exit = maxRange;
    if (dx === 0) {
      if (ox < this.x0 || ox > this.x1) return;
    } else {
      const a = (this.x0 - ox) / dx, b = (this.x1 - ox) / dx;
      entry = Math.max(entry, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
    }
    if (dz === 0) {
      if (oz < this.z0 || oz > this.z1) return;
    } else {
      const a = (this.z0 - oz) / dz, b = (this.z1 - oz) / dz;
      entry = Math.max(entry, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
    }
    if (entry >= exit) return;

    const {field, profile, width, height, pixels, colours, rowSlope} = this;
    const texelsPerMetre = colourScale / field.cellSize;
    const farStep = field.cellSize * profile.cellFraction;
    let horizon = 0, distance = entry;
    for (let step = 0; step < maxSteps; step++) {
      const x = clamp(ox + distance * dx, this.x0, this.x1);
      const z = clamp(oz + distance * dz, this.z0, this.z1);
      const rise = field.sample(x, z).height - oy;
      this.samples++;
      if (rise >= rowSlope[horizon] * distance) {
        let end = horizon + 1;
        while (end < height && rise >= rowSlope[end] * distance) end++;
        // When the camera is outside the finite grid, do not invent a cliff
        // below the near edge. Later spans start at the actual edge elevation.
        if (distance !== entry || entry === 0) {
          const i = Math.min(this.mapWidth - 1, Math.floor((x - this.x0) * texelsPerMetre));
          const j = Math.min(this.mapHeight - 1, Math.floor((z - this.z0) * texelsPerMetre));
          const k = (j * this.mapWidth + i) * 3;
          const haze = .35 * distance / (distance + 120);
          const r = colours[k] + haze * (167 - colours[k]);
          const g = colours[k + 1] + haze * (159 - colours[k + 1]);
          const b = colours[k + 2] + haze * (175 - colours[k + 2]);
          for (let row = horizon; row < end; row++) {
            const pixel = (row * width + col) * 4;
            pixels[pixel] = r; pixels[pixel + 1] = g; pixels[pixel + 2] = b; pixels[pixel + 3] = 255;
          }
        }
        horizon = end;
      }
      if (horizon === height || distance === exit) break;
      distance = Math.min(exit, distance + Math.min(farStep, profile.nearStep + distance * profile.growth));
    }
  }
}
