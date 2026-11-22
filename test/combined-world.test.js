import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalize,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {BK,CLASSES,createVehicle,vehicleGun,targetPoint,driveVehicle,vehicleParts} from '../sim/combined-vehicles.js';
import {Clock} from '../sim/clock.js';
import {createCombinedWorld,stepCombined,combinedReceipt,replayCombined,sightCombined,
  COMBINED_LIMIT,MAX_PULSES,REQUIRED_DEFENDERS} from '../sim/combined-world.js';
import {mixedContact} from '../sim/combined-contact.js';

const crossingControls=w=>(w.captured?(w.selection==='tank'?BK.brake:0):BK.forward)|BK.fire;
const manualShot=BK.fire|BK.aimLeft|BK.aimRight;
const run=(w,n,cmd=0)=>{for(let i=0;i<n && w.status==='active';i++)stepCombined(w,cmd);};
function place(w,a,x,z,yaw=0){
  Object.assign(a,createVehicle(w,a.kind,a.id,a.faction,x,z,yaw),{home:[x,z],target:null,seen:0});
}
function direct(a,point){
  const dir=normalize(subtract(point,vehicleGun(a).pivot));
  const yaw=Math.atan2(dir[0],-dir[2]),angle=Math.asin(dir[1]);
  if(a.kind==='helicopter'){a.yaw=yaw;a.aim=angle;}
  if(a.kind==='tank'){a.turretYaw=yaw;a.elevation=angle;}
  if(a.kind==='mech'){a.torsoYaw=yaw;a.elevation=angle;}
  if(a.kind==='ship'){a.mountYaw=yaw;a.elevation=angle;}
}
function duel(source,destination,positions){
  const w=createCombinedWorld(undefined,source);
  const a=w.player,b=w.actors.find(x=>x.faction==='ember' && x.kind===destination);
  for(const actor of w.actors)if(actor!==a && actor!==b)actor.hp=0;
  place(w,a,...positions[0]);
  if(b.kind==='relay')b.p=[positions[1][0],w.field.sample(...positions[1]).height+b.half[1],positions[1][1]];
  else place(w,b,...positions[1],Math.PI);
  b.ammo=0;
  direct(a,targetPoint(b));
  return {w,a,b};
}

test('actual mixed plays record allied and player contributions and each vehicle can secure its own gate',()=>{
  for(const kind of CLASSES){
    const w=createCombinedWorld(undefined,kind),ids=w.actors.map(a=>a.id);
    assert.equal(new Set(ids).size,9);assert.equal(w.selection,kind);
    const record=[];
    while(w.status==='active'){
      stepCombined(w,crossingControls(w));
      record.push(...w.events.filter(e=>e.tick===w.tick));
      assert.ok(w.shots.length<=MAX_PULSES && w.events.length<=96);
    }
    assert.equal(w.status,'victory',kind);
    assert.ok(w.captured && w.mobileKills>=REQUIRED_DEFENDERS);
    assert.ok(record.some(e=>e.type==='damage' && e.source===w.player.id && e.target.startsWith('ember-')));
    assert.ok(record.some(e=>e.type==='damage' && e.source===w.player.id && e.target==='relay'));
    assert.ok(record.some(e=>e.type==='damage' && e.source!==w.player.id && e.target==='relay'));
    assert.ok(record.some(e=>e.type==='launch' && e.owner.startsWith('ember-')));
    const linked=record.find(e=>e.type==='beacon'),destroyed=record.find(e=>e.type==='destroy'&&e.target==='relay');
    assert.ok(destroyed.tick<linked.tick);assert.equal(record.at(-1).type,'outcome');
    assert.deepEqual(w.actors.map(a=>a.id),ids);
    assert.ok(record.every((e,i)=>i===0 || record[i-1].tick<=e.tick));
    const launched=record.filter(e=>e.type==='launch').map(e=>e.shot);
    assert.deepEqual(launched,Array.from({length:w.serial},(_,i)=>i+1));
    for(const e of record.filter(e=>e.type==='damage' && e.shot!==null)){
      assert.ok(record.some(l=>l.type==='launch' && l.owner===e.source && l.shot===e.shot && l.tick<e.tick));
      assert.ok(record.some(i=>i.type==='impact' && i.shot===e.shot && i.tick===e.tick));
    }
  }
});

