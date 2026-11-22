// Exercise the normal ground-sortie UI through Chromium input events. The
// detached inspector supplies telemetry. Only the game advances the world.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';

export async function tankSortie({click,key,mouse,evaluate,send,screenshot,sleep,output}){
  const read=()=>evaluate("import('./game/tank-main.js').then(m=>m.inspect())");
  async function until(check,label,limit=15000){
    const deadline=Date.now()+limit;
    let s;
    while(Date.now()<deadline){
      s=await read();
      if(check(s))return s;
      await sleep(35);
    }
    throw Error(label+' timed out: '+JSON.stringify({mode:s.mode,tick:s.tick,
      player:s.player,enemy:s.enemy,sight:s.sight,lastEvent:s.events?.at(-1)}));
  }
  const press=async code=>{await key(code,true);await key(code,false);};
  async function launch(){
    await click('primary');
    return until(s=>s.mode==='playing' && s.tick>0,'launch');
  }
  async function restart(){
    await click('again');
    const s=await until(s=>s.mode==='playing' && s.tick>0,'restart');
    assert.equal(s.held,0);
    return s;
  }
  function checkDisposal(s){
    assert.deepEqual([s.held,s.metrics.buffers,s.metrics.rafActive,s.metrics.sessionActive],
      [0,0,false,false]);
  }
  async function verify(s){
    const receipt=await evaluate("import('./sim/tank-world.js').then(m=>m.tankReceipt(m.replayTank("+
      JSON.stringify(JSON.stringify(s.receipt))+")))");
    assert.deepEqual(receipt,s.receipt);
  }
  await click('groundSortie');
  for(let i=0;i<100 && !await evaluate("location.pathname.endsWith('/tank.html') && !!document.querySelector('#primary') && document.readyState==='complete'");i++)await sleep(40);
  const start=await read();assert.equal(start.mode,'briefing');
  await screenshot('01-cutbank-briefing');
  const first=await launch();
  const graphics=await evaluate(`(()=>{const gl=document.querySelector('#battlefield').getContext('webgl');
    const info=gl.getExtension('WEBGL_debug_renderer_info');return {
      backend:gl.getParameter(info.UNMASKED_RENDERER_WEBGL),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight}})()`);
  await key('KeyW',true);await key('ArrowRight',true);
  const split=await until(s=>Math.abs(s.player.turretYaw-first.player.turretYaw)>.22 &&
    Math.hypot(s.player.p[0]-first.player.p[0],s.player.p[2]-first.player.p[2])>.3,'independent traverse');
  await key('ArrowRight',false);await key('KeyW',false);
  assert.equal(split.player.yaw,first.player.yaw);
  await screenshot('02-independent-turret');
  await key('KeyD',true);
  await until(s=>Math.abs(s.player.yaw-split.player.yaw)>.12,'differential steer');
  await press('KeyP');await key('KeyD',false);
  const lifecycle=[];
  async function paused(reason){
    const s=await until(s=>s.mode==='paused',reason);
    checkDisposal(s);await sleep(150);
    assert.equal((await read()).tick,s.tick);
    lifecycle.push({reason,tick:s.tick,buffers:s.metrics.buffers,held:s.held});
  }
  await paused('keyboard pause');
  await launch();await key('KeyW',true);
  await until(s=>s.held!==0,'drive after resume');
  await evaluate("window.dispatchEvent(new Event('blur'))");
  await paused('blur');await key('KeyW',false);
  await launch();
  await evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden");
  await paused('hidden');
  await launch();
  await mouse('mousePressed',510,390,'right');await mouse('mouseReleased',510,390,'right');
  assert.equal(await evaluate("document.pointerLockElement?.id"),'battlefield');
  await evaluate('document.exitPointerLock()');
  await paused('pointer unlock');

  await launch();await key('KeyW',true);
  const {targetInfos}=await send('Target.getTargets',{},null);
  const page=targetInfos.find(t=>t.type==='page' && t.url.endsWith('/tank.html'));
  const other=await send('Target.createTarget',{url:'about:blank',background:false},null);
  await send('Target.activateTarget',{targetId:other.targetId},null);
  await paused('foreground tab change');
  await send('Target.activateTarget',{targetId:page.targetId},null);
  await send('Target.closeTarget',{targetId:other.targetId},null);
  await key('KeyW',false);

  const fresh=await restart();
  assert.deepEqual(fresh.player.p,first.player.p);
  let cover;
  const before=await send('Runtime.getHeapUsage');
  const win=await playEncounter(true);
  assert.equal(win.mode,'victory');checkDisposal(win);await verify(win);
  await screenshot('05-victory');

  // Download through the debrief and give the same file to the replay checker.
  const downloadPath=join(output,'downloads');
  await mkdir(downloadPath,{recursive:true});
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath},null);
  await click('save');
  const path=join(downloadPath,'cutbank-'+win.tick+'.json');
  let saved;
  for(let i=0;i<100 && !saved;i++){
    try { saved=await readFile(path,'utf8'); }
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(!saved)await sleep(25);
  }
  assert.deepEqual(JSON.parse(saved),win.receipt);
  const dom=await send('DOM.getDocument');
  const {nodeId}=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#checkFile'});
  await send('DOM.setFileInputFiles',{nodeId,files:[path]});
  let message='';
  for(let i=0;i<100 && !message;i++){
    message=await evaluate("document.querySelector('#checkResult').textContent");await sleep(20);
  }
  assert.match(message,/^Verified/i);
  await launch();
  const loss=await playEncounter(false);
  assert.equal(loss.mode,'defeat');assert.equal(loss.player.hp,0);checkDisposal(loss);await verify(loss);
  await screenshot('06-defeat');
  await send('HeapProfiler.collectGarbage');
  const afterGc=await send('Runtime.getHeapUsage');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...args){return k==='webgl'?null:get.call(this,k,...args)}"});
  await send('Page.reload',{ignoreCache:true});
  await sleep(400);assert.equal((await read()).mode,'error');
  return {graphics,lifecycle,independent:{start:first.player,moving:split.player},
    cover,win,loss,heap:{before,afterGc},replayFileMessage:message,webglUnavailable:true};

  async function playEncounter(fire){
    await key('KeyW',true);
    if(fire){
      await key('Space',true);
      await until(s=>s.events.some(e=>e.type==='impact' && e.target==='terrain'),'round strikes ridge');
      await until(s=>s.player.p[2]<=24,'approach the bench');
      await key('ShiftLeft',true);await key('KeyW',false);
      const stopped=await until(s=>s.player.speed===0 && s.sight.turret &&
        s.metrics.lastDraw.exposure.turret && !s.metrics.lastDraw.exposure.hull,'stopped hull-down');
      cover={tick:stopped.tick,position:stopped.player.p,sight:stopped.sight,draw:stopped.metrics.lastDraw};
      await screenshot('03-hull-down');
      await press('KeyC');
      await screenshot('03b-gun-sight');
      await until(s=>s.enemy.hp<first.enemy.hp,'damage guard');
      await screenshot('04-hit');
    }
    const end=await until(s=>s.mode==='victory' || s.mode==='defeat','finish encounter',60000);
    await key('KeyW',false);if(fire){await key('ShiftLeft',false);await key('Space',false);}
    return end;
  }
}
