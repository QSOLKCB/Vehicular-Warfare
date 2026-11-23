// Exercise camera controls through the deployed station and inspect only detached data.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';

export async function directorSortie({click,key,evaluate,send,sleep,screenshot}){
  const snapshot=()=>evaluate("import('./game/war-room.js').then(m=>m.inspect())");
  async function waitFor(check){
    for(let n=0;n<150;n++){
      const s=await snapshot();
      if(check(s))return s;
      await sleep(35);
    }
    throw Error('Director state timed out');
  }
  async function keyOn(id,key){
    await evaluate('document.getElementById('+JSON.stringify(id)+').focus()');
    for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code:key});
  }
  const replayFile=resolve('evidence/war-room/browser/native-replay.json');
  const saved=JSON.parse(await readFile(replayFile,'utf8'));

  await click('warRoom');
  for(let n=0;n<100 && !await evaluate("document.querySelector('#panel[open]')!==null");n++)await sleep(40);
  await click('primary');
  await click('all');
  await click('tab');
  await keyOn('camera','End');
  await waitFor(s=>s.director?.subject);
  for(const expected of ['overview','chase','sight','director']){
    await key('KeyC',true);await key('KeyC',false);
    const state=await snapshot();
    assert.equal(state.screen,'observation');
    assert.equal(state.camera,expected);
    assert.equal(await evaluate("document.getElementById('camera').value"),expected);
  }
  await keyOn('directorSubject','End');
  const pinned=await waitFor(s=>s.director?.subject==='cobalt-ship');
  assert.equal(pinned.selected.length,4);
  assert.deepEqual(pinned.receipt.orders,[]);
  const options=await evaluate("Array.from(document.getElementById('directorSubject').options,o=>o.value).filter(Boolean)");
  assert.ok(options.every(id=>id.startsWith('cobalt-')));
  await click('directorSweep');
  const moving=await waitFor(s=>s.director?.bearing>pinned.director.bearing+2);
  await screenshot('01-live-director');
  await click('pause');
  const paused=await waitFor(s=>s.mode==='paused');
  assert.equal(paused.metrics.buffers,0);

  await click('inspectFrame');
  const first=await waitFor(s=>s.mode==='inspection' && s.director?.tick===paused.tick && !s.metrics.rafActive);
  await keyOn('range','End');await keyOn('tilt','End');
  const second=await waitFor(s=>s.director?.range===80 && s.director?.tilt===78 && !s.metrics.rafActive);
  assert.equal(first.tick,second.tick);assert.deepEqual(first.receipt,second.receipt);
  assert.notDeepEqual(first.director.eye,second.director.eye);
  assert.equal(second.metrics.audioActive,false);
  await screenshot('02-held-director');
  await click('tab');
  const restored=await waitFor(s=>s.mode==='paused');
  assert.deepEqual(restored.receipt,paused.receipt);assert.equal(restored.metrics.buffers,0);

  const {root}=await send('DOM.getDocument');
  const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#openReplay'});
  await send('DOM.setFileInputFiles',{nodeId,files:[replayFile]});
  const verified=await waitFor(s=>s.mode==='verified');
  assert.deepEqual(verified.receipt,saved);
  await click('inspectFrame');await waitFor(s=>s.mode==='inspection' && s.director?.tick===saved.ticks);
  await screenshot('03-replay-director');
  await evaluate("window._directorLoss=document.querySelector('#battlefield').getContext('webgl').getExtension('WEBGL_lose_context');window._directorLoss.loseContext();void 0");
  await waitFor(s=>s.mode==='verified' && s.metrics.buffers===0);
  assert.equal(await evaluate("document.querySelector('#inspectFrame').hidden"),true);
  await sleep(200);
  await evaluate("window._directorLoss.restoreContext()");
  for(let i=0;i<100 && await evaluate("document.querySelector('#inspectFrame').hidden");i++)await sleep(40);
  assert.equal(await evaluate("document.querySelector('#inspectFrame').hidden"),false);
  await click('inspectFrame');await waitFor(s=>s.mode==='inspection' && s.metrics.buffers>0);
  await evaluate("window.dispatchEvent(new Event('blur'))");
  const returned=await waitFor(s=>s.mode==='verified');
  assert.equal(returned.metrics.buffers,0);assert.equal(returned.metrics.rafActive,false);
  assert.deepEqual(returned.receipt,saved);
  return {live:{subject:moving.director.subject,start:pinned.director,end:moving.director,
    frameIntervalsMs:moving.metrics.frames,sceneMs:moving.metrics.sceneMs,draws:moving.metrics.draws},
    paused:{tick:second.tick,before:first.director,after:second.director,receipt:second.receipt},
    verified:{ticks:saved.ticks,stateHash:saved.stateHash,eventHash:saved.eventHash,returnedBuffers:returned.metrics.buffers}};
}
