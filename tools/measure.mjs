import {cpus,platform,arch} from 'node:os';
import {createWorld,step,receipt,K} from '../sim/world.js';
import {createMechWorld,stepMech,mechReceipt,MK} from '../sim/mech-world.js';

function measure(w,active,actors,advance,record){
  const microseconds=[];
  let maxShots=0;
  while(w.status===active){
    const start=performance.now();
    advance(w);
    microseconds.push(Math.round((performance.now()-start)*1000));
    maxShots=Math.max(maxShots,w.shots.length);
  }
  const sorted=[...microseconds].sort((a,b)=>a-b);
  return {node:process.version,cpu:cpus()[0].model,platform:platform(),arch:arch(),
    status:w.status,maxShots,actors,p50:sorted[Math.floor(sorted.length*.5)],
    p95:sorted[Math.floor(sorted.length*.95)],microseconds,receipt:record(w),events:w.events};
}

const result=process.argv[2]==='mech'
  ?measure(createMechWorld(),'walking',2,w=>stepMech(w,MK.forward|MK.fire),mechReceipt)
  :measure(createWorld(),'flying',3,w=>step(w,w.tick<300?0:w.tick<440?K.up:K.fire),receipt);
console.log(JSON.stringify(result,null,1));
