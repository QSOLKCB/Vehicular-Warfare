import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Clock} from '../sim/clock.js';
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';
import {HULL_HALF,createVessel} from '../sim/vessel.js';
import {BEACON_RADIUS,NAVAL_LIMIT,NK,createNavalWorld,navalGun,navalReceipt,
  replayNaval,sightNaval,stepNaval} from '../sim/naval-world.js';

function run(w,ticks,mask=0){
  for(let t=0;t<ticks && w.status==='sailing';t++)stepNaval(w,mask);
}
function until(w,check,mask=0,limit=2400){
  for(let t=0;t<limit && !check(w) && w.status==='sailing';t++)stepNaval(w,mask);
  assert.ok(check(w),'condition at tick '+w.tick);
}
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));

test('Lantern skerry masks the crossing patrol, which reacquires only after sustained sight',()=>{
  const w=createNavalWorld(),start=w.enemy.p.slice();
  assert.equal(sightNaval(w).visible,false);
  const from=navalGun(w.player).pivot,to=navalGun(w.enemy).pivot;
  const obstacle=w.field.castSegment(from,to.map((n,i)=>n-from[i]));
  assert.ok(obstacle && obstacle.point[1]>w.water.level);
  until(w,w=>w.enemy.visible);
  assert.equal(w.enemy.seen,1);assert.equal(w.enemy.mode,'acquiring');
  assert.ok(distance(w.enemy.p,start)>2);
  run(w,98);
  assert.ok(!w.events.some(e=>e.owner==='enemy' && e.type==='launch'));
  until(w,w=>w.events.some(e=>e.type==='launch' && e.owner==='enemy'));
  assert.equal(w.enemy.mode,'tracking');
  // Observe the rest of the same patrol without a terminal fifth hit.
  w.enemy.ammo=0;
  until(w,w=>!w.enemy.visible);
  const last=w.enemy.lastSeen.slice();
  assert.equal(w.enemy.mode,'search');assert.equal(w.enemy.seen,0);
  run(w,20);assert.deepEqual(w.enemy.lastSeen,last);
  run(w,150);assert.equal(w.enemy.lastSeen,null);assert.equal(w.enemy.mode,'patrol');
  until(w,w=>w.enemy.visible);assert.equal(w.enemy.seen,1);
});

test('cells leave a traversed mount, curve under gravity, and stop on the sampled skerry or sea',()=>{
  const w=createNavalWorld();
  run(w,24,NK.mountRight);
  assert.equal(w.player.yaw,0);assert.ok(Math.abs(w.player.mountYaw-.3)<1e-10);
  const barrel=navalGun(w.player),ammo=w.player.ammo;
  assert.ok(Math.abs(distance(barrel.pivot,barrel.muzzle)-2.35)<1e-10);
  stepNaval(w,NK.fire);
  const expected=navalGun(w.player),cell=w.shots[0],launchY=cell.p[1],firstVy=cell.v[1];
  assert.equal(w.player.ammo,ammo-1);assert.deepEqual(cell.p,expected.muzzle);
  run(w,5);
  assert.ok(cell.v[1]<firstVy && cell.p[1]<launchY && distance(expected.muzzle,cell.p)>0);
  until(w,w=>w.events.some(e=>e.type==='impact'));
  const rock=w.events.find(e=>e.type==='impact');
  assert.equal(rock.target,'terrain');assert.ok(Math.abs(rock.point[1]-w.field.sample(rock.point[0],rock.point[2]).height)<1e-7);
  assert.equal(w.enemy.hp,60);assert.equal(w.shore.hp,60);
  const high=createNavalWorld();
  high.player.mountYaw=w.player.mountYaw;high.player.elevation=.5;
  stepNaval(high,NK.fire);
  until(high,w=>w.shots[0]?.p[2]<8);
  const clear=high.shots[0].p;
  assert.ok(clear[1]>high.field.sample(clear[0],clear[2]).height);
  assert.equal(high.events.some(e=>e.type==='impact'),false);
  const low=createNavalWorld();run(low,50,NK.depress);stepNaval(low,NK.fire);
  until(low,w=>w.events.some(e=>e.type==='impact'));
  const splash=low.events.find(e=>e.type==='impact');
  assert.equal(splash.target,'water');
  assert.equal(splash.point[1],low.water.heightAt(splash.point[0],splash.point[2]));
  assert.ok(splash.point[1]>low.field.sample(splash.point[0],splash.point[2]).height);
});

