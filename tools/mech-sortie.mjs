// Live input, fixed-tick contact observations, debrief and replay round-trip.
import assert from 'node:assert/strict';
import {groundChecks} from './ground-checks.mjs';

export async function mechSortie(io){
  const {key,click,screenshot,send,evaluate}=io;
  const {first,graphics,until,press,launch,restart,checkDisposal,verify,checkPauses,checkDownload,checkUnavailable}
    =await groundChecks(io,{family:'mech',name:'glassworks',entry:'mechSortie'});
  await click('sound');
  const audio=await until(s=>s.metrics.audioActive,'enable local sound');
  await key('KeyW',true);await key('ArrowRight',true);
  const stride=await until(s=>s.player.supportCount===3 && s.player.gait==='swing' &&
    Math.abs(s.player.torsoYaw-first.player.torsoYaw)>.22 && s.player.p[2]<first.player.p[2]-.3,
    'walking with independent traverse');
  assert.equal(stride.player.yaw,first.player.yaw);
  await key('ArrowRight',false);
  const planted=stride.player.feet.map(f=>f.stance);
  const alternate=await until(s=>s.player.supportCount===3 &&
    s.player.feet.every((f,i)=>f.stance!==planted[i]),'opposing tripod in stance');
  // Rebuild the immutable heightfield from the receipt seed; sample soles in
  // the two observed frames without touching the running game or clock.
  const footprints=await evaluate(`import('./sim/mech-world.js').then(m=>{
    const {field}=m.createMechWorld({seed:${stride.receipt.seed}});
    const poses=${JSON.stringify([stride.player.feet,alternate.player.feet])};
    return poses.map(feet=>feet.map(({p,stance})=>({stance,clearance:p[1]-field.sample(p[0],p[2]).height})));
  })`);
  for(const frame of footprints){
    const planted=frame.filter(f=>f.stance);
    assert.equal(planted.length,3);
    assert.ok(planted.every(f=>Math.abs(f.clearance)<1e-6));
    assert.ok(frame.filter(f=>!f.stance).every(f=>f.clearance>0));
  }
  await screenshot('02-walking');
  await key('ArrowUp',true);
  await until(s=>s.player.elevation>stride.player.elevation+.04,'independent gun elevation');
  await key('ArrowUp',false);
  await press('KeyC');await until(s=>s.camera==='sight','gun camera');
  await press('KeyP');await key('KeyW',false);
  const lifecycle=await checkPauses();
  const fresh=await restart();
  assert.equal(fresh.player.hp,first.player.hp);assert.equal(fresh.player.ammo,first.player.ammo);
  const before=await send('Runtime.getHeapUsage');
  await key('KeyW',true);await key('Space',true);
  const contact=await until(s=>s.enemy.hp<first.enemy.hp,'weapon contact',45000);
  await press('KeyC');await until(s=>s.camera==='sight','gun camera during combat');
  await screenshot('03-engagement');
  await press('KeyC');
  await until(s=>s.enemy.hp===0,'sentinel disabled',45000);
  await key('Space',false);
  const win=await until(s=>s.mode==='victory','reach the beacon',45000);
  await key('KeyW',false);checkDisposal(win);await verify(win);
  await screenshot('04-beacon-victory');
  const message=await checkDownload(win);
  await launch();await key('KeyW',true);
  const loss=await until(s=>s.mode==='defeat','CPU combat defeat',60000);
  await key('KeyW',false);assert.equal(loss.player.hp,0);checkDisposal(loss);await verify(loss);
  await screenshot('05-defeat');
  await send('HeapProfiler.collectGarbage');const afterGc=await send('Runtime.getHeapUsage');
  await checkUnavailable();
  const pose=s=>({tick:s.tick,player:s.player});
  return {graphics,lifecycle,soundEnabledInFlight:audio.metrics.audioActive,
    strides:[pose(stride),pose(alternate)],footprints,contact:{tick:contact.tick,enemyHP:contact.enemy.hp,draw:contact.metrics.lastDraw},
    win,loss,heap:{before,afterGc},replayFileMessage:message,webglUnavailable:true};
}
