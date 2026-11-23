import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {sampleObserver} from './war-room-sortie.mjs';

export async function bigBattleSortie({evaluate,send,sleep,screenshot,output}){
  const board=await evaluate('location.href');
  const inspect=()=>evaluate("import('./game/war-room.js').then(m=>m.inspect())");
  async function until(read,check,label,ms=30000){
    const end=Date.now()+ms;
    let result;
    do{
      result=await read();
      if(check(result))return result;
      await sleep(50);
    }while(Date.now()<end);
    throw Error(label+' timed out at '+JSON.stringify([result?.tick,result?.mode,result?.status]));
  }
  async function click(selector){
    const [x,y]=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});
      e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
    for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});
  }
  async function open(link){
    await click(link);
    await until(()=>evaluate("location.pathname.endsWith('war-room.html') && document.readyState==='complete'"),
      Boolean,'War Room entry');
    return until(inspect,s=>s.mode==='briefing','briefing');
  }
  async function go(){await click('#primary');return until(inspect,s=>s.mode==='live','deployment');}
  async function setField(id,value){
    await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});
      e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  }

  const brief=await open('#bigBattle');
  assert.equal(brief.receipt.scenario,'breakwater-big-battle-v1');
  assert.equal(brief.receipt.roster.length,25);
  assert.equal(await evaluate("document.querySelectorAll('#roster .unit').length"),12);
  await screenshot('01-big-briefing');
  const start=await go();
  const tank='cobalt-tank-2',original=start.visible.find(a=>a.id===tank);
  await click('#all');assert.equal((await inspect()).selected.length,12);
  await setField('type','ATTACK');await setField('contact','relay');await click('#issue');
  await click('[data-unit="cobalt-tank-2"]');await setField('type','MOVE');
  await setField('east',-16);await setField('south',3);await click('#append');await click('#issue');
  const active=await until(inspect,s=>s.receipt.orders.length===2,'admission');
  assert.deepEqual(active.receipt.orders.map(o=>[o.type,o.units.length,o.append]),[['ATTACK',12,false],['MOVE',1,true]]);
  await screenshot('02-big-orders');
  await click('#tab');
  const observed=await until(inspect,s=>s.metrics.lastDraw?.projectileBoxes>0 && s.screen==='observation','live cells');
  assert.ok(observed.metrics.lastDraw.nearActors+observed.metrics.lastDraw.farActors>8);
  await screenshot('03-big-observer');await click('#tab');
  const end=await until(inspect,s=>s.mode==='debrief','victory');
  const arrived=end.visible.find(a=>a.id===tank);
  assert.ok(arrived && Math.hypot(arrived.x-original.x,arrived.z-original.z)>10);
  assert.equal(end.status,'victory');
  await screenshot('04-big-victory');
  const dir=await mkdtemp(join(output,'download-'));
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir},null);
  await click('#save');
  const files=await until(()=>readdir(dir),a=>a.some(f=>f.endsWith('.json')),'download');
  const file=join(dir,files.find(f=>f.endsWith('.json')));
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')),end.receipt);
  const {root}=await send('DOM.getDocument');
  const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#openReplay'});
  await send('DOM.setFileInputFiles',{nodeId,files:[file]});
  const verified=await until(inspect,s=>s.mode==='verified','25-actor replay');
  assert.deepEqual(verified.receipt,end.receipt);

  const profiles=[];
  for(const link of ['#formationRoom','#bigBattle']){
    await send('Page.navigate',{url:board});
    await until(()=>evaluate("document.readyState==='complete' && !!document.getElementById('bigBattle')"),Boolean,'mission board');
    const initial=await open(link);
    await go();
    await until(inspect,s=>s.tick>=45,'map measurement');
    const map=await inspect();
    await click('#tab');
    await until(inspect,s=>s.screen==='observation' && s.metrics.lastDraw,'observation');
    const observer=await evaluate('('+sampleObserver+')()',15000);
    assert.ok(observer.rows.length>=8);
    await click('#pause');
    const paused=await until(inspect,s=>s.mode==='paused','pause');
    assert.equal(paused.metrics.buffers,0);
    assert.equal(paused.metrics.rafActive,false);
    profiles.push({scenario:initial.receipt.scenario,mobile:initial.receipt.roster.length-1,mapMs:map.metrics.mapMs,
      mapIntervalsMs:map.metrics.frames,observer,heap:await send('Runtime.getHeapUsage')});
  }
  return {win:end.receipt,reopened:verified.receipt.stateHash,profiles,movement:{initial:original,final:arrived},
    observed:{tick:observed.tick,draw:observed.metrics.lastDraw}};
}
