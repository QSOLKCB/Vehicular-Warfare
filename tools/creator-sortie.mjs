import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {captureScore} from './creator-score.mjs';

export async function creatorSortie(io){
  const {evaluate,send,key,click,mouse,sleep,screenshot,output}=io;
  const pack={version:1,title:'Copper Crossing',seed:2506,crew:'tank',gate:[-18,4],relay:[-4,-28]};
  const status=()=>evaluate("document.querySelector('#editorStatus').textContent");
  const draft=()=>evaluate("JSON.parse(localStorage.getItem('vw006:editor-pack'))");
  const station=()=>evaluate("import('./game/creator-station.js').then(m=>m.inspect())");
  async function until(read,predicate,label,timeout=30000){
    let result;
    const end=Date.now()+timeout;
    do{
      result=await read();
      if(predicate(result))return result;
      await sleep(45);
    }while(Date.now()<end);
    throw Error(label+' timed out. '+JSON.stringify(result).slice(0,300));
  }
  async function ready(selector){
    await until(()=>evaluate('document.readyState==="complete" && Boolean(document.querySelector('+JSON.stringify(selector)+'))'),
      Boolean,selector);
  }
  async function button(id){
    await evaluate('document.getElementById('+JSON.stringify(id)+').scrollIntoView({block:"center"})');
    await click(id);
  }
  async function control(id,value,event='change'){
    await evaluate('(()=>{const e=document.getElementById('+JSON.stringify(id)+');e.value='+JSON.stringify(String(value))+
      ';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event('+JSON.stringify(event)+',{bubbles:true}));})()');
  }
  async function upload(id,file){
    const dom=await send('DOM.getDocument');
    const {nodeId}=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#'+id});
    await send('DOM.setFileInputFiles',{nodeId,files:[resolve(file)]});
  }
  async function download(id,folder){
    const dir=join(output,folder);
    await mkdir(dir,{recursive:true});
    await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir},null);
    await button(id);
    const files=await until(()=>readdir(dir),a=>a.some(f=>f.endsWith('.json')),id+' download');
    const file=join(dir,files.find(f=>f.endsWith('.json')));
    return {file,json:JSON.parse(await readFile(file,'utf8'))};
  }
  async function enterEditor(){
    await ready('#terrainMap');
    await until(()=>evaluate("document.querySelector('#packTitle').value"),Boolean,'editor initialization');
  }
  const seek=async tick=>{
    await control('timeline',tick);
    return until(station,s=>s.tick===tick,'seek '+tick);
  };
  await button('creatorStudio');await enterEditor();
  await control('packCrew','tank');await control('packSeed',2506);await control('packTitle',pack.title);
  for(const [id,value] of [['gateX',-18],['gateZ',3],['relayX',-3],['relayZ',-28]])await control(id,value);
  await button('applyPack');
  await until(draft,d=>d?.crew==='tank' && d.title===pack.title,'accept crew settings');
  await button('placeRelay');
  const [x,y]=await evaluate("(()=>{const r=document.querySelector('#terrainMap').getBoundingClientRect();return [r.left+140*r.width/288,r.top+116*r.height/288]})()");
  await mouse('mousePressed',x,y);await mouse('mouseReleased',x,y);
  // The keyboard alternative to map placement moves the gate one metre south.
  await button('placeGate');await evaluate("document.querySelector('#terrainMap').focus()");
  await key('ArrowDown',true);await key('ArrowDown',false);await button('applyPack');
  assert.deepEqual(await draft(),pack);
  const accepted=await download('exportPack','pack');assert.deepEqual(accepted.json,pack);
  await evaluate('window.scrollTo(0,0)');await screenshot('01-workshop');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  const narrow=await evaluate("({width:innerWidth,content:document.documentElement.scrollWidth})");
  assert.equal(narrow.width,390);assert.ok(narrow.content<=narrow.width);
  await screenshot('01-workshop-narrow');
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:720,deviceScaleFactor:1,mobile:false});
  const invalid=join(output,'invalid-pack.json');
  await writeFile(invalid,JSON.stringify({...pack,relay:[70,120]}));
  const before=await status();
  await upload('importPack',invalid);const rejection=await until(status,s=>s && s!==before,'reject submerged relay');
  assert.deepEqual(await draft(),pack);
  await button('resetPack');
  await until(()=>evaluate("document.querySelector('#packTitle').value"),t=>t!==pack.title,'restore starter');
  await upload('importPack',accepted.file);await until(draft,d=>d?.title===pack.title,'import authored pack');
  await send('Page.reload',{ignoreCache:true});await enterEditor();assert.deepEqual(await draft(),pack);
  await button('playPack');await ready('#battlefield');
  const briefing=await until(station,s=>s?.mode==='briefing','playtest briefing');
  assert.equal(briefing.receipt.pack.title,pack.title);
  assert.deepEqual([briefing.beacon[0],briefing.beacon[2]],pack.gate);
  const graphics=await evaluate("(()=>{const gl=document.querySelector('#battlefield').getContext('webgl');const info=gl.getExtension('WEBGL_debug_renderer_info');return {backend:gl.getParameter(info.UNMASKED_RENDERER_WEBGL),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight}})()");
  await button('primary');await until(station,s=>s.mode==='playing','deploy');
  await button('sound');await key('KeyW',true);
  const musicLive=await until(station,s=>s.held!==0 && s.music?.voices===3,'audio and live input');
  await key('KeyP',true);await key('KeyP',false);await key('KeyW',false);
  const pauses=[];
  async function hold(label){
    const p=await until(station,s=>s.mode==='paused',label);
    assert.equal(p.held,0);assert.equal(p.metrics.buffers,0);assert.equal(p.metrics.rafActive,false);
    assert.ok(!p.music?.voices);
    await sleep(120);assert.equal((await station()).tick,p.tick);
    pauses.push({reason:label,tick:p.tick});
  }
  await hold('keyboard pause');await button('primary');
  await key('KeyW',true);await until(station,s=>s.held!==0,'held before blur');
  await evaluate("window.dispatchEvent(new Event('blur'))");await hold('blur');await key('KeyW',false);
  await button('primary');await mouse('mousePressed',545,395,'right');await mouse('mouseReleased',545,395,'right');
  assert.equal(await evaluate('document.pointerLockElement?.id'),'battlefield');
  await evaluate('document.exitPointerLock()');await hold('pointer unlock');
  await button('again');await until(station,s=>s.mode==='playing' && s.tick>0,'restart');
  await key('KeyW',true);await key('Space',true);
  await until(station,s=>s.shots.length>0 && s.tick>=80,'cells in flight');
  await screenshot('02-playtest');
  const gate=await until(station,s=>s.captured || s.mode!=='playing','capture edited gate');
  assert.ok(gate.captured);await key('KeyW',false);await key('ShiftLeft',true);
  const win=await until(station,s=>s.mode==='victory' || s.mode==='defeat','finish authored mission');
  await key('Space',false);await key('ShiftLeft',false);assert.equal(win.mode,'victory');
  assert.deepEqual(win.receipt.pack,pack);assert.ok(win.mobileKills>=2);
  assert.equal(win.metrics.buffers,0);
  const recorded=await download('save','replay');assert.deepEqual(recorded.json,win.receipt);
  await screenshot('03-debrief');
  await button('watch');await ready('#station[data-kind=replay]');
  await until(station,s=>s.mode==='reviewing' && s.tick===0,'verified replay from debrief');
  const midpoint=Math.floor(win.tick/2);
  const middle=await seek(midpoint);
  const cameras=[];
  for(const camera of ['chase','sight','overview']){
    await control('replayCamera',camera);
    const result=await until(station,s=>s.camera===camera,'camera '+camera);
    assert.equal(result.tick,midpoint);assert.deepEqual(result.receipt,middle.receipt);
    cameras.push({camera,tick:result.tick,stateHash:result.receipt.stateHash});
    await screenshot('04-replay-'+camera);
  }
  await button('rewind');await until(station,s=>s.tick===0,'rewind');
  assert.deepEqual((await seek(midpoint)).receipt,middle.receipt);
  await button('replayToggle');await button('replayMusic');
  await until(station,s=>s.tick>midpoint+10 && s.music?.voices===3,'play replay with score');
  await evaluate("window.dispatchEvent(new Event('blur'))");
  const stopped=await until(station,s=>s.mode==='reviewing','pause replay on blur');
  assert.ok(!stopped.music?.voices);assert.equal(stopped.metrics.rafActive,false);
  await seek(win.tick-18);await button('replayToggle');
  const result=await until(station,s=>s.tick===win.tick && s.mode!=='replaying','finish replay');
  assert.deepEqual(result.receipt,win.receipt);
  const audio=await captureScore(io,win.receipt);
  await button('return');await enterEditor();
  const tampered=join(output,'altered-replay.json');
  await writeFile(tampered,JSON.stringify({...win.receipt,eventHash:win.receipt.eventHash==='00000000'?'00000001':'00000000'}));
  const old=await status();await upload('openReplay',tampered);
  const replayRejection=await until(status,s=>s && s!==old && /diverg|reject|invalid|match|fail|could not|checksum/i.test(s),'reject altered replay');
  assert.deepEqual(await draft(),pack);
  await upload('openReplay',recorded.file);await ready('#timeline');
  await until(station,s=>s.mode==='reviewing','reimport authored recording');assert.deepEqual((await seek(win.tick)).receipt,win.receipt);
  await button('return');await enterEditor();
  await button('playPack');await ready('#battlefield');
  await until(station,s=>s.mode==='briefing','reopen saved local mission');
  await button('primary');await key('KeyW',true);
  const lost=await until(station,s=>s.mode==='defeat' || s.mode==='victory','unarmed exposure');
  await key('KeyW',false);assert.equal(lost.mode,'defeat');assert.equal(lost.player.hp,0);
  const defeat=await download('save','defeat');assert.deepEqual(defeat.json,lost.receipt);
  await screenshot('05-defeat');await button('watch');await ready('#station[data-kind=replay]');
  await until(station,s=>s.mode==='reviewing','defeat viewer');
  assert.deepEqual((await seek(lost.tick)).receipt,lost.receipt);
  await button('return');await enterEditor();
  const archive=resolve('evidence/combined-arms/tank-replay.json'),oldReceipt=JSON.parse(await readFile(archive,'utf8'));
  await upload('openReplay',archive);await ready('#timeline');await until(station,s=>s.mode==='reviewing','historical viewer');
  assert.deepEqual((await seek(oldReceipt.ticks)).receipt,oldReceipt);
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){return k==='webgl'?null:get.call(this,k,...a)}"});
  await send('Page.reload',{ignoreCache:true});await ready('#battlefield');
  await until(station,s=>s.mode==='error','WebGL unavailable');
  return {pack,graphics,narrow,rejection,replayRejection,pauses,musicLive:musicLive.music,gateTick:gate.tick,
    win:{tick:win.tick,score:win.score,receipt:win.receipt,metrics:win.metrics},cameras,replayEnd:result.mode,
    loss:{tick:lost.tick,score:lost.score,reason:lost.reason,receipt:lost.receipt},
    archive:{ticks:oldReceipt.ticks,stateHash:oldReceipt.stateHash,eventHash:oldReceipt.eventHash},audio,webglUnavailable:true};
}
