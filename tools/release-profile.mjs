import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const recordingPath='evidence/combined-arms/tank-replay.json';

export function qualifyRenderer(requested,renderer){
  if(typeof renderer!=='string' || !renderer.trim())throw Error('WebGL did not identify its renderer');
  const software=/swiftshader|llvmpipe|softpipe|software|lavapipe|basic render|\bwarp\b/i.test(renderer);
  if(requested==='software' && software)return;
  if(requested==='native' && !software && /nvidia|radeon|\bAMD\b|intel|apple|adreno|mali|powervr|vivante/i.test(renderer))return;
  throw Error('Cannot qualify '+requested+' WebGL on '+renderer);
}

// This function is serialized into the recording browser. The modules, renderer,
// HUD, fixed step and receipt all come from the game checkout being measured.
async function runInBrowser(recording,profile,stillTick){
  const {CombinedView}=await import('./game/combined-view.js');
  const {combinedHud}=await import('./game/combined-hud.js');
  const {createCombinedWorld,stepCombined,combinedReceipt}=await import('./sim/combined-world.js');
  const makeWorld=()=>createCombinedWorld({seed:recording.seed},recording.selection);
  const canvas=document.querySelector('#battlefield'),world=makeWorld();
  const now=()=>performance.now(),frame=()=>new Promise(requestAnimationFrame);
  const creation=now();
  const experiment=profile==='standard' || profile==='fx' || profile==='retro';
  const detail=experiment?'balanced':profile;
  const view=new CombinedView(canvas,world,{detail:detail==='base'?'full':detail,fx:profile==='fx',retro:profile==='retro'});
  const createViewMs=now()-creation,gl=view.r.gl;
  const fields=['tick','camera','intervalMs','simulationMs','drawMs','hudMs','gpuMs','draws','vertices',
    'liveProjectiles','liveActors','nearActors','farActors','projectileBoxes','debrisBoxes','shadowDiscs','wakeVertices'];
  if(experiment)fields.push('fxPrepMs','fxVertices','fxUpdated','chartPrepMs','retroPrepMs');
  const samples=[],pending=[];
  const timer=gl.getExtension('EXT_disjoint_timer_query');
  let disjoint=0,dropped=0,issued=0;
  const collectTimers=()=>{
    if(!timer)return;
    const invalid=gl.getParameter(timer.GPU_DISJOINT_EXT);
    if(invalid)disjoint++;
    while(pending.length){
      const {query,row}=pending[0];
      if(!invalid && !timer.getQueryObjectEXT(query,timer.QUERY_RESULT_AVAILABLE_EXT))break;
      if(!invalid)row[6]=timer.getQueryObjectEXT(query,timer.QUERY_RESULT_EXT)/1e6;
      else dropped++;
      timer.deleteQueryEXT(query);pending.shift();
    }
  };
  const cleanupTimers=()=>{
    for(const {query} of pending){timer.deleteQueryEXT(query);dropped++;}
    pending.length=0;
  };
  let mask=0,change=0;
  function stepTo(w,end){
    while(w.tick<end){
      if(w.status!=='active')throw Error('Recording ended early at '+w.tick);
      if(recording.commands[change]?.[0]===w.tick)mask=recording.commands[change++][1];
      stepCombined(w,mask);
    }
  }
  try{
    if(stillTick){
      stepTo(world,stillTick-30);
      const camera=stillTick<=480?'chase':'sight';
      // Let the camera and temporal LOD settle before capturing this frame.
      for(let tick=stillTick-28;tick<=stillTick;tick+=2){
        stepTo(world,tick);
        const draw=view.draw(world,camera);combinedHud(world,draw);
      }
      return {tick:world.tick,camera,stateHash:combinedReceipt(world).stateHash};
    }
    const warm=makeWorld();
    for(let i=0;i<24;i++){
      await frame();stepTo(warm,warm.tick+2);
      combinedHud(warm,view.draw(warm,'chase'));
    }
    mask=0;change=0;
    let previous=null,lastDraw;
    const cameras=['chase','sight','overview'];
    while(world.tick<recording.ticks){
      const stamp=await frame(),interval=previous===null?null:stamp-previous;
      previous=stamp;
      collectTimers();
      const simStart=now();
      stepTo(world,Math.min(recording.ticks,world.tick+2));
      const simulationMs=now()-simStart;
      const camera=world.tick<=480?0:world.tick<=840?1:2;
      let query;
      if(timer && samples.length%8===0 && pending.length<12){
        query=timer.createQueryEXT();
        timer.beginQueryEXT(timer.TIME_ELAPSED_EXT,query);issued++;
      }
      const drawStart=now();
      const d=view.draw(world,cameras[camera]);
      const drawMs=now()-drawStart;
      if(query)timer.endQueryEXT(timer.TIME_ELAPSED_EXT);
      const hudStart=now();combinedHud(world,d);
      const hudMs=now()-hudStart;
      const liveActors=world.actors.filter(a=>a.hp>0).length;
      if(detail!=='base' && d.detailProfile!==detail)throw Error('Unexpected detail profile '+d.detailProfile);
      if(detail!=='base' && (d.projectileBoxes!==world.shots.length || d.debrisBoxes+d.projectileBoxes>d.effectCapacity))
        throw Error('Rendered effects budget mismatch');
      if(detail!=='base' && d.nearActors+d.farActors!==liveActors-(camera===1?1:0))
        throw Error('An active actor is missing from the rendered population');
      const row=[world.tick,cameras[camera],interval,simulationMs,drawMs,hudMs,null,d.draws,d.vertices,world.shots.length,
        liveActors,d.nearActors??null,d.farActors??null,d.projectileBoxes??null,
        d.debrisBoxes??null,d.shadowDiscs??null,d.wakeVertices??null];
      if(experiment){
        if(d.fxEnabled!==(profile==='fx') || !Number.isFinite(d.fxPrepMs))throw Error('Unexpected FX configuration');
        if(d.retroEnabled!==(profile==='retro') || !Number.isFinite(d.chartPrepMs))throw Error('Unexpected chart configuration');
        row.push(d.fxPrepMs,d.fxVertices,Number(d.fxUpdated),d.chartPrepMs,d.retroPrepMs);
      }
      samples.push(row);
      if(query)pending.push({query,row});
      lastDraw=d;
    }
    for(let i=0;i<60 && pending.length;i++){await frame();collectTimers();}
    cleanupTimers();
    if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL reported an error during profiling');
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {detail,profile,createViewMs,graphics:{backend:gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
      width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,antialias:gl.getContextAttributes().antialias},
      timer:{available:Boolean(timer),issued,discarded:dropped,disjoint},fields,samples,
      resources:{retroRetainedBytes:lastDraw.retroRetainedBytes,fxRetainedBytes:lastDraw.fxRetainedBytes,liveMeshes:view.r.meshes.size,effectCapacity:lastDraw.effectCapacity,cpuGeometryBytes:lastDraw.cpuGeometryBytes,
        gpuGeometryMaxBytes:lastDraw.gpuGeometryMaxBytes},status:world.status,receipt:combinedReceipt(world)};
  }finally{
    cleanupTimers();view.dispose();
    if(view.r.meshes.size)throw Error('Renderer retained mesh buffers');
  }
}

