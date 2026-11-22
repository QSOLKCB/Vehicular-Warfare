import assert from 'node:assert/strict';
import {groundChecks} from './ground-checks.mjs';

const vehicles=['helicopter','tank','mech','ship'];

function allocationRows(profile){
  const rows=new Map(),pending=[profile.head];
  while(pending.length){
    const node=pending.pop();
    if(node.children)pending.push(...node.children);
    if(!node.selfSize)continue;
    const frame=node.callFrame,key=[frame.url.split('/ridgefire/').pop(),frame.lineNumber+1,frame.functionName].join(' ');
    rows.set(key,(rows.get(key)??0)+node.selfSize);
  }
  return [...rows].sort((a,b)=>b[1]-a[1]).map(([site,bytes])=>({site,bytes}));
}

export async function combinedSortie(io){
  const {key,click,evaluate,send,screenshot,sleep}=io;
  const {first,graphics,read,until,press,launch,restart,checkDisposal,verify,checkPauses,checkDownload,checkUnavailable}
    =await groundChecks(io,{family:'combined',name:'breakwater',entry:'combinedSortie'});
  function roster(s){
    const ids=new Set(s.actors.map(a=>a.id));
    assert.equal(ids.size,s.actors.length);
    for(const faction of ['cobalt','ember']){
      for(const kind of vehicles)assert.ok(s.actors.some(a=>a.kind===kind && a.faction===faction));
    }
    assert.equal(s.player.kind,s.selection);
    assert.ok(ids.has(s.player.id));
  }
  async function choose(kind){
    await click('reselect');
    await until(s=>s.mode==='briefing','return to vehicle selection');
    await evaluate(`(()=>{const el=document.querySelector('#vehicle');el.value=${JSON.stringify(kind)};
      el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await until(s=>s.mode==='briefing' && s.selection===kind,'preview '+kind);
    const start=await launch();
    assert.equal(start.selection,kind);assert.equal(start.held,0);roster(start);
    return start;
  }
  roster(first);
  assert.equal(first.selection,'helicopter');
  assert.equal(await evaluate("document.querySelector('#vehicle').disabled"),true);
  await click('sound');await until(s=>s.metrics.audioActive,'enable sound on the selected crew');
  await key('KeyE',true);
  const airborne=await until(s=>s.player.p[1]>first.player.p[1]+.5,'collective input');
  await key('KeyE',false);await press('KeyC');
  await until(s=>s.camera==='sight','switch camera');await press('KeyP');
  const lifecycle=await checkPauses();
  let start=await restart();
  assert.equal(start.selection,first.selection);assert.equal(start.player.hp,first.player.hp);
  assert.equal(start.metrics.audioActive,true);
  const before=await send('Runtime.getHeapUsage'),runs=[];
  for(const selection of vehicles){
    if(selection!==first.selection)start=await choose(selection);
    await key('KeyW',true);await key('Space',true);
    const moving=await until(s=>s.player.p[2]<start.player.p[2]-.75 && s.shots.length>0,
      'movement and live cells for '+selection);
    await screenshot('02-'+selection+'-underway');
    const damage=[],renderSamples=[];
    let lastTick=0;
    function observe(s){
      for(const e of s.events)if(e.type==='damage' && e.tick>lastTick)damage.push(e);
      const d=s.metrics.lastDraw;
      renderSamples.push({tick:s.tick,draws:d.draws,vertices:d.vertices,buffers:s.metrics.buffers});
      lastTick=s.tick;
    }
    const gate=await until(s=>{
      observe(s);
      return s.captured || s.mode!=='playing';
    },'capture '+selection+' gate',65000);
    assert.ok(gate.captured,selection+' gate at tick '+gate.tick);
    await key('KeyW',false);
    if(selection==='tank')await key('ShiftLeft',true);
    const win=await until(s=>{
      observe(s);
      return s.mode==='victory' || s.mode==='defeat';
    },'defend '+selection+' gate',65000);
    await key('Space',false);await key('KeyW',false);
    if(selection==='tank')await key('ShiftLeft',false);
    assert.equal(win.mode,'victory',selection+' at tick '+win.tick+' · '+win.reason);
    assert.ok(win.mobileKills>=2 && win.relay.hp===0);
    assert.ok(damage.some(e=>e.source===win.player.id && e.shot>0),selection+' contributes a physical hit');
    checkDisposal(win);await verify(win);
    const replayFileMessage=await checkDownload(win,'downloads/'+selection);
    await screenshot('03-'+selection+'-victory');
    runs.push({selection,gateTick:gate.tick,initial:start.player,moving:{tick:moving.tick,player:moving.player,
      actors:moving.actors.map(a=>({id:a.id,kind:a.kind,faction:a.faction,p:a.p,hp:a.hp})),
      shots:moving.shots.length,waterLevel:moving.waterLevel,draw:moving.metrics.lastDraw},damage,renderSamples,win,replayFileMessage});
  }
  await choose('helicopter');
  await key('KeyW',true);
  const loss=await until(s=>s.mode==='defeat' || s.mode==='victory','exposed defeat',65000);
  await key('KeyW',false);
  assert.equal(loss.mode,'defeat');checkDisposal(loss);await verify(loss);
  const lossReplayMessage=await checkDownload(loss,'downloads/defeat');
  await screenshot('04-defeat');
  // A separate fresh deployment measures JS allocations without cloning the
  // simulation snapshot on every poll or profiling the four timing runs.
  const sampling=await choose('tank');
  await send('HeapProfiler.startSampling',{samplingInterval:32768,
    includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
  await key('KeyW',true);await key('Space',true);
  const deadline=Date.now()+65000;
  while(await evaluate("document.querySelector('#station').dataset.mode==='playing' && document.querySelector('#objectives').dataset.captured!=='true'") && Date.now()<deadline)await sleep(90);
  await key('KeyW',false);await key('ShiftLeft',true);
  while(await evaluate("document.querySelector('#station').dataset.mode==='playing'") && Date.now()<deadline)await sleep(125);
  const {profile}=await send('HeapProfiler.stopSampling');
  await key('Space',false);await key('ShiftLeft',false);
  const sampled=await read();assert.equal(sampled.mode,'victory');
  const rows=allocationRows(profile);
  const allocations={selection:'tank',fromTick:sampling.tick,toTick:sampled.tick,
    intervalBytes:32768,estimatedBytes:rows.reduce((sum,row)=>sum+row.bytes,0),rows};
  assert.ok(allocations.estimatedBytes>0);
  await send('HeapProfiler.collectGarbage');const afterGc=await send('Runtime.getHeapUsage');
  await checkUnavailable();
  return {graphics,lifecycle,collective:{initial:first.player.p,after:airborne.player.p},runs,loss,
    lossReplayMessage,allocations,heap:{before,afterGc},webglUnavailable:true};
}
