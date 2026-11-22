import {cpus, platform, arch} from 'node:os';
import {createWorld,step,receipt,K} from '../sim/world.js';
const w=createWorld(), microseconds=[];
let maxShots=0;
while(w.status==='flying'){
  const start=performance.now();
  step(w,w.tick<300?0:w.tick<440?K.up:K.fire);
  microseconds.push(Math.round((performance.now()-start)*1000));
  maxShots=Math.max(maxShots,w.shots.length);
}
const sorted=[...microseconds].sort((a,b)=>a-b);
console.log(JSON.stringify({node:process.version,cpu:cpus()[0].model,platform:platform(),arch:arch(),
  status:w.status,maxShots,actors:3,p50:sorted[Math.floor(sorted.length*.5)],
  p95:sorted[Math.floor(sorted.length*.95)],microseconds,receipt:receipt(w),events:w.events},null,1));