function distribution(numbers){
  const sorted=numbers.slice().sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const at=p=>sorted[Math.floor(sorted.length*p)];
  return {count:sorted.length,p50:at(.5),p95:at(.95),max:sorted.at(-1),
    mean:numbers.reduce((sum,n)=>sum+n,0)/numbers.length};
}

// Run the allocation sampler separately so its instrumentation never overlaps the timed passes.
// V8 reports sampled bytes, including collected objects. Aggregate by the nearest local source frame.
function allocationSites(profile){
  const bytes=new Map();
  function visit(node,caller){
    const url=node.callFrame.url;
    const site=url?.includes('/ridgefire/')?url.split('/ridgefire/').at(-1)+'#'+(node.callFrame.functionName||'(module)'):caller;
    if(node.selfSize)bytes.set(site,(bytes.get(site)??0)+node.selfSize);
    for(const child of node.children??[])visit(child,site);
  }
  visit(profile.head,'(unattributed)');
  return Object.fromEntries([...bytes].sort((a,b)=>b[1]-a[1]));
}

export async function releaseProfile(io,{baseOnly,backend,experiment}){
  const {click,evaluate,screenshot,sleep}=io;
  const recording=JSON.parse(await readFile(recordingPath,'utf8'));
  await click('combinedSortie');
  for(let i=0;i<150 && !await evaluate("location.pathname.endsWith('/combined.html') && document.readyState==='complete'");i++)await sleep(30);
  await evaluate("(()=>{const e=document.querySelector('#vehicle');e.value='tank';e.dispatchEvent(new Event('change'));})()");
  await click('primary');await click('pause');
  assert.equal(await evaluate("document.querySelector('#station').dataset.mode"),'paused');
  // The ordinary pause released the station's renderer and RAF. The benchmark
  // now owns this canvas, drawing the accepted command stream under each profile.
  await evaluate("document.querySelector('#panel').hidden=true;document.querySelector('#hud').hidden=false;document.querySelector('#station').dataset.mode='playing'");
  const run=(detail,stillTick=0)=>evaluate('('+runInBrowser.toString()+')('+JSON.stringify(recording)+','+
    JSON.stringify(detail)+','+String(stillTick)+')',120000);
  const order=experiment?['standard',experiment,experiment,'standard']:
    baseOnly?['base','base']:['full','balanced','balanced','full'];
  const passes=[];
  for(const detail of order){
    const pass=await run(detail);
    qualifyRenderer(backend,pass.graphics.backend);
    assert.deepEqual(pass.receipt,recording);assert.equal(pass.status,'victory');
    assert.equal(pass.samples.length,Math.ceil(recording.ticks/2));
    const summary={};
    const metrics=['intervalMs','simulationMs','drawMs','hudMs','gpuMs','draws','vertices','nearActors','farActors','debrisBoxes'];
    if(experiment)metrics.push('fxPrepMs','fxVertices','fxUpdated','chartPrepMs','retroPrepMs');
    for(const name of metrics){
      const i=pass.fields.indexOf(name);
      summary[name]=distribution(pass.samples.map(row=>row[i]).filter(Number.isFinite));
    }
    if(!baseOnly && detail==='balanced')assert.ok(summary.farActors.max>0,'Distance LOD exercised in the mixed mission');
    if(detail==='fx')assert.ok(summary.fxVertices.max>0,'The FX pass must draw the experimental marker');
    if(detail==='retro')assert.ok(pass.resources.retroRetainedBytes>0,'The retro pass must draw with its packed chart');
    passes.push({...pass,summary});
  }
  const loads=pass=>pass.samples.map(row=>[row[0],row[1],row[9],row[10]]);
  const expectedLoads=loads(passes[0]);
  for(const pass of passes.slice(1))assert.deepEqual(loads(pass),expectedLoads);
  const captures=[];
  for(const tick of [240,600]){
    const snapshots=[];
    for(const detail of new Set(order)){
      const capture=await run(detail,tick);
      await screenshot('breakwater-'+detail+'-'+capture.camera);
      snapshots.push({detail,...capture});
    }
    assert.equal(new Set(snapshots.map(c=>c.stateHash)).size,1);
    captures.push(...snapshots);
  }
  const allocations=[];
  if(experiment){
    for(const profile of ['standard',experiment]){
      await io.send('HeapProfiler.collectGarbage');
      const before=await io.send('Runtime.getHeapUsage');
      await io.send('HeapProfiler.startSampling',{samplingInterval:8192,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
      let sample;
      try{assert.deepEqual((await run(profile)).receipt,recording);}
      finally{sample=(await io.send('HeapProfiler.stopSampling')).profile;}
      allocations.push({profile,samplingIntervalBytes:8192,before,after:await io.send('Runtime.getHeapUsage'),
        sampledBytesBySite:allocationSites(sample)});
    }
  }
  return {recordingPath,allocations,warmupFrames:24,ticksPerFrame:2,gpuQueryEveryFrames:8,
    cameraThroughTick:{chase:480,sight:840,overview:recording.ticks},order,passes,captures};
}
