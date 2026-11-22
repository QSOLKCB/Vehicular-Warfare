// Check the actual controls, mesh lifecycle and frozen viewport pixels on the accepted recording.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';

async function compareInPage(images){
  const decoded=[];
  for(const image of images){
    const bytes=Uint8Array.from(atob(image),c=>c.charCodeAt(0));
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');
    ctx.drawImage(bitmap,0,0);bitmap.close();
    decoded.push(ctx.getImageData(0,0,canvas.width,canvas.height));
  }
  const hashes=[];
  for(const {data} of decoded){
    const digest=await crypto.subtle.digest('SHA-256',data);
    hashes.push(Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''));
  }
  const [base,fx]=decoded;
  let pixels=0,left=base.width,top=base.height,right=-1,bottom=-1;
  for(let i=0;i<base.data.length;i+=4){
    if(base.data[i]===fx.data[i] && base.data[i+1]===fx.data[i+1] && base.data[i+2]===fx.data[i+2])continue;
    const x=(i/4)%base.width,y=Math.floor((i/4)/base.width);
    pixels++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  return {width:base.width,height:base.height,hashes,pixels,left,top,right,bottom};
}

export async function fxSortie({evaluate,click,key,screenshot,send,sleep}){
  const board=await evaluate('location.href');
  const observe=module=>evaluate('import("./game/'+module+'.js").then(m=>m.inspect())');
  async function until(read,predicate,label){
    const end=Date.now()+35000;
    do{
      const result=await read();
      if(predicate(result))return result;
      await sleep(40);
    }while(Date.now()<end);
    throw Error('Timed out waiting for '+label);
  }
  async function ready(id){
    await until(()=>evaluate('document.readyState==="complete" && !!document.getElementById('+JSON.stringify(id)+')'),Boolean,id);
  }
  async function button(id){
    await evaluate('document.getElementById('+JSON.stringify(id)+').scrollIntoView({block:"center"})');
    await click(id);
  }
  const combined=()=>observe('combined-main'),workshop=()=>observe('creator-station');
  await button('combinedSortie');await ready('fxBeacon');
  const baseline=await until(combined,s=>s.metrics.lastDraw,'reference preview');
  assert.equal(baseline.metrics.lastDraw.fxEnabled,false);
  await button('fxBeacon');
  const preview=await until(combined,s=>s.metrics.lastDraw.fxVertices===60,'FX preview');
  assert.deepEqual(preview.receipt,baseline.receipt);
  assert.equal(preview.metrics.buffers,baseline.metrics.buffers+1);
  await button('primary');
  const start=await until(combined,s=>s.tick>3 && s.metrics.lastDraw.fxEnabled,'deploy with FX');
  await key('KeyG',true);await key('KeyG',false);
  const disabled=await until(combined,s=>s.tick>start.tick && !s.metrics.lastDraw.fxEnabled,'live rollback');
  assert.equal(disabled.metrics.lastDraw.fxVertices,0);
  await key('KeyG',true);await key('KeyG',false);
  const enabled=await until(combined,s=>s.metrics.lastDraw.fxEnabled,'live restore');
  assert.equal(enabled.metrics.buffers,start.metrics.buffers);
  assert.equal(enabled.held,0);assert.ok(enabled.receipt.commands.every(([,mask])=>mask===0));
  await button('pause');
  const pause=await until(combined,s=>s.mode==='paused','pause cleanup');
  assert.equal(pause.metrics.buffers,0);assert.equal(pause.metrics.rafActive,false);
  await button('again');
  const restart=await until(combined,s=>s.mode==='playing' && s.metrics.lastDraw.fxEnabled,'restart with FX');
  await button('pause');

  await send('Page.navigate',{url:board});await ready('creatorStudio');
  await button('creatorStudio');await ready('playPack');
  await button('playPack');await ready('primary');
  const authored=await until(workshop,s=>s.mode==='briefing' && s.metrics.lastDraw.fxEnabled,'workshop preference');
  assert.equal(authored.metrics.lastDraw.fxVertices,60);
  await button('return');await ready('openReplay');
  const dom=await send('DOM.getDocument');
  const {nodeId}=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#openReplay'});
  await send('DOM.setFileInputFiles',{nodeId,files:[resolve('evidence/combined-arms/tank-replay.json')]});
  await ready('timeline');
  await until(workshop,s=>s.mode==='reviewing','accepted replay');
  await evaluate('(()=>{const t=document.querySelector("#timeline");t.value="240";t.dispatchEvent(new Event("change"));})()');
  const held=await until(workshop,s=>s.tick===240 && s.metrics.lastDraw.fxEnabled,'frozen FX frame');
  await button('fxBeacon');
  const reference=await until(workshop,s=>!s.metrics.lastDraw.fxEnabled,'reference replay frame');
  // Crop the viewport between the mission/map instruments and the transport.
  // The checkbox, focus outline and DOM labels are outside this rectangle.
  const clip={x:270,y:115,width:550,height:375,scale:1};
  const pixels=async()=>(await send('Page.captureScreenshot',{format:'png',clip})).data;
  const a=await pixels();await screenshot('01-gate-lamps');
  await button('fxBeacon');
  const matched=await until(workshop,s=>s.metrics.lastDraw.fxEnabled,'FX replay frame');
  const b=await pixels();await screenshot('02-fx-gate');
  assert.equal(matched.tick,held.tick);assert.deepEqual(matched.receipt,reference.receipt);
  assert.equal(matched.metrics.buffers,0);assert.equal(matched.metrics.rafActive,false);
  await button('fxBeacon');await until(workshop,s=>!s.metrics.lastDraw.fxEnabled,'replay rollback');
  const c=await pixels();
  const viewport=await evaluate('('+compareInPage.toString()+')('+JSON.stringify([a,b,c])+')');
  assert.ok(viewport.pixels>10 && viewport.pixels<viewport.width*viewport.height/4,JSON.stringify(viewport));
  assert.equal(viewport.hashes[0],viewport.hashes[2]);
  return {previewBuffers:[baseline.metrics.buffers,preview.metrics.buffers],liveTicks:[start.tick,disabled.tick,enabled.tick],
    restartTick:restart.tick,workshopSelection:authored.selection,frame:{tick:matched.tick,receipt:matched.receipt,
      detail:matched.metrics.lastDraw.detailProfile,fxVertices:matched.metrics.lastDraw.fxVertices,
      fxRetainedBytes:matched.metrics.lastDraw.fxRetainedBytes,clip,viewport}};
}
