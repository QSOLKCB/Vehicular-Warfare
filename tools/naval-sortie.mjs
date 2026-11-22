import assert from 'node:assert/strict';
import {groundChecks} from './ground-checks.mjs';

// Drive through the mission board. Browser input, world snapshots and replay
// validation use the same entry points as a manual playthrough.
export async function navalSortie(io){
  const {key,click,screenshot,send}=io;
  const {first,graphics,until,press,launch,restart,checkDisposal,verify,checkPauses,checkDownload,checkUnavailable}
    =await groundChecks(io,{family:'naval',name:'lantern',entry:'navalSortie'});
  function sample(s){
    const p=s.player;
    assert.equal(s.metrics.lastDraw.waterLevel,s.waterLevel);
    return {tick:s.tick,waterLevel:s.waterLevel,position:p.p,velocity:p.v,yaw:p.yaw,pitch:p.pitch,
      roll:p.roll,mountYaw:p.mountYaw,elevation:p.elevation,speed:p.speed,grounded:p.grounded,
      wetPoints:p.wetPoints,displacedVolume:p.displacedVolume,draw:s.metrics.lastDraw};
  }
  const trim=sample(first);
  assert.equal(trim.wetPoints,6);assert.ok(trim.displacedVolume>0 && !trim.grounded);
  await click('sound');await until(s=>s.metrics.audioActive,'local bridge sound');
  await key('KeyW',true);
  const ahead=await until(s=>s.player.speed>1.5 && s.player.p[2]<first.player.p[2]-.5,'make headway');
  await key('KeyD',true);await key('ArrowLeft',true);
  const turn=await until(s=>s.player.yaw>ahead.player.yaw+.05 && s.player.mountYaw<ahead.player.mountYaw-.08 &&
    Math.abs(s.player.roll)>.001,'helm and independent mount');
  await key('ArrowLeft',false);await key('KeyD',false);await key('KeyW',false);
  await screenshot('02-underway');
  await key('ArrowDown',true);
  await until(s=>s.player.elevation<-.16,'depress mount toward water');
  await key('ArrowDown',false);
  await press('KeyC');await until(s=>s.camera==='sight','bridge sight camera');
  await key('Space',true);
  const splash=await until(s=>s.events.some(e=>e.type==='impact' && e.target==='water'),'accepted water impact');
  await key('Space',false);await screenshot('03-water-contact');
  await press('KeyP');
  const lifecycle=await checkPauses();
  const fresh=await restart();
  assert.equal(fresh.player.hp,first.player.hp);assert.equal(fresh.player.ammo,first.player.ammo);
  assert.equal(fresh.sight.visible,false);
  const before=await send('Runtime.getHeapUsage');
  await key('KeyW',true);await key('Space',true);
  const exposed=await until(s=>s.sight.visible,'patrol emerges beyond the island');
  const hit=await until(s=>s.enemy.hp<first.enemy.hp || s.shore.hp<first.shore.hp,'first hostile hit',45000);
  await screenshot('04-channel');
  await until(s=>s.enemy.hp===0,'patrol disabled');
  await press('KeyC');await until(s=>s.camera==='sight','deck sight on the shore approach');
  const shoreHit=await until(s=>s.shore.hp<first.shore.hp && s.shore.hp>0,'ship-to-shore contact');
  await screenshot('05-shore-station');
  const clear=await until(s=>s.enemy.hp===0 && s.shore.hp===0,'patrol and shore relay disabled',60000);
  await key('Space',false);
  const win=await until(s=>s.mode==='victory','enter the exit buoy',45000);
  await key('KeyW',false);checkDisposal(win);await verify(win);
  await screenshot('06-entrance-secured');
  const message=await checkDownload(win);
  await launch();await key('KeyW',true);
  const loss=await until(s=>s.mode==='defeat','patrol disables the player',60000);
  await key('KeyW',false);assert.equal(loss.player.hp,0);checkDisposal(loss);await verify(loss);
  await screenshot('07-defeat');
  await send('HeapProfiler.collectGarbage');const afterGc=await send('Runtime.getHeapUsage');
  await checkUnavailable();
  return {graphics,trim,underway:sample(ahead),turn:sample(turn),waterImpact:splash.events.find(e=>e.type==='impact' && e.target==='water'),
    islandCover:{hiddenTick:fresh.tick,hiddenAt:fresh.player.p,visibleTick:exposed.tick,visibleAt:exposed.player.p},
    firstDamage:{tick:hit.tick,enemy:hit.enemy.hp,shore:hit.shore.hp,draw:hit.metrics.lastDraw},
    shoreHit:{tick:shoreHit.tick,hp:shoreHit.shore.hp},clearTick:clear.tick,
    lifecycle,win,loss,heap:{before,afterGc},replayFileMessage:message,webglUnavailable:true};
}
