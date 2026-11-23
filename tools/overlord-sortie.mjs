// All commands enter through the packaged War Room controls.
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {sampleObserver} from './war-room-sortie.mjs';

export async function check({evaluate,send,sleep,screenshot,output}) {
  const board=await evaluate('location.href');
  const inspect=()=>evaluate("import('./game/war-room.js').then(m=>m.inspect())");
  async function until(read,test,label,ms=30000){
    const end=Date.now()+ms;
    let last;
    do{
      last=await read();
      if(test(last))return last;
      await sleep(40);
    }while(Date.now()<end);
    throw Error(label+' timed out at '+JSON.stringify([last?.tick,last?.mode,last?.status,last?.receipt?.orders]));
  }
  const wait=(test,label,ms)=>until(inspect,test,label,ms);
  async function click(selector){
    const [x,y]=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});
      e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
    for(const type of ['mousePressed','mouseReleased'])
      await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});
  }
  const field=(id,v)=>evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});
    e.value=${JSON.stringify(String(v))};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  async function open(selector){
    await click(selector);
    await until(()=>evaluate("location.pathname.endsWith('war-room.html') && document.readyState==='complete'"),Boolean,'station');
    return wait(s=>s.mode==='briefing','briefing');
  }
  const initial=await open('#overlord');
  assert.equal(initial.receipt.scenario,'breakwater-overlord-v1');
  await screenshot('01-overlord-briefing');
  await click('#primary');
  const cover='cobalt-tank-2',advance='cobalt-helicopter';
  const unit=id=>click('[data-unit="'+id+'"]');
  await unit(cover);await click('#multiSelect');await unit('cobalt-mech-2');
  await field('doctrine','SUPPORT');await click('#assignDoctrine');
  await click('#multiSelect');await unit(cover);
  async function task(name,x,z){
    await field('task',name);await field('taskEast',x);await field('taskSouth',z);
    await click('#issueTask');
  }
  await task('COVER',-30,17);
  await unit(advance);await task('ADVANCE',-30,3);
  const started=await wait(s=>s.assignments[advance]?.cover===cover,'linked section tasks');
  const start=initial.visible.find(a=>a.id===advance);
  assert.ok(started.receipt.orders.some(o=>o.type==='DOCTRINE' && o.units.length===2));
  const detected=started.contacts.find(c=>c.current);
  assert.ok(detected?.source.startsWith('cobalt-') && detected.tick<=started.tick);
  await click('#decisions summary');
  const engaged=await wait(s=>s.units[advance].queue[0]?.type==='MOVE' && s.launches.some(
    e=>e.owner===cover && e.tick>=(s.assignments[advance]?.releaseTick??s.assignments[advance]?.tick))
    && Math.hypot(s.visible.find(a=>a.id===advance)?.x-start.x,s.visible.find(a=>a.id===advance)?.z-start.z)>1,
    'covering launch during accepted advance');
  await screenshot('02-overlord-map');
  await click('#tab');await field('camera','director');
  await wait(s=>s.director?.subject===advance,'director on advancing crew');
  await click('#directorInspector summary');
  const decisionText=await evaluate("document.querySelector('#directorDecision').textContent");
  assert.match(decisionText,/Tick \d+/);
  await screenshot('03-overlord-director');
  await click('#tab');
  const end=await wait(s=>s.mode==='debrief','operation outcome',300000);
  await screenshot('04-overlord-outcome');
  const dir=await mkdtemp(join(output,'download-'));
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir},null);
  await click('#save');
  const files=await until(()=>readdir(dir),files=>files.some(f=>f.endsWith('.json')),'save');
  const file=join(dir,files.find(f=>f.endsWith('.json')));
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')),end.receipt);
  const {root}=await send('DOM.getDocument');
  const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#openReplay'});
  await send('DOM.setFileInputFiles',{nodeId,files:[file]});
  const verified=await wait(s=>s.mode==='verified','reopen',60000);
  assert.deepEqual(verified.receipt,end.receipt);
  await click('#inspectFrame');await wait(s=>s.mode==='inspection','inspect replay');
  assert.deepEqual((await inspect()).receipt,end.receipt);
  await click('#tab');await click('#primary');
  const lifecycle=[];
  for(const reason of ['pause','blur','pointercancel','contextloss']){
    if(reason==='pause'){
      await click('aside > details summary');await click('#music');
      await wait(s=>s.metrics.audioActive,'mission audio');await click('#pause');
    }
    if(reason==='blur')await evaluate("window.dispatchEvent(new Event('blur'))");
    if(reason==='pointercancel'){
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x:320,y:300,button:'left',clickCount:1});
      await wait(s=>s.metrics.dragging,'captured pointer');
      await evaluate("document.querySelector('#strategy').dispatchEvent(new PointerEvent('pointercancel'))");
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:320,y:300,button:'left',clickCount:1});
    }
    if(reason==='contextloss'){
      await click('#tab');await wait(s=>s.metrics.buffers>0,'live scene');
      await evaluate("window.testLoss=document.querySelector('#battlefield').getContext('webgl').getExtension('WEBGL_lose_context');testLoss.loseContext()");
    }
    const paused=await wait(s=>s.mode==='paused',reason);
    assert.equal(paused.metrics.buffers,0);assert.equal(paused.metrics.rafActive,false);
    assert.equal(paused.metrics.audioActive,false);assert.equal(paused.metrics.dragging,false);
    await sleep(100);assert.equal((await inspect()).tick,paused.tick);
    lifecycle.push({reason,tick:paused.tick,buffers:paused.metrics.buffers});
    if(reason==='contextloss')await evaluate('testLoss.restoreContext()');
    await click('#restart');
    const fresh=await inspect();
    assert.equal(fresh.receipt.orders.length,0);assert.equal(fresh.selected.length,0);
  }
  const profiles=[];
  for(const link of ['#bigBattle','#overlord']){
    await send('Page.navigate',{url:board});
    await until(()=>evaluate("document.readyState==='complete' && !!document.querySelector('#bigBattle')"),Boolean,'board');
    const brief=await open(link);
    await click('#primary');const map=await wait(s=>s.tick>=45,'map frames');
    await click('#tab');await wait(s=>s.metrics.buffers>0,'observer');
    const observer=await evaluate('('+sampleObserver+')()',16000);
    assert.ok(observer.rows.length>=8);
    profiles.push({scenario:brief.receipt.scenario,mapMs:map.metrics.mapMs,mapIntervals:map.metrics.frames,
      observer,heap:await send('Runtime.getHeapUsage')});
  }
  return {recording:end.receipt,reopened:verified.receipt,detected,movement:[start,engaged.visible.find(a=>a.id===advance)],
    engagement:{tick:engaged.tick,cover:engaged.assignments[cover],advance:engaged.assignments[advance],
      launches:engaged.launches.filter(e=>e.owner===cover)},decisionText,lifecycle,profiles};
}
