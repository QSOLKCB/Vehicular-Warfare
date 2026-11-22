import test from 'node:test';
import assert from 'node:assert/strict';
import {Clock} from '../sim/clock.js';
import {createTankWorld,stepTank,tankReceipt,replayTank,TK,TANK_LIMIT,
  componentSight,barrelClear} from '../sim/tank-world.js';
import {createTracks,tankBasis,tankGun,HULL_HALF} from '../sim/tracks.js';
import {pulseSweep} from '../sim/tank-combat.js';
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';
import {add,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';

function run(w,count,command=0){
  for(let i=0;i<count && w.status==='driving';i++)stepTank(w,command);
}

test('the Cutbank shelf conceals every hull corner, exposes the turret and clears the bore',()=>{
  const w=createTankWorld();
  assert.deepEqual(componentSight(w.field,w.enemy,w.player),{hull:false,turret:false,point:null});
  run(w,180,TK.forward);
  run(w,100,TK.brake);
  assert.equal(w.player.speed,0);
  const seen=componentSight(w.field,w.enemy,w.player);
  assert.deepEqual([seen.hull,seen.turret],[false,true]);
  const eye=tankGun(w.enemy).pivot, p=w.player,basis=tankBasis(p);
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
    const corner=p.p.map((n,i)=>n+x*HULL_HALF[0]*basis.right[i]+
      y*HULL_HALF[1]*basis.up[i]+z*HULL_HALF[2]*basis.forward[i]);
    assert.ok(w.field.castSegment(eye,subtract(corner,eye)));
  }
  const trace=dst=>pulseSweep(w.field,{p:eye,step:subtract(dst,eye)},p,p);
  assert.equal(trace(p.p).id,'terrain');
  assert.deepEqual([trace(seen.point).id,trace(seen.point).component],['player','turret']);
  assert.ok(barrelClear(w.field,p));
  run(w,700,TK.brake|TK.fire);
  assert.equal(w.status,'victory');
  const injuries=w.events.filter(e=>e.type==='damage');
  assert.ok(injuries.some(e=>e.target==='player'));
  assert.ok(injuries.filter(e=>e.target==='enemy').length===3);
  assert.ok(injuries.every(e=>e.component==='turret'));
  for(const e of injuries){
    const shot=w.events.find(l=>l.type==='launch' && l.shot===e.shot);
    assert.ok(shot && shot.tick<e.tick && shot.owner===e.source);
    assert.ok(w.events.some(i=>i.type==='impact' && i.shot===e.shot && i.tick===e.tick));
  }
});

test('a pulse into the berm reaches the terrain after launch; a blocked bore spends no round',()=>{
  const w=createTankWorld();
  stepTank(w,TK.fire);
  assert.equal(w.shots.length,1);assert.equal(w.player.ammo,15);
  assert.deepEqual(w.shots[0].p,tankGun(w.player).muzzle);
  run(w,200);
  assert.equal(w.events.find(e=>e.type==='impact').target,'terrain');
  assert.equal(w.enemy.hp,60);
  // A thin lip sits in the gap in front of the tracks, inside the barrel
  // segment but below the tip. A muzzle-point-only test would miss it.
  const heights=[];
  for(let j=0;j<=128;j++)for(let i=0;i<=128;i++)heights.push(j===65 && Math.abs(i-64)<4?2:0);
  w.field=new Heightfield({cellsX:128,cellsZ:128,cellSize:.5,originX:-32,originZ:-32,heights});
  Object.assign(w.player,createTracks(w.field,0,3.1));
  Object.assign(w.enemy,createTracks(w.field,0,-24,Math.PI));
  const {pivot,muzzle}=tankGun(w.player);
  assert.ok(muzzle[1]>w.field.sample(muzzle[0],muzzle[2]).height);
  assert.ok(w.field.castSegment(pivot,subtract(muzzle,pivot)));
  assert.equal(barrelClear(w.field,w.player),false);
  stepTank(w,TK.fire);
  assert.equal(w.player.ammo,15);
  assert.equal(w.shots.length,0);
  assert.equal(w.events.at(-1).type,'blocked');
});

test('actual component entry faces select four distinct armour ratings',()=>{
  for(const [plate,amount] of [['front',20],['side',30],['rear',40],['top',50]]){
    const w=createTankWorld(),t=w.enemy;
    const {right,forward,up}=tankBasis(t);
    const outward={front:forward,rear:scale(forward,-1),side:right,top:up}[plate];
    // The hull roof outside the turret footprint gives a clean top hit.
    const aim=plate==='top'?add(t.p,scale(right,1.12)):t.p;
    const point=add(aim,scale(outward,4));
    w.shots.push({id:1,owner:'player',p:point,prev:point,step:scale(outward,-4),life:1});
    stepTank(w);
    const injury=w.events.find(e=>e.type==='damage');
    assert.deepEqual([injury.target,injury.component,injury.plate,injury.amount,injury.hp],
      ['enemy','hull',plate,amount,60-amount]);
  }
});

