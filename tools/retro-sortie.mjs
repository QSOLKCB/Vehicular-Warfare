// Browser acceptance for the actual 202×152 canvas and the controls on both stations.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

async function chartPixels(){
  const canvas=document.getElementById('theatreMap'),{width,height}=canvas;
  const bytes=canvas.getContext('2d').getImageData(0,0,width,height).data;
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return {width,height,colors:new Set(new Uint32Array(bytes.buffer)).size,
    sha256:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')};
}

// Paint through the presentation module with a deliberately withheld enemy and relay.
async function privacyProbe(){
  const {RetroChart,packedWidth,chartHeight}=await import('./game/retro-chart.js');
  const {createCombinedWorld,combinedReceipt}=await import('./sim/combined-world.js');
  const w=createCombinedWorld(undefined,'tank'),chart=new RetroChart(w),canvas=document.createElement('canvas');
  canvas.width=202;canvas.height=152;
  const ctx=canvas.getContext('2d');
  const image=new ImageData(chart.display.view(),packedWidth,chartHeight);
  async function read(visible){
    chart.draw(w,{visible});ctx.putImageData(image,0,0,0,0,202,152);
    const raw=ctx.getImageData(0,0,202,152);
    const hash=await crypto.subtle.digest('SHA-256',raw.data);
    return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
  }
  const original=combinedReceipt(w),base=await read([]);
  const immutable=JSON.stringify(combinedReceipt(w))===JSON.stringify(original);
  const mobile=w.actors.find(a=>a.faction!==w.player.faction && a.kind!=='relay');
  const results=[];
  for(const actor of [mobile,w.relay]){
    actor.p=[w.player.p[0]-15,actor.p[1],w.player.p[2]-22];
    results.push({actor:actor.kind,hidden:await read([]),visible:await read([actor.id]),hiddenAgain:await read([])});
  }
  return {base,immutable,results};
}

export async function retroSortie({evaluate,click,key,send,screenshot,sleep,output}){
  const captures=[],crewRuns=[];
  const board=await evaluate("new URL('./',location.href).href");
  let module='combined-main';
  const inspect=()=>evaluate("import('./game/"+module+".js').then(m=>m.inspect())");
  async function wait(read,condition,label){
    const deadline=Date.now()+30000;
    let result;
    do{result=await read();if(condition(result))return result;await sleep(35);}while(Date.now()<deadline);
    throw Error(label+' timed out at '+JSON.stringify({mode:result?.mode,tick:result?.tick,draw:result?.metrics?.lastDraw?.retroEnabled}));
  }
  const state=(condition,label)=>wait(inspect,condition,label);
  function ready(selector){
    const expression="document.readyState==='complete' && !!document.querySelector("+JSON.stringify(selector)+")";
    // A same-tab navigation can retire the old execution context during this read.
    return wait(async()=>{
      try{return await evaluate(expression);}
      catch(error){
        if(error.message!=='Inspected target navigated or closed')throw error;
        return false;
      }
    },Boolean,selector);
  }
  async function button(id){
    await evaluate('document.getElementById('+JSON.stringify(id)+').scrollIntoView({block:"center"})');await click(id);
  }
  async function choose(id,value){
    await evaluate("(()=>{const e=document.getElementById("+JSON.stringify(id)+");e.value="+JSON.stringify(value)+";e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  }
  async function capture(name){
    const data=await evaluate('('+chartPixels+')()');
    assert.deepEqual([data.width,data.height],[202,152]);
    assert.ok(data.colors>=5);
    await screenshot(name);
    data.screenshot=name+'.png';
    data.screenshotSha256=createHash('sha256').update(await readFile(join(output,data.screenshot))).digest('hex');
    captures.push(data);return data.sha256;
  }
  async function keyPress(code){await key(code,true);await key(code,false);}
  const checked=()=>evaluate("document.getElementById('retroChart').checked");
  const mode=enabled=>state(s=>s.metrics?.lastDraw?.retroEnabled===enabled && s.mode==='playing' && s.tick>0,'playing map '+enabled);
  const pixels=()=>evaluate('('+chartPixels+')()');
  await evaluate("localStorage.removeItem('vw-gfx:tactical-display')");
  await button('combinedSortie');await ready('#vehicle');assert.equal(await checked(),false);
  for(const crew of ['helicopter','tank','mech','ship']){
    await choose('vehicle',crew);
    await state(s=>s.selection===crew && s.mode==='briefing','crew '+crew);
    await button('primary');await mode(false);
    const modern=await capture(crew+'-modern');
    await key('KeyW',true);await state(s=>s.held!==0,'movement held');
    await keyPress('KeyM');
    const moving=await mode(true);
    assert.ok(moving.held!==0 && moving.metrics.rafActive && moving.metrics.liveRetroBytes>0);
    await key('KeyW',false);
    const retro=await capture(crew+'-retro');assert.notEqual(retro,modern);
    const before=moving.metrics.liveRetroBytes;
    await button('chartSwitch');const resumed=await mode(false);
    assert.equal(resumed.metrics.liveRetroBytes,0);assert.ok(resumed.tick>=moving.tick && resumed.metrics.sessionActive);
    if(crew==='tank'){
      for(const type of ['mousePressed','mouseReleased']){
        await send('Input.dispatchMouseEvent',{type,x:510,y:390,button:'right',clickCount:1});
      }
      const locked=()=>evaluate("document.pointerLockElement?.id");
      await wait(locked,id=>id==='battlefield','capture mouse aim');
      await keyPress('KeyM');await mode(true);assert.equal(await locked(),'battlefield');
      await keyPress('KeyM');await mode(false);assert.equal(await locked(),'battlefield');
      await evaluate('document.exitPointerLock()');
    }else await keyPress('KeyP');
    const paused=await state(s=>s.mode==='paused','pause');
    assert.equal(paused.held,0);assert.equal(paused.metrics.buffers,0);assert.equal(paused.metrics.liveRetroBytes,0);
    await button('retroChart');assert.equal(await checked(),true);
    await sleep(70);assert.equal((await inspect()).tick,paused.tick);
    await button('again');const restarted=await mode(true);
    assert.equal(restarted.held,0);assert.equal(restarted.selection,crew);
    if(crew==='tank'){
      await send('Emulation.setDeviceMetricsOverride',{width:740,height:520,deviceScaleFactor:1,mobile:false});
      await state(s=>s.metrics.lastDraw.width===740,'resize narrow');
      await capture('tank-retro-resize');
      await send('Emulation.setDeviceMetricsOverride',{width:1100,height:720,deviceScaleFactor:1,mobile:false});
      await state(s=>s.metrics.lastDraw.width===1100,'resize normal');
    }
    crewRuns.push({crew,beforeSwitchTick:moving.tick,afterSwitchTick:resumed.tick,ownedRetroBytes:before,
      afterDisableBytes:resumed.metrics.liveRetroBytes,pausedTick:paused.tick,restartTick:restarted.tick});
    await keyPress('KeyP');await state(s=>s.mode==='paused','choose crew');
    if(crew!=='ship'){
      await button('retroChart');await button('reselect');await ready('#vehicle');
      await state(s=>s.mode==='briefing','new briefing');assert.equal(await checked(),false);
    }
  }
  const privacy=await evaluate('('+privacyProbe+')()');
  assert.equal(privacy.immutable,true);
  for(const row of privacy.results){
    assert.equal(row.hidden,privacy.base);assert.equal(row.hiddenAgain,privacy.base);assert.notEqual(row.visible,privacy.base);
  }
  await send('Page.navigate',{url:board});await ready('#creatorStudio');
  await button('creatorStudio');await ready('#packCrew');await choose('packCrew','mech');
  await button('playPack');await ready('#retroChart');module='creator-station';
  await state(s=>s.mode==='briefing','workshop');assert.equal(await checked(),true);
  await button('primary');await mode(true);
  await state(s=>s.tick>=96 && s.mode==='playing','partial recording');await keyPress('KeyP');
  const pause=await state(s=>s.mode==='paused','workshop pause');assert.equal(pause.metrics.liveRetroBytes,0);
  await button('watch');
  await ready('#station[data-kind="replay"]');
  const initial=await state(s=>s.mode==='reviewing','verified workshop replay');
  const midpoint=Math.floor(pause.tick/2);
  await choose('timeline',String(midpoint));
  const sample=await state(s=>s.tick===midpoint,'replay seek');
  const retro=await capture('workshop-replay-retro');
  await button('chartSwitch');
  await state(s=>s.metrics.lastDraw.retroEnabled===false,'replay modern');
  const modern=await capture('workshop-replay-modern');assert.notEqual(modern,retro);
  await button('chartSwitch');
  const restored=await state(s=>s.metrics.lastDraw.retroEnabled===true,'replay restore');
  assert.equal((await pixels()).sha256,retro);
  assert.deepEqual(restored.receipt,sample.receipt);
  assert.equal(restored.metrics.liveRetroBytes,0);assert.equal(restored.metrics.buffers,0);
  // Both experiments share a frozen replay tick, but draw independent surfaces.
  await button('fxBeacon');
  const both=await state(s=>s.metrics.lastDraw.fxEnabled && s.metrics.lastDraw.retroEnabled,'both graphics options');
  assert.deepEqual(both.receipt,sample.receipt);assert.equal((await pixels()).sha256,retro);
  await button('chartSwitch');
  const fxOnly=await state(s=>s.metrics.lastDraw.fxEnabled && !s.metrics.lastDraw.retroEnabled,'FX only');
  assert.deepEqual(fxOnly.receipt,sample.receipt);assert.equal((await pixels()).sha256,modern);
  await button('fxBeacon');
  await button('chartSwitch');
  const retroOnly=await state(s=>!s.metrics.lastDraw.fxEnabled && s.metrics.lastDraw.retroEnabled,'retro only');
  assert.deepEqual(retroOnly.receipt,sample.receipt);assert.equal((await pixels()).sha256,retro);
  for(const camera of ['sight','overview']){
    await choose('replayCamera',camera);const frame=await state(s=>s.camera===camera,'replay camera');
    assert.deepEqual(frame.receipt,sample.receipt);assert.equal((await pixels()).sha256,retro);
  }
  await choose('timeline','0');await state(s=>s.tick===0,'rewind');
  await button('replayToggle');await state(s=>s.mode==='replaying','start replay');
  await keyPress('KeyM');await state(s=>s.metrics.lastDraw?.retroEnabled===false,'live replay switch');
  const final=await state(s=>s.mode==='finished','finish recording');
  assert.deepEqual(final.receipt,pause.receipt);
  return {captures,crewRuns,privacy,replay:{start:initial.tick,midpoint,final:final.tick,
    stateHash:final.receipt.stateHash,eventHash:final.receipt.eventHash,restoredPixelSha256:retro,bothOptionsSameReceipt:both.receipt.stateHash===sample.receipt.stateHash}};
}
