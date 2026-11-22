import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Clock} from '../sim/clock.js';
import {createMechWorld,stepMech,mechReceipt,replayMech,sightMech,MK,MECH_LIMIT,BEACON_RADIUS} from '../sim/mech-world.js';
import {createWalker,walkerGun} from '../sim/walker.js';
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';

function run(w,n,mask){
  for(let i=0;i<n && w.status==='walking';i++)stepMech(w,mask);
}

test('a fired pulse travels from the physical muzzle and terrain masks the patrolling sentinel',()=>{
  const w=createMechWorld(),gun=walkerGun(w.player),sight=sightMech(w);
  assert.equal(sight.clear,true);assert.equal(sight.visible,false);assert.equal(sight.target,'terrain');
  const enemyStart=w.enemy.p.slice();
  stepMech(w,MK.fire);
  const shot=w.shots[0];
  assert.deepEqual(shot.p,gun.muzzle);
  assert.equal(w.player.ammo,29);
  stepMech(w,MK.fire);
  assert.equal(w.shots.length,1);assert.ok(shot.p[2]<gun.muzzle[2]);
  run(w,130,0);
  const impact=w.events.find(e=>e.type==='impact' && e.shot===shot.id);
  assert.ok(impact.tick>1);assert.equal(impact.target,'terrain');
  assert.ok(Math.abs(w.field.sample(impact.point[0],impact.point[2]).height-impact.point[1])<1e-8);
  assert.equal(w.enemy.hp,60);
  assert.ok(w.enemy.steps>=1);assert.notEqual(w.enemy.p[2],enemyStart[2]);
  assert.equal(w.enemy.visible,false);assert.equal(w.enemy.lastSeen,null);
  assert.ok(!w.events.some(e=>e.type==='launch' && e.owner==='enemy'));
});

test('an obstacle between mount and muzzle blocks launch even with the tip in open space',()=>{
  const w=createMechWorld(),heights=[];
  for(let j=0;j<=128;j++)for(let i=0;i<=128;i++)heights.push(i===64 && j===62?6:0);
  w.field=new Heightfield({cellsX:128,cellsZ:128,cellSize:.5,originX:-32,originZ:-32,heights});
  Object.assign(w.player,createWalker(w.field,0,0));
  Object.assign(w.enemy,createWalker(w.field,0,-22,Math.PI));
  const {muzzle}=walkerGun(w.player);
  assert.ok(muzzle[1]>w.field.sample(muzzle[0],muzzle[2]).height);
  assert.equal(sightMech(w).clear,false);
  stepMech(w,MK.fire);
  assert.equal(w.player.ammo,30);assert.equal(w.shots.length,0);
  assert.ok(w.events.some(e=>e.type==='blocked' && e.source==='player'));
});

test('the crossing requires both sentinel destruction and supported entry into the beacon',()=>{
  const w=createMechWorld();
  // A beacon visit while the defender lives cannot complete the mission.
  Object.assign(w.player,createWalker(w.field,w.beacon[0],w.beacon[2]));
  stepMech(w,0);
  assert.equal(w.status,'walking');assert.equal(w.score,0);
  const approach=createMechWorld();
  while(approach.enemy.hp && approach.tick<2000)stepMech(approach,MK.forward|MK.fire);
  assert.equal(approach.enemy.hp,0);assert.equal(approach.status,'walking');assert.equal(approach.score,100);
  assert.equal(approach.enemy.visible,false);assert.equal(approach.enemy.mode,'disabled');
  const outside=Math.hypot(approach.player.p[0]-approach.beacon[0],approach.player.p[2]-approach.beacon[2]);
  assert.ok(outside>BEACON_RADIUS);
  run(approach,2000,MK.forward);
  assert.equal(approach.status,'victory');assert.equal(approach.score,150);
  assert.ok(approach.player.supportCount>=3);
  assert.deepEqual(approach.events.slice(-2).map(e=>e.type),['beacon','outcome']);
  for(const e of approach.events.filter(e=>e.type==='damage')){
    assert.ok(['pelvis','torso'].includes(e.component));
    assert.ok(approach.events.some(l=>l.type==='launch' && l.owner===e.source && l.shot===e.shot && l.tick<e.tick));
    assert.ok(approach.events.some(i=>i.type==='impact' && i.shot===e.shot && i.tick===e.tick));
  }
});

test('accepted control playback is identical at 30, 60 and 144 Hz including foot state and events',()=>{
  let baseline;
  for(const fps of [30,60,144]){
    const w=createMechWorld(),clock=new Clock();
    for(let f=0;w.status==='walking' && f<fps*25;f++){
      clock.frame(f*1000/fps,()=>stepMech(w,MK.forward|MK.fire));
    }
    assert.equal(w.status,'victory');
    const r=mechReceipt(w);
    assert.deepEqual(mechReceipt(replayMech(JSON.stringify(r))),r);
    if(baseline)assert.deepEqual(r,baseline);
    baseline=r;
  }
});

