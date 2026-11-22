// Real keyboard input on the shared controls, exercised from each playable entry.
import assert from 'node:assert/strict';

const crews=[
  {crew:'tank',family:'tank',entry:'groundSortie',yaw:'turretYaw'},
  {crew:'mech',family:'mech',entry:'mechSortie',yaw:'torsoYaw'},
  {crew:'ship',family:'naval',entry:'navalSortie',yaw:'mountYaw'}
];

export async function controlSortie({key,click,screenshot,send,evaluate,sleep}){
  const board=await evaluate('new URL("./",location.href).href');
  let module;
  const read=()=>evaluate('import('+JSON.stringify('./game/'+module+'.js')+').then(m=>m.inspect())');
  async function until(get,test,label,timeout=30000){
    const end=Date.now()+timeout;
    let s;
    do{
      s=await get();
      if(test(s))return s;
      await sleep(35);
    }while(Date.now()<end);
    throw Error(label+' timed out at '+JSON.stringify({mode:s?.mode,tick:s?.tick,yaw:s?.player?.yaw,reason:s?.reason}));
  }
  const wait=(predicate,label)=>until(read,predicate,label);
  const ready=selector=>until(()=>evaluate('document.readyState==="complete" && !!document.querySelector('+JSON.stringify(selector)+')'),Boolean,selector);
  async function button(id){
    await evaluate('document.getElementById('+JSON.stringify(id)+').scrollIntoView({block:"center"})');
    await click(id);
  }
  async function choose(id,value){
    await evaluate('(()=>{const el=document.getElementById('+JSON.stringify(id)+');el.value='+JSON.stringify(value)+
      ';el.dispatchEvent(new Event("change",{bubbles:true}));})()');
  }
  async function open(entry,selector){
    await send('Page.navigate',{url:board});await ready('#'+entry);
    await button(entry);await ready(selector);
  }
  async function pause(){
    await key('KeyP',true);await key('KeyP',false);
    const s=await wait(s=>s.mode==='paused','pause');
    assert.equal(s.held,0);assert.equal(s.metrics.buffers,0);
    await sleep(110);assert.equal((await read()).tick,s.tick);
    return s;
  }
  async function launch(buttonId='primary'){
    await button(buttonId);return wait(s=>s.mode==='playing' && s.tick>0,'deploy');
  }
  const solo=[];
  for(const {family,crew,entry,yaw} of crews){
    module=family+'-main';
    await open(entry,'#driveStyle');
    let s=await wait(s=>s.mode==='briefing','briefing');
    assert.equal(s.driveStyle,'simple');
    const guidance=await evaluate("document.querySelector('#driveHelp').textContent");
    await screenshot('01-'+crew+'-controls');
    await launch();
    await key('KeyD',true);
    const turn=await wait(s=>Math.abs(s.player.yaw)>.11 && Math.abs(s.player[yaw])>.045,'single-key turn from rest');
    await key('KeyD',false);
    if(crew==='ship'){
      assert.ok(turn.player.speed>0);
      assert.ok(turn.receipt.commands.some(([,mask])=>(mask&1)!==0));
    }
    const old=(await read()).player;
    await key('KeyE',true);await key('KeyR',true);
    await wait(s=>s.player[yaw]>old[yaw]+.13 && s.player.elevation>old.elevation+.04,'near-hand right and raise');
    await key('KeyE',false);await key('KeyR',false);
    const elevated=await read();
    await key('KeyQ',true);await key('KeyF',true);
    await wait(s=>s.player[yaw]<elevated.player[yaw]-.08 && s.player.elevation<elevated.player.elevation-.025,'near-hand left and lower');
    await key('KeyQ',false);await key('KeyF',false);
    const settled=await read();
    await wait(s=>s.tick>=settled.tick+12,'manual aim held');
    assert.equal((await read()).player[yaw],settled.player[yaw]);
    await pause();await choose('driveStyle','independent');
    await launch('again');await key('KeyW',true);await key('KeyD',true);
    const independent=await wait(s=>Math.abs(s.player.yaw)>.11,'independent steer');
    assert.equal(independent.player[yaw],0);assert.equal(independent.driveStyle,'independent');
    await key('KeyW',false);await key('KeyD',false);await pause();
    await choose('driveStyle','simple');await launch('again');
    await key('KeyW',true);await key('Space',true);
    let brake;
    if(crew==='tank'){
      await wait(s=>s.player.p[2]<=24,'drive to shelf');
      await key('KeyW',false);
      const stopped=await wait(s=>s.player.speed===0,'release to brake');
      assert.ok(stopped.receipt.commands.some(([,mask])=>Boolean(mask&16)));
      brake={tick:stopped.tick,p:stopped.player.p,speed:stopped.player.speed};
    }else{
      await wait(s=>s.enemy.hp===0 && (!s.shore || s.shore.hp===0) || s.mode!=='playing','clear route');
      await key('Space',false);
    }
    const win=await wait(s=>s.mode==='victory' || s.mode==='defeat','finish '+crew);
    await key('KeyW',false);await key('Space',false);
    assert.equal(win.mode,'victory',crew+' · '+win.reason);
    assert.equal(win.metrics.buffers,0);
    const method=family[0].toUpperCase()+family.slice(1);
    const replay=await evaluate('import("./sim/'+family+'-world.js").then(m=>m.'+family+'Receipt(m.replay'+method+'('+JSON.stringify(JSON.stringify(win.receipt))+')))');
    assert.deepEqual(replay,win.receipt);
    await screenshot('02-'+crew+'-victory');
    solo.push({crew,guidance,turn:{tick:turn.tick,hullYaw:turn.player.yaw,mountYaw:turn.player[yaw],speed:turn.player.speed},
      manual:{tick:settled.tick,mountYaw:settled.player[yaw],elevation:settled.player.elevation},independent:{hullYaw:independent.player.yaw,
        mountYaw:independent.player[yaw]},brake,score:win.score,receipt:win.receipt});
  }
  module='combined-main';
  await open('combinedSortie','#vehicle');
  const flight=await read();assert.equal(flight.driveStyle,null);
  await launch();await key('KeyE',true);
  const climb=await wait(s=>s.player.p[1]>flight.player.p[1]+.5,'mixed helicopter collective');
  await key('KeyE',false);await pause();await button('reselect');
  await ready('#vehicle');await choose('vehicle','ship');
  await wait(s=>s.selection==='ship' && s.driveStyle==='simple','choose mixed cutter');
  await launch();await key('KeyD',true);
  const escort=await wait(s=>s.player.speed>.2 && s.player.yaw>.08 && s.player.mountYaw>.025,'mixed cutter single-key turn');
  await key('KeyD',false);await pause();
  await choose('driveStyle','independent');
  module='creator-station';
  await open('creatorStudio','#packCrew');await choose('packCrew','mech');await button('playPack');
  await ready('#battlefield');
  const authored=await wait(s=>s.mode==='briefing' && s.selection==='mech','workshop deployment');
  assert.equal(authored.driveStyle,'independent');
  await choose('driveStyle','simple');await launch();await key('KeyA',true);
  const walker=await wait(s=>s.player.yaw<-.08 && s.player.torsoYaw<-.025,'workshop walker single-key turn');
  await key('KeyA',false);await pause();
  const graphics=await evaluate("(()=>{const g=document.querySelector('#battlefield').getContext('webgl');return {backend:g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL),width:g.drawingBufferWidth,height:g.drawingBufferHeight}})()");
  return {graphics,solo,combined:{collectiveGain:climb.player.p[1]-flight.player.p[1],hullYaw:escort.player.yaw,mountYaw:escort.player.mountYaw},
    workshop:{persisted:authored.driveStyle,hullYaw:walker.player.yaw,mountYaw:walker.player.torsoYaw}};
}
