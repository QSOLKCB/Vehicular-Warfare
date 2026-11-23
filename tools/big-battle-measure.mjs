// Same-runtime comparison of the two formation scenarios at their own accepted
// deployment and contact density. Timings cover the first 480 live ticks.
import {cpus} from 'node:os';
import {execFileSync} from 'node:child_process';
import {bigBattle} from '../sim/big-battle.js';
import {formationScenario} from '../sim/formation-world.js';

const eight=formationScenario;

function sample(api){
  const world=api.createWorld();
  const units=Object.keys(world.units);
  const before=process.memoryUsage().heapUsed,start=performance.now();
  api.issueOrder(world,{tick:0,units,type:'ATTACK',target:'relay',append:false});
  api.issueOrder(world,{tick:0,units:['cobalt-tank'],type:'MOVE',x:-16,z:3,append:true});
  const admissionMs=performance.now()-start,stepUs=[];
  let incomingSweeps=0,peakShots=0,peakOrders=0,sampledHeapHigh=before;
  for(let i=0;i<480 && world.status==='active';i++){
    incomingSweeps+=world.shots.length;
    peakOrders=Math.max(peakOrders,Object.values(world.units).filter(unit=>unit.queue.length).length);
    const t=performance.now();api.step(world);stepUs.push((performance.now()-t)*1000);
    peakShots=Math.max(peakShots,world.shots.length);
    if(i%60===0)sampledHeapHigh=Math.max(sampledHeapHigh,process.memoryUsage().heapUsed);
  }
  stepUs.sort((a,b)=>a-b);
  const result=api.receipt(world);
  return {source:result.source,scenario:result.scenario,ticks:world.tick,mobileUnits:world.actors.length-1,
    admissionMs,stepUs:{p50:stepUs[Math.floor(stepUs.length*.5)],p95:stepUs[Math.floor(stepUs.length*.95)],max:stepUs.at(-1)},
    incomingSweeps,peakShots,peakOrders,launches:world.serial,heapBefore:before,sampledHeapHigh,heapAfter:process.memoryUsage().heapUsed,
    stateHash:result.stateHash,eventHash:result.eventHash};
}
function groupMovement(api){
  const w=api.createWorld(),units=Object.keys(w.units);
  const started=performance.now();
  api.issueOrder(w,{tick:0,units,type:'MOVE',x:-15,z:6,append:false});
  const admitted=performance.now();
  api.step(w);
  const planned=performance.now();
  const {plans,visited}=w.navigation;
  while(w.status==='active' && w.tick<2000)api.step(w);
  const after=units.map(id=>{
    const actor=w.actors.find(a=>a.id===id),unit=w.units[id];
    return {id,hp:actor.hp,position:actor.p.slice(),status:unit.status,lastResult:unit.lastResult};
  });
  return {scenario:api.receipt(w).scenario,crews:units.length,admissionMs:admitted-started,
    firstStepMs:planned-admitted,plans,visited,ticks:w.tick,after};
}
sample(eight);sample(bigBattle);
const runs=[];
for(let pass=0;pass<3;pass++){
  for(const api of pass%2?[bigBattle,eight]:[eight,bigBattle])runs.push(sample(api));
}
console.log(JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  node:process.version,cpu:cpus()[0].model,runs,groupMovement:[groupMovement(eight),groupMovement(bigBattle)]},null,2));
