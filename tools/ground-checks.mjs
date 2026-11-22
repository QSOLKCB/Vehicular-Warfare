// Shared acceptance checks for the ground-sortie entry points and lifecycle.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function groundChecks(io,{family,name,entry}){
  const {click,key,mouse,evaluate,send,screenshot,sleep,output}=io;
  const read=()=>evaluate(`import('./game/${family}-main.js').then(m=>m.inspect())`);
  async function until(check,label,limit=15000){
    const deadline=Date.now()+limit;
    let s;
    while(Date.now()<deadline){
      s=await read();
      if(check(s))return s;
      await sleep(35);
    }
    throw Error(label+' timed out: '+JSON.stringify({mode:s.mode,tick:s.tick,
      position:s.player?.p,gait:s.player?.gait,reason:s.reason,lastEvent:s.events?.at(-1)}));
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
    assert.deepEqual([s.held,s.metrics.buffers,s.metrics.rafActive,s.metrics.sessionActive,Boolean(s.metrics.audioActive)],
      [0,0,false,false,false]);
  }
  async function verify(s){
    const replayMethod='replay'+family[0].toUpperCase()+family.slice(1);
    const json=JSON.stringify(JSON.stringify(s.receipt));
    const actual=await evaluate(`import('./sim/${family}-world.js').then(m=>m.${family}Receipt(m.${replayMethod}(${json})))`);
    assert.deepEqual(actual,s.receipt);
  }
  await click(entry);
  for(let i=0;i<100 && !await evaluate(`location.pathname.endsWith('/${family}.html') && !!document.querySelector('#primary') && document.readyState==='complete'`);i++)await sleep(40);
  const start=await read();assert.equal(start.mode,'briefing');
  await screenshot('01-'+name+'-briefing');
  const first=await launch();
  const graphics=await evaluate(`(()=>{const gl=document.querySelector('#battlefield').getContext('webgl');
    const info=gl.getExtension('WEBGL_debug_renderer_info');return {
      backend:gl.getParameter(info.UNMASKED_RENDERER_WEBGL),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight}})()`);
  async function checkPauses(){
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
    const page=targetInfos.find(t=>t.type==='page' && t.url.endsWith('/'+family+'.html'));
    const other=await send('Target.createTarget',{url:'about:blank',background:false},null);
    await send('Target.activateTarget',{targetId:other.targetId},null);
    await paused('foreground tab change');
    await send('Target.activateTarget',{targetId:page.targetId},null);
    await send('Target.closeTarget',{targetId:other.targetId},null);
    await key('KeyW',false);

    return lifecycle;
  }
  async function checkDownload(win,folder='downloads'){
    const downloadPath=join(output,folder);
    await mkdir(downloadPath,{recursive:true});
    await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath},null);
    await click('save');
    const path=join(downloadPath,name+'-'+win.tick+'.json');
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
    return message;
  }
  async function checkUnavailable(){
    await send('Page.addScriptToEvaluateOnNewDocument',{source:"const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...args){return k==='webgl'?null:get.call(this,k,...args)}"});
    await send('Page.reload',{ignoreCache:true});
    await sleep(400);assert.equal((await read()).mode,'error');
  }
  return {first,graphics,read,until,press,launch,restart,checkDisposal,verify,checkPauses,checkDownload,checkUnavailable};
}