for(const [source,target,positions] of [
  ['helicopter','tank',[[-18,18],[-18,-8]]],['tank','mech',[[-14,16],[-14,-5]]],
  ['mech','helicopter',[[-12,32],[-12,3]]],['ship','relay',[[12,15],[-3,-6]]],
  ['helicopter','ship',[[12,38],[12,13]]]
]){
  test(source+' signal pulse reaches the '+target+' through the common impact ledger',()=>{
    const {w,a,b}=duel(source,target,positions),hp=b.hp;
    const gun=vehicleGun(a),ammo=a.ammo;
    stepCombined(w,manualShot);
    const shot=w.shots.find(s=>s.owner===a.id);
    assert.ok(shot);assert.ok(Math.hypot(...subtract(shot.p,gun.muzzle))<.03);
    assert.equal(b.hp,hp);assert.equal(a.ammo,ammo-1);
    for(let i=0;i<180 && b.hp===hp;i++)stepCombined(w,0);
    const impact=w.events.find(e=>e.type==='impact' && e.shot===shot.id);
    assert.equal(impact?.target,b.id,JSON.stringify(impact));
    const hurt=w.events.find(e=>e.type==='damage' && e.shot===shot.id);
    assert.equal(hurt?.target,b.id);assert.ok(hurt.tick>1);assert.equal(hurt.hp,b.hp);
    if(target==='tank')assert.ok(['front','rear','side','top'].includes(hurt.plate));
  });
}
test('the fixed shore relay acquires and physically tags a flying target',()=>{
  const w=createCombinedWorld(),a=w.player,r=w.relay;
  for(const body of w.actors)if(body!==a && body!==r)body.hp=0;
  place(w,a,-9,18);
  run(w,94);
  assert.equal(w.events.some(e=>e.type==='launch'),false);
  for(let i=0;i<400 && a.hp===100;i++)stepCombined(w,0);
  const e=w.events.find(e=>e.type==='damage' && e.source===r.id);
  assert.equal(e?.target,a.id);assert.ok(e.shot>0 && e.tick>100);
});
test('same-faction bodies stop pulses without taking damage or becoming CPU targets',()=>{
  const {w,a,b}=duel('helicopter','helicopter',[[-18,30],[-18,-6]]);
  const friend=w.actors.find(x=>x.kind==='tank' && x.faction===a.faction);
  place(w,friend,-18,13);
  // The helicopter's descending shot crosses the ally's actual tank box.
  direct(a,targetPoint(friend));friend.ammo=0;b.ammo=0;
  const hp=friend.hp;stepCombined(w,manualShot);
  run(w,90);
  const hits=w.events.filter(e=>e.type==='impact' && e.source===a.id);
  assert.ok(hits.some(h=>h.target===friend.id),JSON.stringify(hits));
  assert.equal(friend.hp,hp);assert.equal(b.hp,100);
  assert.ok(!sightCombined(w).visible.includes(friend.id));
  for(const actor of w.actors.filter(x=>x.target))
    assert.notEqual(w.actors.find(x=>x.id===actor.target).faction,actor.faction);
});
test('an estuary island masks a flying opponent from a ship and intercepts the travelling cell',()=>{
  const {w,a,b}=duel('ship','helicopter',[[38,-48,Math.atan2(34,-50)],[72,2]]);
  // The east skerry rises through the bearing from the west channel.
  assert.ok(w.field.castSegment(vehicleGun(a).pivot,subtract(targetPoint(b),vehicleGun(a).pivot)));
  assert.ok(!sightCombined(w).visible.includes(b.id));
  stepCombined(w,manualShot);run(w,145);
  const impact=w.events.find(e=>e.type==='impact' && e.source===a.id);
  assert.equal(impact?.target,'terrain');
  assert.ok(Math.abs(impact.point[1]-w.field.sample(impact.point[0],impact.point[2]).height)<1e-7);
  assert.ok(impact.point[1]>w.water.level);assert.equal(b.hp,100);
});

test('a CPU cutter loses its track behind the island and must acquire again after re-exposure',()=>{
  const w=createCombinedWorld(),a=w.player,ship=w.actors.find(x=>x.id==='ember-ship');
  for(const other of w.actors)if(other!==a && other!==ship)other.hp=0;
  place(w,ship,38,-48,Math.PI);
  place(w,a,38,-30);
  run(w,55);assert.equal(ship.target,a.id);assert.ok(ship.seen>0 && ship.seen<100);
  place(w,a,72,2);
  stepCombined(w);assert.equal(ship.target,null);assert.equal(ship.seen,0);
  run(w,45);assert.equal(ship.target,null);
  place(w,a,38,-30);run(w,95);
  assert.equal(ship.target,a.id);assert.ok(ship.seen>0 && ship.seen<100);
  assert.equal(w.events.some(e=>e.type==='launch' && e.owner===ship.id),false);
  run(w,120);assert.ok(w.events.some(e=>e.type==='launch' && e.owner===ship.id));
});