test('guard acquisition has a full reaction delay and actual returned pulses can disable the player',()=>{
  const w=createMechWorld();
  while(!w.enemy.visible && w.tick<1800)stepMech(w,MK.forward);
  assert.equal(w.enemy.seen,1);
  const first=w.tick;
  run(w,118,MK.forward);
  assert.ok(!w.events.some(e=>e.type==='launch' && e.owner==='enemy'));
  run(w,2400,MK.forward);
  assert.equal(w.status,'defeat');assert.equal(w.player.hp,0);
  assert.ok(w.events.find(e=>e.type==='launch' && e.owner==='enemy').tick>=first+119);
  assert.equal(w.events.filter(e=>e.type==='damage' && e.target==='player').length,5);
  assert.deepEqual(mechReceipt(replayMech(JSON.stringify(mechReceipt(w)))),mechReceipt(w));
});

test('bounded mech inputs, campaign timeout, ammunition exhaustion and separate replay identities',()=>{
  const w=createMechWorld(),initial=mechReceipt(w);
  const ground=readFileSync('evidence/tracked-warfare/winning-replay.json','utf8');
  const classic=JSON.parse(readFileSync('evidence/browser/playthrough.json','utf8')).win.receipt;
  assert.throws(()=>replayMech(ground));assert.throws(()=>replayMech(JSON.stringify(classic)));
  assert.match(initial.source,/^vw-003:[0-9a-f]{64}$/);
  for(const invalid of [NaN,-1,3.2,512,Infinity])assert.throws(()=>stepMech(w,invalid));
  assert.deepEqual(mechReceipt(w),initial);
  let accessed=false;
  const bad=Object.defineProperty({},'seed',{get(){accessed=true;return 0;}});
  assert.throws(()=>createMechWorld(bad));assert.equal(accessed,false);
  for(const patch of [{ticks:MECH_LIMIT+1},{mission:'cutbank'},{source:'unknown'},
    {ticks:2,commands:[[0,1],[1,1]]},{ticks:1,commands:[[0,512]]},{ticks:3,commands:[[1,0]]},{eventHash:'00000000'}]){
    assert.throws(()=>replayMech(JSON.stringify({...initial,...patch})));
  }
  assert.throws(()=>replayMech(' '.repeat(300001)));
  run(w,2500,MK.fire);
  assert.equal(w.status,'defeat');assert.equal(w.reason,'cells exhausted');
  assert.equal(w.player.ammo,0);assert.equal(w.shots.length,0);
  const timeout=createMechWorld();timeout.tick=MECH_LIMIT-1;stepMech(timeout);
  assert.equal(timeout.status,'defeat');assert.equal(timeout.reason,'time expired');
});

test('walkers arrest an approaching stride at separation, replant their feet and can reverse',()=>{
  const w=createMechWorld();
  Object.assign(w.player,createWalker(w.field,0,-20));
  for(let i=0;i<220 && !w.player.blocked;i++)stepMech(w,MK.forward);
  assert.ok(w.player.blocked);assert.equal(w.player.plan,null);assert.equal(w.player.speed,0);
  const stop=w.player.p[2];
  for(let i=0;i<120;i++){
    stepMech(w,MK.back);
    assert.ok(Math.hypot(w.player.p[0]-w.enemy.p[0],w.player.p[2]-w.enemy.p[2])>=6.2);
  }
  assert.ok(w.player.p[2]>stop+1);assert.ok(w.player.supportCount>=3);
});

test('hiding behind the berm freezes the guard observation, expires its search and clears acquisition',()=>{
  const w=createMechWorld();
  while(!w.enemy.visible && w.tick<1200)stepMech(w,MK.forward);
  assert.equal(w.enemy.seen,1);
  while(w.enemy.visible && w.tick<2000)stepMech(w,MK.back);
  assert.equal(w.enemy.mode,'search');assert.equal(w.enemy.seen,0);
  const position=w.enemy.lastSeen.slice();
  run(w,12,0);assert.deepEqual(w.enemy.lastSeen,position);
  run(w,130,0);assert.equal(w.enemy.lastSeen,null);assert.equal(w.enemy.mode,'patrol');
  while(!w.enemy.visible && w.tick<2400)stepMech(w,MK.forward);
  assert.equal(w.enemy.seen,1);assert.equal(w.enemy.mode,'acquiring');
});
