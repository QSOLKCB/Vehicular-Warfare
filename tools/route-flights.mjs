import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {K,replay,receipt} from '../sim/world.js';
import {MISSIONS} from '../sim/missions.js';
import {routeControls} from '../test/route-controls.js';

export async function routeFlights({read,key,click,screenshot,evaluate,sleep,output}){
  const flights=[];
  for(const mission of ['longwatch','frostline']){
    await evaluate(`(()=>{const s=document.querySelector('#sortie');s.value='${mission}';s.dispatchEvent(new Event('change'));})()`);
    await screenshot(mission+'-briefing');
    await click('primary');
    if(mission==='longwatch')await click('sound');
    assert.equal((await read()).metrics.audioActive,true);
    assert.equal(await evaluate("document.querySelector('#navPod').hidden"),false);
    await key('KeyV',true);await key('KeyV',false);
    assert.equal(await evaluate("document.querySelector('#zoom').getAttribute('aria-pressed')"),'true');
    let active=0,previous=0,gotIncoming=false;
    const shots=new Set(),stops=[],hits=[];
    let s;
    const deadline=Date.now()+210000;
    while(Date.now()<deadline){
      s=await read();
      for(const e of s.events.filter(e=>e.tick>previous)){
        if(e.type==='launch' && e.owner!=='player') shots.add(e.shot);
        if(e.type==='beacon') stops.push([e.name,e.tick]);
        if(e.type==='damage' && e.target==='player')hits.push([e.source,e.tick]);
      }
      previous=s.tick;
      if(s.mode!=='flying')break;
      if(s.camera==='chase'){await key('KeyC',true);await key('KeyC',false);}
      const cmd=routeControls(s.site,s.clear,s.position,s.velocity,s.metrics.lastDraw.target);
      for(const [code,bit] of [['KeyW',K.forward],['KeyS',K.back],['KeyD',K.right],['KeyA',K.left],
          ['Space',K.fire],['KeyR',K.up],['KeyF',K.down]]){
        if((active&bit)!==(cmd&bit))await key(code,Boolean(cmd&bit));
      }
      active=cmd;
      if(!gotIncoming && shots.size && s.metrics.lastDraw.incoming){await screenshot(mission+'-cockpit');gotIncoming=true;}
      await sleep(85);
    }
    assert.equal(s.mode,'victory',JSON.stringify([s.mode,s.tick,s.site,s.position,s.reason,s.ammo]));
    assert.ok(shots.size>0);
    assert.equal(gotIncoming,true);assert.equal(s.metrics.audioActive,false);
    assert.equal(stops.length,MISSIONS[mission].sites.length);
    const verified=await evaluate("Promise.all([import('./sim/world.js'),import('./game/main.js')]).then(([sim,game])=>sim.receipt(sim.replay(JSON.stringify(game.inspect().receipt))))");
    assert.deepEqual(verified,s.receipt);
    let nodeReplay;
    try{nodeReplay=receipt(replay(JSON.stringify(s.receipt))).stateHash;}
    catch(error){if(error.message!=='replay diverged')throw error;nodeReplay='different runtime digest';}
    flights.push({mission,chromeReplay:verified.stateHash,nodeReplay,seconds:s.tick/120,actors:s.metrics.actors,enemyShots:shots.size,hits,stops,
      receipt:s.receipt,p95FrameMs:[...s.metrics.frames].sort((a,b)=>a-b)[Math.floor(s.metrics.frames.length*.95)]});
    await screenshot(mission+'-victory');await click('menu');
    console.log(mission,s.tick,'ticks,',shots.size,'enemy shots');
  }
  await evaluate("(()=>{const s=document.querySelector('#sortie');s.value='longwatch';s.dispatchEvent(new Event('change'));})()");
  await click('primary');await key('KeyR',true);
  let s,damaged=false,climbing=true;
  const deadline=Date.now()+40000;
  while(Date.now()<deadline){
    s=await read();
    if(climbing && s.position[1]>=47){await key('KeyR',false);climbing=false;}
    if(!damaged && s.hp<100 && s.hp>0){await screenshot('longwatch-hull-hit');damaged=true;}
    if(s.mode==='defeat')break;
    await sleep(90);
  }
  assert.equal(s.mode,'defeat');assert.equal(s.hp,0);assert.equal(damaged,true);
  const hits=s.events.filter(e=>e.type==='damage' && e.target==='player');
  assert.ok(hits.every(e=>e.shot>0));assert.equal(hits.length,9);
  const check=await evaluate("Promise.all([import('./sim/world.js'),import('./game/main.js')]).then(([sim,game])=>sim.receipt(sim.replay(JSON.stringify(game.inspect().receipt))))");
  assert.deepEqual(check,s.receipt);
  await writeFile(join(output,'exposure.json'),JSON.stringify({hits,receipt:s.receipt},null,1)+'\n');
  await writeFile(join(output,'flights.json'),JSON.stringify(flights,null,1)+'\n');
}