test('a nearer solid wins a water crossing, land owns ties, and submerged objects cannot absorb a surface splash',()=>{
  const runProbe=(bed,boxHeight)=>{
    const w=createNavalWorld(),heights=Array(73*73).fill(bed);
    w.field=new Heightfield({cellsX:72,cellsZ:72,cellSize:4,originX:-144,originZ:-144,heights});
    // Place the stationary station under the probe, clear of both vessels.
    w.shore.p=[-35,boxHeight,0];w.shore.half=[1,.1,1];
    w.shots=[{id:1,owner:'player',p:[-35,1,0],prev:[-35,1,0],v:[0,-200,0],life:5}];
    stepNaval(w,0);
    return w.events.find(e=>e.type==='impact').target;
  };
  assert.equal(runProbe(-4,.6),'shore');
  assert.equal(runProbe(-4,-.3),'water');
  assert.equal(runProbe(0,-.3),'terrain');
});

test('barrel segment against a narrow island prevents launch even with a clear muzzle',()=>{
  const w=createNavalWorld();
  const fineN=128,fine=[];
  for(let j=0;j<=fineN;j++)for(let i=0;i<=fineN;i++)
    fine.push(i===64 && j===43?6:-4);
  w.field=new Heightfield({cellsX:fineN,cellsZ:fineN,cellSize:.5,originX:-32,originZ:-32,heights:fine});
  Object.assign(w.player,createVessel(w.field,w.water,-1.8,-8.5,Math.PI/2));
  Object.assign(w.enemy,createVessel(w.field,w.water,0,20));
  w.shore.p=[0,2,25];
  w.player.mountYaw=0;
  // The shore beside the starboard rail intersects the barrel between ends.
  const gun=navalGun(w.player);
  assert.ok(gun.muzzle[1]>w.field.sample(gun.muzzle[0],gun.muzzle[2]).height);
  assert.ok(w.field.castSegment(gun.pivot,gun.muzzle.map((v,i)=>v-gun.pivot[i])));
  stepNaval(w,NK.fire);assert.equal(w.shots.length,0);assert.equal(w.player.ammo,32);
  assert.equal(w.events.at(-1).type,'blocked');
});

test('slewing behind the bridge blocks a shot through the firing vessel',()=>{
  const w=createNavalWorld();
  run(w,251,NK.mountRight);
  const gun=navalGun(w.player);
  assert.ok(Math.abs(gun.muzzle[0]-w.player.p[0])<1.15);
  assert.ok(Math.abs(gun.muzzle[2]-w.player.p[2])<1.15);
  assert.equal(sightNaval(w).clear,false);
  stepNaval(w,NK.fire);
  assert.equal(w.player.ammo,32);assert.equal(w.shots.length,0);
  assert.equal(w.events.at(-1).type,'blocked');
  run(w,251,NK.mountLeft);assert.equal(sightNaval(w).clear,true);
  stepNaval(w,NK.fire);assert.equal(w.player.ammo,31);
});

