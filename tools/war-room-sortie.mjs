// Actual pointer, keyboard, form, download and file input paths. inspect() returns detached data.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

// Profile the live observer's existing draw call. Restore the method before releasing the camera.
async function sampleObserver(){
  const {CombinedView}=await import('./game/combined-view.js');
  const old=CombinedView.prototype.draw,rows=[],pending=[],frame=()=>new Promise(requestAnimationFrame);
  let gl,timer,previous,disjoint=0;
  function collect(){
    if(!timer)return;
    const invalid=gl.getParameter(timer.GPU_DISJOINT_EXT);
    if(invalid)disjoint++;
    while(pending.length){
      const [q,row]=pending[0];
      if(!invalid && !timer.getQueryObjectEXT(q,timer.QUERY_RESULT_AVAILABLE_EXT))break;
      if(!invalid)row.gpuMs=timer.getQueryObjectEXT(q,timer.QUERY_RESULT_EXT)/1e6;
      timer.deleteQueryEXT(q);pending.shift();
    }
  }
  CombinedView.prototype.draw=function(w,camera){
    if(!gl){gl=this.r.gl;timer=gl.getExtension('EXT_disjoint_timer_query');}
    collect();
    const q=timer && rows.length%6===0 && pending.length<12?timer.createQueryEXT():null;
    const time=performance.now();
    if(q)timer.beginQueryEXT(timer.TIME_ELAPSED_EXT,q);
    const d=old.call(this,w,camera);
    if(q)timer.endQueryEXT(timer.TIME_ELAPSED_EXT);
    const row={tick:w.tick,camera,drawMs:performance.now()-time,intervalMs:previous===undefined?null:time-previous,
      gpuMs:null,draws:d.draws,vertices:d.vertices,visibleBodies:d.nearActors+d.farActors,projectiles:w.shots.length,
      ownedGpuGeometryBytes:d.gpuGeometryMaxBytes,ownedCpuGeometryBytes:d.cpuGeometryBytes};
    previous=time;rows.push(row);if(q)pending.push([q,row]);return d;
  };
  try{
    const end=performance.now()+5000;
    while(rows.length<90 && performance.now()<end)await frame();
    CombinedView.prototype.draw=old;
    for(let i=0;i<45 && pending.length;i++){await frame();collect();}
    return {timerAvailable:Boolean(timer),disjoint,unavailable:pending.length,rows};
  }finally{
    CombinedView.prototype.draw=old;
    for(const [q] of pending)timer.deleteQueryEXT(q);
  }
}

