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

export function valley(seed, sites) {
  const random = seededRandom(seed);
  const heights = [];
  const phase = random() * 6;
  const cell = sites ? 8 : 6, z0=sites ? -816 : -EDGE;
  const cellsX=2*EDGE/cell,cellsZ=(EDGE-z0)/cell;
  for (let z = z0; z <= EDGE; z += cell) {
    for (let x = -EDGE; x <= EDGE; x += cell) {
      if(sites) {
        const middle=17*Math.sin(z/81+phase);
        const wall=Math.min(1,Math.max(0,(Math.abs(x-middle)-37)/78));
        const peaks=46+16*Math.cos(z/37+x/21+phase)+10*Math.sin(x/15);
        let crest=0;
        for(const [,cx,cz] of sites){
          const dz=z-cz-29-4*Math.sin((x-cx)/23);
          crest+=13*Math.exp(-dz*dz/78-(x-cx)**2/3600);
        }
        heights.push(1+wall*(peaks+5*random())+crest+.6*random());
        continue;
      }
      const crest = 18 + 4 * Math.sin(x / 27);
      const ridge = 13 * Math.exp(-((z - crest) ** 2) / 58) * Math.exp(-(x ** 2) / 2900);
      const walls = Math.min(1, Math.max(0, (Math.abs(x) - 25) / 84) + Math.max(0, (-z - 48) / 85));
      const peaks = 38 + 17 * Math.cos(z / 17 + x / 26 + phase) + 9 * Math.sin(x / 9 + phase);
      heights.push(1 + walls * (peaks + 7 * random()) + ridge + 0.55 * random());
    }
  }
  const field = Object.freeze(new Heightfield({cellsX, cellsZ, cellSize:cell, originX:-EDGE, originZ:z0, heights}));
  // Both triangle gradients bound the height difference over any horizontal disc.
  let slope = 0;
  for (let j = 0; j < cellsZ; j++) for (let i = 0; i < cellsX; i++) {
    for (const f of [0.25, 0.75]) {
      const {normal:n} = field.sample(-EDGE + (i+f)*cell, z0 + (j+f)*cell);
      slope = Math.max(slope, Math.hypot(n[0], n[2]) / n[1]);
    }
  }
  return Object.freeze({field, offset:HULL_HALF_HEIGHT + HULL_RADIUS * slope});
}

export function sight(field, a, b) {
  return field.castSegment(a, subtract(b,a)) === null;
}
