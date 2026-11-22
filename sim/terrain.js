import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';
import {seededRandom, subtract} from '../vendor/vanillajs/modules/math/index.js';

export const EDGE = 144;
export const HULL_RADIUS = 2.6;
export const HULL_HALF_HEIGHT = 1.4;

// The only pack field is a uint32 seed. Bound serialized input before parsing.
export function missionSeed(pack) {
  if (typeof pack === 'string') {
    if (pack.length > 128) throw new RangeError('mission exceeds 128 characters');
    pack = JSON.parse(pack);
  }
  if (!pack || Object.getPrototypeOf(pack) !== Object.prototype ||
      Reflect.ownKeys(pack).length !== 1) throw new TypeError('expected a seed record');
  const seed = Object.getOwnPropertyDescriptor(pack, 'seed')?.value;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('invalid seed');
  return seed;
}

export function valley(seed) {
  const random = seededRandom(seed);
  const heights = [];
  const phase = random() * 6;
  for (let z = -EDGE; z <= EDGE; z += 6) {
    for (let x = -EDGE; x <= EDGE; x += 6) {
      const crest = 18 + 4 * Math.sin(x / 27);
      const ridge = 13 * Math.exp(-((z - crest) ** 2) / 58) * Math.exp(-(x ** 2) / 2900);
      const walls = Math.min(1, Math.max(0, (Math.abs(x) - 25) / 84) + Math.max(0, (-z - 48) / 85));
      const peaks = 38 + 17 * Math.cos(z / 17 + x / 26 + phase) + 9 * Math.sin(x / 9 + phase);
      heights.push(1 + walls * (peaks + 7 * random()) + ridge + 0.55 * random());
    }
  }
  const field = Object.freeze(new Heightfield({cellsX:48, cellsZ:48, cellSize:6, originX:-EDGE, originZ:-EDGE, heights}));
  // Both triangle gradients bound the height difference over any horizontal disc.
  let slope = 0;
  for (let j = 0; j < 48; j++) for (let i = 0; i < 48; i++) {
    for (const f of [0.25, 0.75]) {
      const {normal:n} = field.sample(-EDGE + (i+f)*6, -EDGE + (j+f)*6);
      slope = Math.max(slope, Math.hypot(n[0], n[2]) / n[1]);
    }
  }
  return Object.freeze({field, offset:HULL_HALF_HEIGHT + HULL_RADIUS * slope});
}

export function sight(field, a, b) {
  return field.castSegment(a, subtract(b,a)) === null;
}