test('a descending helicopter cell ends at the first water surface in the channel',()=>{
  const w=createCombinedWorld(),a=w.player;
  for(const other of w.actors)if(other!==a)other.hp=0;
  place(w,a,90,30);a.aim=-.7;
  stepCombined(w,manualShot);assert.equal(w.shots.length,1);
  const shot=w.shots[0].id;
  run(w,70);
  const impact=w.events.find(e=>e.type==='impact' && e.shot===shot);
  assert.equal(impact?.target,'water');assert.ok(impact.tick>1);
  assert.equal(impact.point[1],w.water.level);
  assert.ok(w.field.sample(impact.point[0],impact.point[2]).height<impact.point[1]);
  assert.ok(!w.events.some(e=>e.type==='damage' && e.shot===shot));
});

test('swept mobile contact competes with water, terrain and world edge in chronological order',()=>{
  const w=createCombinedWorld(),a=w.actors.find(x=>x.kind==='helicopter');
  const line=[12,18,22],step=[0,0,-12];
  const left={...a,p:[9,18,16]},right={...a,p:[15,18,16]};
  w.actors=[left];
  assert.equal(mixedContact(w,'cell',line,step),null);
  w.actors=[right];
  assert.equal(mixedContact(w,'cell',line,step),null);
  assert.equal(mixedContact(w,'cell',line,step,[left])?.component,'airframe');
  w.actors=[];
  assert.equal(mixedContact(w,'cell',[12,2,16],[0,-10,0]).id,'water');
  assert.equal(mixedContact(w,'cell',[-18,4,16],[0,-10,0]).id,'terrain');
  assert.equal(mixedContact(w,'cell',[143,70,16],[4,0,0]).id,'boundary');
  const submerged={...a,p:[12,-2,16]};w.actors=[submerged];
  assert.equal(mixedContact(w,'cell',[12,2,16],[0,-10,0]).id,'water');
  const afloat={...a,p:[12,1,16]};w.actors=[afloat];
  assert.equal(mixedContact(w,'cell',[12,2,16],[0,-10,0]).id,afloat.id);
});

test('turning cutter retains the start-of-tick side of a shrinking contact box',()=>{
  const w=createCombinedWorld(),ship=createVehicle(w,'ship','escort','cobalt',90,30);
  w.actors=[ship];
  for(let i=0;i<251;i++)driveVehicle(w,ship,BK.forward|BK.right);
  const start={...ship},before=vehicleParts(start)[0];
  driveVehicle(w,ship,BK.forward|BK.right);
  const after=vehicleParts(ship)[0];
  assert.ok(after.half[2]<before.half[2]);
  const p=start.p.slice();p[2]-=(before.half[2]+after.half[2])/2;
  const hit=mixedContact(w,'cell',p,[0,0,-.5],[start]);
  assert.equal(hit?.component,'hull');assert.equal(hit.time,0);
});

test('vehicle and faction are replayed deterministically across presentation schedules and defeat',()=>{
  for(const kind of CLASSES){
    let prior;
    for(const rate of [30,60,144]){
      const w=createCombinedWorld(undefined,kind),clock=new Clock();
      for(let f=0;w.status==='active' && f<rate*25;f++)clock.frame(f*1000/rate,()=>stepCombined(w,crossingControls(w)));
      assert.equal(w.status,'victory');
      const receipt=combinedReceipt(w);
      if(prior)assert.deepEqual(receipt,prior);
      prior=receipt;
    }
    assert.deepEqual(combinedReceipt(replayCombined(JSON.stringify(prior))),prior);
  }
  const w=createCombinedWorld();run(w,2500);
  assert.equal(w.status,'defeat');assert.equal(w.player.hp,0);
  assert.ok(w.events.some(e=>e.type==='destroy' && e.target===w.player.id && e.shot>0));
  const r=combinedReceipt(w);assert.deepEqual(combinedReceipt(replayCombined(JSON.stringify(r))),r);
});
test('replay validation, seed validation and command rejection preserve accepted state',()=>{
  const w=createCombinedWorld(),r=combinedReceipt(w);
  let called=false;
  assert.throws(()=>createCombinedWorld(Object.defineProperty({},'seed',{get(){called=true;}})));
  assert.equal(called,false);assert.throws(()=>createCombinedWorld(undefined,'kestrel'));
  for(const bad of [NaN,2.5,-1,16384])assert.throws(()=>stepCombined(w,bad));
  assert.deepEqual(combinedReceipt(w),r);
  for(const patch of [{selection:'relay'},{selection:'mech'},{mission:'lantern'},{source:'old'},
    {ticks:COMBINED_LIMIT+1},{ticks:1,commands:[[0,16384]]},{ticks:2,commands:[[0,0],[1,0]]},
    {ticks:2,commands:[[1,0]]},{eventHash:'cafefeed'}])assert.throws(()=>replayCombined(JSON.stringify({...r,...patch})));
  assert.throws(()=>replayCombined(' '.repeat(300001)));
  assert.throws(()=>replayCombined(readFileSync('evidence/naval-warfare/winning-replay.json','utf8')));
  w.tick=COMBINED_LIMIT-1;stepCombined(w);assert.equal(w.reason,'held too long');
});
