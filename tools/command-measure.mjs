// Run with Node 22 from a committed checkout. The reference loads the released
// implementation from its Git tree in a temporary directory.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir,cpus} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Session} from 'node:inspector/promises';
import {createCommandWorld,issueOrder,stepCommand,commandReceipt,replayCommand} from '../sim/command-world.js';
import {commandOpening} from '../test/command-opening.js';
import * as mixed from '../sim/combined-world.js';

const base='5c3088953f983fadb2fade5f360de24f2d30cd2d';
const temp=mkdtempSync(join(tmpdir(),'vw-command-reference-'));
function quantiles(samples){
  const sorted=samples.slice().sort((a,b)=>a-b);
  return {count:sorted.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],
    max:sorted.at(-1)};
}
function referenceStep(w,api){
  api.stepCombined(w,api.BK.fire|(w.captured?0:api.BK.forward));
}
function sample(create,advance,issue){
  const w=create(),tickUs=[],orderUs=[],load=[],events=[];
  let incomingSweeps=0,peakShots=0,peakActive=0;
  const opening=issue?commandOpening(w):[];
  const heapBefore=process.memoryUsage().heapUsed;
  let heapHigh=heapBefore;
  for(let i=0;i<720 && w.status==='active';i++){
    for(const order of opening.filter(order=>order.tick===i)){
      const start=performance.now();issueOrder(w,order);orderUs.push(1000*(performance.now()-start));
    }
    incomingSweeps+=w.shots.length;
    const start=performance.now();
    advance(w);
    tickUs.push(1000*(performance.now()-start));
    const active=Object.values(w.units??{}).filter(u=>u.queue.length).length;
    peakActive=Math.max(peakActive,active);peakShots=Math.max(peakShots,w.shots.length);
    events.push(...w.events.filter(e=>e.tick===w.tick));
    if(w.tick%60===0){
      const heapUsed=process.memoryUsage().heapUsed;heapHigh=Math.max(heapHigh,heapUsed);
      load.push({tick:w.tick,alive:w.actors.filter(a=>a.hp).length,active,shots:w.shots.length,heapUsed});
    }
  }
  return {ticks:w.tick,tickUs:quantiles(tickUs),orderAdmissionUs:orderUs,incomingSweeps,
    shotsLaunched:w.serial,impacts:events.filter(e=>e.type==='impact').length,peakShots,peakActive,
    heapBefore,heapHigh,heapAfter:process.memoryUsage().heapUsed,load};
}

async function profileSteering(){
  const session=new Session();session.connect();
  await session.post('Profiler.enable');await session.post('Profiler.setSamplingInterval',{interval:120});
  await session.post('Profiler.start');
  for(let i=0;i<4;i++)sample(createCommandWorld,stepCommand,true);
  const {profile}=await session.post('Profiler.stop');session.disconnect();
  const nodes=new Map(profile.nodes.map(node=>[node.id,node])),parents=new Map();
  for(const node of profile.nodes)for(const child of node.children??[])parents.set(child,node.id);
  const inclusiveUs={},samples={};
  for(let i=0;i<profile.samples.length;i++){
    const names=new Set();
    for(let id=profile.samples[i];id;id=parents.get(id)){
      const frame=nodes.get(id).callFrame;
      if(frame.url.endsWith('/sim/command-control.js') || frame.functionName==='mixedContact'){
        names.add(frame.functionName || '(anonymous)');
      }
    }
    for(const name of names){
      inclusiveUs[name]=(inclusiveUs[name]??0)+profile.timeDeltas[i];
      samples[name]=(samples[name]??0)+1;
    }
  }
  return {runs:4,samplingIntervalUs:120,totalSamples:profile.samples.length,inclusiveUs,samples};
}

function encounter(){
  const w=createCommandWorld(),opening=commandOpening(w),events=[];
  while(w.status==='active'){
    for(const order of opening)if(order.tick===w.tick)issueOrder(w,order);
    stepCommand(w);events.push(...w.events.filter(e=>e.tick===w.tick));
  }
  assert.equal(w.status,'victory');
  const receipt=commandReceipt(w);assert.deepEqual(commandReceipt(replayCommand(JSON.stringify(receipt))),receipt);
  return {receipt,reason:w.reason,events};
}
try{
  const archive=join(temp,'base.tar');
  execFileSync('git',['archive','--format=tar','-o',archive,base,'sim','vendor']);
  execFileSync('tar',['-xf',archive,'-C',temp]);
  const legacy=await import(pathToFileURL(join(temp,'sim/combined-world.js')).href);
  // Compare intermediate receipts from two separately loaded module graphs.
  let comparedTicks=0;
  for(const kind of legacy.CLASSES){
    const old=legacy.createCombinedWorld(undefined,kind),current=mixed.createCombinedWorld(undefined,kind);
    while(old.status==='active'){
      referenceStep(old,legacy);referenceStep(current,mixed);
      assert.deepEqual(mixed.combinedReceipt(current),legacy.combinedReceipt(old));comparedTicks++;
    }
  }
  sample(legacy.createCombinedWorld,w=>referenceStep(w,legacy),false);
  sample(createCommandWorld,stepCommand,true);
  const reference=[],command=[];
  for(let i=0;i<3;i++){
    reference.push(sample(legacy.createCombinedWorld,w=>referenceStep(w,legacy),false));
    command.push(sample(createCommandWorld,stepCommand,true));
  }
  console.log(JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    referenceRevision:base,node:process.version,cpu:cpus()[0].model,
    comparedTicks,reference,command,controllerProfile:await profileSteering(),encounter:encounter()},null,1));
}finally{
  rmSync(temp,{recursive:true,force:true});
}
