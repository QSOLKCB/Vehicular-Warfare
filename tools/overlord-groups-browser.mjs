import assert from 'node:assert/strict';
import {groupFixture} from './overlord-groups-fixture.mjs';

export async function check({evaluate,screenshot}) {
  const result=await evaluate(`(async()=>{
    const {overlord}=await import('./sim/coordinated-overlord.js');
    const {StrategicMap}=await import('./game/strategic-map.js');
    const fixture=(${groupFixture});
    const summary=fixture(overlord,'alternate',(w,ids)=>{
      const frame=document.createElement('figure');
      frame.style.cssText='position:fixed;inset:0;background:#182e34;color:white;margin:0;z-index:999;padding:12px;font:18px system-ui';
      const title=document.createElement('figcaption');
      title.textContent='Breakwater section tasks · tick '+w.tick+' · accepted routes';
      frame.append(title);
      const canvas=document.createElement('canvas');
      canvas.style.cssText='width:100%;height:93%';
      frame.append(canvas);document.body.append(frame);
      const map=new StrategicMap(canvas,w);
      map.cx=-23;map.cz=35;map.zoom=2.75;
      map.draw(w,w.actors.filter(a=>a.faction==='cobalt' && a.hp),new Set(ids),null,false);
    });
    return summary;
  })()`,60000);
  assert.ok(result.engagements.some(e=>e.advancing && e.advanceSpeed>1));
  assert.equal(result.results.filter(e=>e.id==='cobalt-tank-3' && e.status==='completed').length,2);
  assert.deepEqual(result.reopened,{stateHash:result.recording.stateHash,eventHash:result.recording.eventHash});
  await screenshot('01-section-routes');
  return result;
}