test('a translating hull can intercept a pulse that misses both endpoint poses',()=>{
  const w=createTankWorld();
  const old={...w.enemy,p:[-5,8,-22]},end={...w.enemy,p:[5,8,-22]};
  const shot={p:[0,8,-26],step:[0,0,8]};
  assert.equal(pulseSweep(w.field,shot,old,old),null);
  assert.equal(pulseSweep(w.field,shot,end,end),null);
  const hit=pulseSweep(w.field,shot,old,end);
  assert.equal(hit.id,'enemy');assert.equal(hit.component,'hull');assert.ok(hit.time>0 && hit.time<1);
});

test('the guard loses sight, searches a frozen observation and reacquires with a full reaction delay',()=>{
  const w=createTankWorld();
  run(w,180,TK.forward);
  assert.ok(w.enemy.seen>0 && w.enemy.mode==='acquiring');
  run(w,56,TK.brake);
  for(let i=0;i<600 && w.enemy.visible;i++)stepTank(w,TK.back);
  assert.equal(w.enemy.seen,0);assert.equal(w.enemy.mode,'search');
  const memory=w.enemy.lastSeen.slice();
  run(w,20,TK.back);
  assert.deepEqual(w.enemy.lastSeen,memory);
  run(w,200,TK.brake);
  assert.equal(w.enemy.lastSeen,null);assert.equal(w.enemy.mode,'idle');
  while(!w.enemy.visible && w.tick<2000)stepTank(w,TK.forward);
  assert.equal(w.enemy.seen,1);
  const first=w.tick,serial=w.serial;
  run(w,98,TK.forward);
  assert.equal(w.serial,serial);
  run(w,500,TK.brake);
  const launch=w.events.find(e=>e.type==='launch' && e.owner==='enemy' && e.tick>=first);
  assert.ok(launch && launch.tick>=first+99);
});

test('120 Hz command playback reproduces shelf victory across clock schedules and combat defeat',()=>{
  let expected;
  for(const hz of [30,60,144]){
    const w=createTankWorld(),clock=new Clock();
    for(let f=0;w.status==='driving' && f<2000;f++)
      clock.frame(f*1000/hz,()=>stepTank(w,w.tick<180?TK.forward:TK.brake|TK.fire));
    assert.equal(w.status,'victory');assert.equal(w.score,100);
    const r=tankReceipt(w);
    assert.deepEqual(tankReceipt(replayTank(JSON.stringify(r))),r);
    if(expected)assert.deepEqual(r,expected);
    expected=r;
  }
  const w=createTankWorld();
  run(w,1800,TK.forward);
  assert.equal(w.reason,'vehicle disabled');assert.equal(w.player.hp,0);
  assert.equal(w.status,'defeat');assert.equal(w.score,0);
  assert.ok(Math.hypot(w.player.p[0]-w.enemy.p[0],w.player.p[2]-w.enemy.p[2])>=5.1);
  assert.deepEqual(tankReceipt(replayTank(JSON.stringify(tankReceipt(w)))),tankReceipt(w));
});

test('bounded tracked packs, masks, replay validation, ordnance exhaustion and timeout',()=>{
  const w=createTankWorld(),initial=tankReceipt(w);
  let invoked=false;
  const accessor=Object.defineProperty({},'seed',{get(){invoked=true;return 622;}});
  assert.throws(()=>createTankWorld(accessor));assert.equal(invoked,false);
  for(const input of [NaN,Infinity,-1,1024,3.5])assert.throws(()=>stepTank(w,input));
  assert.deepEqual(tankReceipt(w),initial);
  assert.deepEqual(tankReceipt(replayTank(JSON.stringify(initial))),initial);
  for(const changes of [{source:'v0'}, {mission:'other'}, {ticks:TANK_LIMIT+1}, {seed:-1},
    {ticks:2,commands:[[0,1],[1,1]]}, {ticks:2,commands:[[1,0]]}, {stateHash:'f'.repeat(9)},
    {stateHash:'11111111'}, {extra:true}])
    assert.throws(()=>replayTank(JSON.stringify({...initial,...changes})));
  assert.throws(()=>replayTank(' '.repeat(300001)));
  run(w,2000,TK.fire);
  assert.equal(w.status,'defeat');assert.equal(w.reason,'magazine empty');assert.equal(w.shots.length,0);
  const timed=createTankWorld();
  timed.tick=TANK_LIMIT-1;stepTank(timed);
  assert.equal(timed.reason,'time expired');stepTank(timed,TK.forward);
  assert.equal(timed.tick,TANK_LIMIT);
});