export async function warRoomSortie({evaluate,send,sleep,screenshot,click,output}){
  const inspect=()=>evaluate("import('./game/war-room.js').then(m=>m.inspect())");
  async function wait(read,predicate,label,ms=30000){
    const end=Date.now()+ms;
    let value;
    do{
      value=await read();
      if(predicate(value))return value;
      await sleep(35);
    }while(Date.now()<end);
    throw Error(label+' timed out at '+JSON.stringify(value?.receipt?{
      tick:value.tick,mode:value.mode,selected:value.selected,lastOrder:value.receipt.orders.at(-1)}:value).slice(0,2000));
  }
  const state=(predicate,label,ms)=>wait(inspect,predicate,label,ms);
  const button=async id=>{
    await evaluate('document.getElementById('+JSON.stringify(id)+').scrollIntoView({block:"nearest"})');
    await click(id);
  };
  const choose=async (id,value)=>{
    await evaluate('(()=>{const e=document.getElementById('+JSON.stringify(id)+');e.value='+JSON.stringify(String(value))+';e.dispatchEvent(new Event("change",{bubbles:true}))})()');
  };
  const press=async (code,key,modifiers=0)=>{
    for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,code,key,modifiers});
  };
  const pointer=(type,x,y,button='left',modifiers=0)=>send('Input.dispatchMouseEvent',{type,x,y,button,
    buttons:type==='mouseReleased'?0:button==='left'?1:button==='right'?2:4,clickCount:1,modifiers});
  async function point(x,y,button='left',modifiers=0){
    await pointer('mousePressed',x,y,button,modifiers);await pointer('mouseReleased',x,y,button,modifiers);
  }
  async function drag(x,y,u,v,button='left'){
    await pointer('mousePressed',x,y,button);
    await pointer('mouseMoved',u,v,button);await pointer('mouseReleased',u,v,button);
  }
  const actor=(s,id)=>{
    const a=s.visible.find(a=>a.id===id);assert.ok(a,'Expected visible '+id+' at tick '+s.tick);return a;
  };
  const select=async (id,button='left',modifiers=0)=>{
    const {u,v}=actor(await inspect(),id);await point(u,v,button,modifiers);
  };
  const feedback=()=>evaluate("document.querySelector('#feedback').textContent");
  const focusMap=()=>evaluate("document.querySelector('#strategy').focus()");
  async function go(){await button('primary');return state(s=>s.mode==='live','deploy / resume');}
  async function restart(){await button('restart');return state(s=>s.mode==='live' && s.tick<150,'fresh mission');}
  async function coords(x,z){
    await choose('type','MOVE');await choose('east',x);await choose('south',z);await button('issue');
  }
  const board=await evaluate('location.href');
  const [bx,by]=await evaluate(`(()=>{
    const a=document.querySelector("a[href$='war-room.html']");
    a.scrollIntoView();
    const r=a.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];
  })()`);
  await point(bx,by);
  await wait(()=>evaluate("document.readyState==='complete' && location.pathname.endsWith('war-room.html')"),Boolean,'board to War Room');
  await state(s=>s.mode==='briefing','briefing');
  await screenshot('01-command-briefing');
  const air='cobalt-helicopter',tank='cobalt-tank',report={lifecycle:[],heap:[]};
  async function memory(label){
    await send('HeapProfiler.collectGarbage');
    report.heap.push({label,heap:await send('Runtime.getHeapUsage'),dom:await send('Memory.getDOMCounters')});
  }
  await memory('briefing');
  await go();
  await select(air);assert.deepEqual((await inspect()).selected,[air]);
  await select(tank,'left',8);assert.equal((await inspect()).selected.length,2);
  await select(tank,'left',8);assert.deepEqual((await inspect()).selected,[air]);
  const a=actor(await inspect(),air),t=actor(await inspect(),tank);
  await drag(a.u-8,a.v-10,t.u+8,t.v+10);
  assert.deepEqual((await inspect()).selected.sort(),[air,tank].sort());
  await press('Digit2','2',2);await select(tank);await press('Digit2','2');
  assert.deepEqual((await inspect()).selected.sort(),[air,tank].sort());
  const before=await inspect();
  await point(a.u-12,a.v-78,'right');await point(a.u-22,a.v-96,'right',8);
  const issued=await state(s=>s.receipt.orders.length>=2,'group move and waypoint');
  assert.deepEqual(issued.receipt.orders.slice(-2).map(o=>[o.type,o.append]),[['MOVE',false],['MOVE',true]]);
  const underway=await state(s=>Math.hypot(actor(s,air).x-a.x,actor(s,air).z-a.z)>1.5,'real displacement');
  report.movement={before:[before.tick,a.x,a.z],after:[underway.tick,actor(underway,air).x,actor(underway,air).z]};
  await screenshot('02-group-orders');
  await select('relay','right');
  assert.equal((await inspect()).receipt.orders.at(-1).target,'relay');
  const original=await inspect();
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:t.u,y:t.v,deltaX:0,deltaY:-160});
  const zoomed=await state(s=>s.zoom>original.zoom,'pointer zoom');
  await drag(a.u,a.v,a.u+42,a.v+25,'middle');const panned=await inspect();
  assert.notDeepEqual([panned.cx,panned.cz],[zoomed.cx,zoomed.cz]);
  await focusMap();await press('KeyM','m');await screenshot('03-retro-map');await press('KeyM','m');
  await press('Tab','Tab');
  await state(s=>s.screen==='observation' && s.camera==='overview','3D overview');
  await screenshot('04-overhead');
  await press('KeyF','f');await state(s=>s.camera==='chase','crew chase');
  await screenshot('05-crew-chase');
  await choose('camera','sight');await state(s=>s.camera==='sight','weapon sight');
  await press('Tab','Tab');await state(s=>s.screen==='map','return to map');
  assert.equal((await inspect()).receipt.orders.length,3);
  report.mapMetrics=(await inspect()).metrics;
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:700,deviceScaleFactor:1.5,mobile:false});
  const backing=()=>evaluate("(()=>{const c=document.getElementById('strategy');return {cssWidth:c.clientWidth,cssHeight:c.clientHeight,width:c.width,height:c.height}})()");
  report.dprResize=await wait(backing,c=>c.width===Math.round(1.5*c.cssWidth) && c.height===Math.round(1.5*c.cssHeight),'DPR resize');
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:720,deviceScaleFactor:1,mobile:false});

  async function stopped(label){
    const p=await state(s=>s.mode==='paused',label);
    assert.equal(p.metrics.rafActive,false);assert.equal(p.metrics.dragging,false);assert.equal(p.metrics.buffers,0);
    await sleep(200);assert.equal((await inspect()).tick,p.tick);
    report.lifecycle.push({label,tick:p.tick});return p;
  }
  await focusMap();await press('KeyP','p');await stopped('pause');await go();
  await evaluate("window.dispatchEvent(new Event('blur'))");await stopped('blur');await go();
  await evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden");
  await stopped('visibilitychange');await go();
  await pointer('mousePressed',t.u,t.v);
  await evaluate("document.querySelector('#strategy').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true}))");
  await pointer('mouseReleased',t.u,t.v);
  const cancel=await inspect();assert.equal(cancel.metrics.dragging,false);
  assert.equal(cancel.mode,'paused');await stopped('pointer cancellation');await go();
  await focusMap();await press('Tab','Tab');await state(s=>s.screen==='observation','create observer');
  await evaluate("document.querySelector('#battlefield').getContext('webgl').getExtension('WEBGL_lose_context').loseContext()");
  await stopped('WebGL context loss');
  const restarted=await restart();
  assert.deepEqual(restarted.selected,[]);assert.deepEqual(restarted.receipt.orders,[]);assert.equal(restarted.screen,'map');
  await button('all');await coords(-8,130);
  const hidden=await state(s=>!s.visible.some(a=>a.id==='ember-helicopter'),'concealed helicopter');
  const concealed=await evaluate("(async()=>{const {replayCommand,commandContacts}=await import('./sim/command-world.js');const w=replayCommand("+JSON.stringify(JSON.stringify(hidden.receipt))+");const a=w.actors.find(a=>a.id==='ember-helicopter');return {tick:w.tick,hp:a.hp,visible:commandContacts(w).includes(a.id)}})()");
  assert.ok(concealed.hp>0 && !concealed.visible);report.hiddenTarget=concealed;
  await choose('type','ATTACK');
  // Reproduce a stale form choice after sensor loss. The submit path must revalidate it.
  assert.equal(await evaluate("Array.from(document.querySelector('#contact').options,o=>o.value).includes('ember-helicopter')"),false);
  await evaluate("document.querySelector('#contact').add(new Option('Stale contact','ember-helicopter',true,true))");
  await button('issue');
  report.rejectedHidden=await feedback();assert.match(report.rejectedHidden,/contact|detect|visible/i);
  assert.deepEqual((await inspect()).receipt.orders,hidden.receipt.orders);
  await coords(170,2);report.rejectedDestination=await feedback();assert.match(report.rejectedDestination,/outside|destination|invalid/i);
  assert.deepEqual((await inspect()).receipt.orders,hidden.receipt.orders);
  await button('pause');await stopped('restart following rejection');await restart();
  await button('all');await select('relay','right');
  await select(air);
  await button('append');await coords(-16,3);
  const final=await state(s=>s.mode==='debrief','commanded outcome',95000);
  assert.equal(final.status,'victory');
  assert.deepEqual(final.receipt.orders.map(o=>[o.type,o.append]),[['ATTACK',false],['MOVE',true]]);
  await screenshot('06-crossing-secured');
  report.win=final.receipt;
  const downloads=await mkdtemp(join(output,'replay-'));
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads},null);await button('save');
  const files=await wait(()=>readdir(downloads),a=>a.some(f=>f.endsWith('.json')),'Save replay');
  const file=join(downloads,files.find(f=>f.endsWith('.json')));
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')),final.receipt);
  const {root}=await send('DOM.getDocument');
  const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#openReplay'});
  await send('DOM.setFileInputFiles',{nodeId,files:[file]});
  const verified=await state(s=>s.mode==='verified','verify downloaded encounter');
  assert.deepEqual(verified.receipt,final.receipt);await screenshot('07-replay-verified');
  report.reopened={tick:verified.tick,stateHash:verified.receipt.stateHash,eventHash:verified.receipt.eventHash};
  await memory('after replay');

  // Use a fresh session for presentation timing and sample allocations.
  await send('Page.reload',{ignoreCache:true});
  await state(s=>s.mode==='briefing','fresh profiling session');await go();
  await focusMap();await press('Tab','Tab');
  await state(s=>s.screen==='observation','profiling observation');
  report.observation=await evaluate('('+sampleObserver+')()',15000);
  assert.ok(report.observation.rows.length>=8,'Observation frames and draw calls recorded');
  await button('tab');await state(s=>s.screen==='map','allocation sample map');
  await send('HeapProfiler.startSampling',{samplingInterval:65536,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
  await sleep(600);
  const {profile}=await send('HeapProfiler.stopSampling');
  const sites={};
  function walk(n){
    if(n.selfSize){
      const url=n.callFrame.url.split('/ridgefire/').at(-1);
      const label=(url||'runtime')+'#'+(n.callFrame.functionName||'(module)');
      sites[label]=(sites[label]??0)+n.selfSize;
    }
    for(const c of n.children||[])walk(c);
  }
  walk(profile.head);report.sampledAllocationBytes=sites;
  report.profilingMap=(await inspect()).metrics;
  await button('pause');await stopped('profiling end');await memory('paused after profiling');
  await send('Page.navigate',{url:board});
  await wait(()=>evaluate("document.readyState==='complete' && !!document.querySelector('#combinedSortie')"),Boolean,'mission board return');
  await button('combinedSortie');
  await wait(()=>evaluate("document.readyState==='complete' && !!document.querySelector('#vehicle')"),Boolean,'released Breakwater briefing');
  await button('primary');
  const legacy=await wait(()=>evaluate("import('./game/combined-main.js').then(m=>m.inspect())"),s=>s.mode==='playing' && s.tick>10,'historical Breakwater launch');
  report.historical={tick:legacy.tick,selection:legacy.selection,source:legacy.receipt.source};
  return report;
}
