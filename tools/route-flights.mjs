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
      if(!gotIncoming && shots.size){await screenshot(mission+'-cockpit');gotIncoming=true;}
      await sleep(85);
    }
    assert.equal(s.mode,'victory',JSON.stringify([s.mode,s.tick,s.site,s.position,s.reason,s.ammo]));
    assert.ok(shots.size>0);
    assert.equal(stops.length,MISSIONS[mission].sites.length);
    assert.deepEqual(receipt(replay(JSON.stringify(s.receipt))),s.receipt);
    flights.push({mission,seconds:s.tick/120,actors:s.metrics.actors,enemyShots:shots.size,hits,stops,
      receipt:s.receipt,p95FrameMs:[...s.metrics.frames].sort((a,b)=>a-b)[Math.floor(s.metrics.frames.length*.95)]});
    await screenshot(mission+'-victory');await click('menu');
    console.log(mission,s.tick,'ticks,',shots.size,'enemy shots');
  }
  await writeFile(join(output,'flights.json'),JSON.stringify(flights,null,1)+'\n');
}
