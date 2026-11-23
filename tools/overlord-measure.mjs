// Alternate scenario order between passes. Samples include the cost of instrumentation.
import {cpus} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {bigBattle} from '../sim/big-battle.js';
import {overlord} from '../sim/coordinated-overlord.js';

function distribution(samples) {
  const ordered=samples.slice().sort((a,b)=>a-b);
  const at=p=>ordered[Math.min(ordered.length-1,Math.floor(p*ordered.length))]??null;
  return {n:samples.length,p50:at(.5),p95:at(.95),max:at(1)};
}
function measure(api, duration) {
  const w=api.createWorld({seed:2505}), units=Object.keys(w.units);
  const deployment=w.actors.map(a=>({id:a.id,p:a.p.slice()}));
  api.issueOrder(w,{tick:0,type:'ATTACK',units,append:false,target:'relay'});
  api.issueOrder(w,{tick:0,type:'MOVE',units:['cobalt-tank-2'],append:true,x:-16,z:3});
  const times=[],phase=[],frames=[],blocked=new Set();
  let peakShots=0,sweeps=0;
  const instrumentation={onTactics:ms=>phase.push(ms)};
  for(let i=0;i<duration && w.status==='active';i++){
    sweeps+=w.shots.length;
    const begin=performance.now();
    api.step(w,instrumentation);
    times.push(performance.now()-begin);
    peakShots=Math.max(peakShots,w.shots.length);
    if(i%60===0)frames.push({tick:w.tick,shots:w.shots.length,heap:process.memoryUsage().heapUsed});
    for(const a of w.actors){
      const id=a.id;
      for(const result of [w.units[id]?.lastResult,w.tactical?.crews[id]?.controller.lastResult]){
        if(result?.status==='blocked')blocked.add(id+'/'+result.tick+'/'+result.reason);
      }
    }
  }
  const result=api.receipt(w);
  assert.deepEqual(api.receipt(api.replay(JSON.stringify(result))),result);
  const survivors=w.actors.filter(a=>a.kind!=='relay' && a.hp>0).map(a=>a.id);
  return {scenario:w.scenario,source:result.source,deployment,ticks:w.tick,outcome:w.status,
    orderLog:result.orders,stateHash:result.stateHash,eventHash:result.eventHash,
    tickMs:distribution(times),tacticalMs:distribution(phase),decisions:w.tactical?.decisions??0,
    decisionsPerSecond:(w.tactical?.decisions??0)*120/w.tick,
    contactEvaluations:w.tactical?.intel.evaluations??null,navigation:w.navigation,
    blockedRoutes:[...blocked],survivors,casualties:24-survivors.length,peakShots,sweeps,
    launches:w.serial,frames,tickSamplesMs:times,phaseSamplesMs:phase};
}
measure(bigBattle,60);measure(overlord,60);
const runs=[];
for(let i=0;i<3;i++)for(const api of i===1?[overlord,bigBattle]:[bigBattle,overlord])runs.push(measure(api,480));
const outcomes=[measure(bigBattle,14400),measure(overlord,14400)];
assert.deepEqual(outcomes[0].deployment,outcomes[1].deployment);
assert.deepEqual(outcomes[0].orderLog,outcomes[1].orderLog);
console.log(JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  cpu:cpus()[0].model,node:process.version,runs,outcomes}));
