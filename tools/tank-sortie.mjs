// Exercise the normal ground-sortie UI through Chromium input events. The
// detached inspector supplies telemetry. Only the game advances the world.
import assert from 'node:assert/strict';
import {groundChecks} from './ground-checks.mjs';

export async function tankSortie(io){
  const {key,screenshot,send}=io;
  const {first,graphics,until,press,launch,restart,checkDisposal,verify,checkPauses,checkDownload,checkUnavailable}
    =await groundChecks(io,{family:'tank',name:'cutbank',entry:'groundSortie'});
  await key('KeyW',true);await key('ArrowRight',true);
  const split=await until(s=>Math.abs(s.player.turretYaw-first.player.turretYaw)>.22 &&
    Math.hypot(s.player.p[0]-first.player.p[0],s.player.p[2]-first.player.p[2])>.3,'independent traverse');
  await key('ArrowRight',false);await key('KeyW',false);
  assert.equal(split.player.yaw,first.player.yaw);
  await screenshot('02-independent-turret');
  await key('KeyD',true);
  await until(s=>Math.abs(s.player.yaw-split.player.yaw)>.12,'differential steer');
  await press('KeyP');await key('KeyD',false);
  const lifecycle=await checkPauses();
  const fresh=await restart();
  assert.deepEqual(fresh.player.p,first.player.p);
  let cover;
  const before=await send('Runtime.getHeapUsage');
  const win=await playEncounter(true);
  assert.equal(win.mode,'victory');checkDisposal(win);await verify(win);
  await screenshot('05-victory');

  const message=await checkDownload(win);
  await launch();
  const loss=await playEncounter(false);
  assert.equal(loss.mode,'defeat');assert.equal(loss.player.hp,0);checkDisposal(loss);await verify(loss);
  await screenshot('06-defeat');
  await send('HeapProfiler.collectGarbage');
  const afterGc=await send('Runtime.getHeapUsage');
  await checkUnavailable();
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