test('ship and shore damage require swept impacts before a live navigation objective can complete',()=>{
  const w=createNavalWorld();
  const early=createNavalWorld();
  Object.assign(early.player,createVessel(early.field,early.water,early.beacon[0],early.beacon[2]));
  stepNaval(early);assert.equal(early.status,'sailing');assert.equal(early.score,0);
  until(w,w=>!w.enemy.hp && !w.shore.hp,NK.forward|NK.fire);
  assert.equal(w.score,200);
  assert.equal(w.status,'sailing');
  assert.ok(Math.hypot(w.player.p[0]-w.beacon[0],w.player.p[2]-w.beacon[2])>BEACON_RADIUS);
  for(const id of ['enemy','shore']){
    const hits=w.events.filter(e=>e.type==='damage' && e.target===id);
    assert.equal(hits.length,3);
    for(const hit of hits){
      assert.ok(w.events.some(e=>e.type==='launch' && e.shot===hit.shot && e.tick<hit.tick));
      assert.ok(w.events.some(e=>e.type==='impact' && e.shot===hit.shot && e.tick===hit.tick && e.target===id));
    }
  }
  assert.ok(w.field.sample(w.shore.p[0],w.shore.p[2]).height>w.water.level);
  until(w,w=>w.status==='victory',NK.forward);
  assert.equal(w.score,250);assert.equal(w.player.grounded,false);
  assert.deepEqual(w.events.slice(-2).map(e=>e.type),['beacon','outcome']);
  const exposed=createNavalWorld();
  until(exposed,w=>w.status==='defeat',NK.forward);
  assert.equal(exposed.reason,'vessel disabled');assert.equal(exposed.player.hp,0);
  assert.equal(exposed.events.filter(e=>e.type==='damage' && e.target==='player').length,5);
  assert.equal(exposed.enemy.hp,60);
});

test('hulls stop on approach, still respond to water while blocked, and can reverse apart',()=>{
  const w=createNavalWorld(),e=w.enemy;
  Object.assign(w.player,createVessel(w.field,w.water,0,-10));
  Object.assign(e,createVessel(w.field,w.water,0,-20,Math.PI));
  e.ammo=0;
  for(let i=0;i<230;i++){
    stepNaval(w,NK.forward);
    assert.ok(Math.hypot(w.player.p[0]-e.p[0],w.player.p[2]-e.p[2])>=2*Math.hypot(...HULL_HALF));
  }
  assert.equal(w.player.speed,0);assert.equal(w.player.wetPoints,6);
  const stopped=w.player.p[2];
  run(w,190,NK.back);assert.ok(w.player.p[2]>stopped+1);
});

test('fixed command playback at 30/60/144 Hz includes both ship and shore objectives',()=>{
  let same;
  for(const fps of [30,60,144]){
    const w=createNavalWorld(),clock=new Clock();
    for(let frame=0;frame<fps*30 && w.status==='sailing';frame++)
      clock.frame(frame*1000/fps,()=>stepNaval(w,NK.forward|NK.fire));
    assert.equal(w.status,'victory');
    const result=navalReceipt(w);
    assert.deepEqual(navalReceipt(replayNaval(JSON.stringify(result))),result);
    if(same)assert.deepEqual(result,same);
    same=result;
  }
});

test('bounded seeds, controls, replay family, cooldown, ammunition and mission timeout',()=>{
  const w=createNavalWorld(),initial=navalReceipt(w);
  for(const bad of [-1,1.2,NaN,Infinity,512])assert.throws(()=>stepNaval(w,bad));
  assert.deepEqual(navalReceipt(w),initial);
  let read=false;
  assert.throws(()=>createNavalWorld(Object.defineProperty({},'seed',{get(){read=true;return 0;}})));
  assert.equal(read,false);
  for(const seed of [0,0xffffffff])assert.equal(createNavalWorld({seed}).seed,seed);
  for(const patch of [{source:'other'},{mission:'glassworks'},{ticks:NAVAL_LIMIT+1},{ticks:1,commands:[[0,-1]]},
    {ticks:2,commands:[[0,1],[1,1]]},{ticks:1,commands:[[1,0]]},{stateHash:'deadbeef'}]){
    assert.throws(()=>replayNaval(JSON.stringify({...initial,...patch})));
  }
  assert.throws(()=>replayNaval(' '.repeat(300001)));
  assert.throws(()=>replayNaval(readFileSync('evidence/mech-warfare/winning-replay.json','utf8')));
  run(w,20,NK.fire);assert.equal(w.player.ammo,31);assert.equal(w.serial,1);
  until(w,w=>w.status==='defeat',NK.fire);
  assert.equal(w.reason,'cells exhausted');assert.equal(w.player.ammo,0);
  assert.equal(w.shots.some(s=>s.owner==='player'),false);
  const timeout=createNavalWorld();timeout.tick=NAVAL_LIMIT-1;stepNaval(timeout);
  assert.equal(timeout.reason,'time expired');
});
