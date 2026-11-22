import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCommandWorld,issueOrder,stepCommand,commandContacts,commandReceipt,replayCommand}
  from '../sim/command-world.js';
import {createVehicle} from '../sim/combined-vehicles.js';
import {combinedReceipt,replayCombined,COMBINED_LIMIT} from '../sim/combined-world.js';

const air='cobalt-helicopter',tank='cobalt-tank',mech='cobalt-mech',ship='cobalt-ship';
const body=(w,id)=>w.actors.find(a=>a.id===id);
const move=(x,z)=>({type:'MOVE',x,z});
const attack=target=>({type:'ATTACK',target});
const give=(w,units,order,append=false)=>issueOrder(w,{tick:w.tick,units,append,...order});
function ticks(w,count,observe){
  for(let i=0;i<count && w.status==='active';i++){
    stepCommand(w);
    observe?.(w);
  }
}
function relocate(w,a,x,z,yaw=0){
  Object.assign(a,createVehicle(w,a.kind,a.id,a.faction,x,z,yaw),{home:[x,z],seen:0,target:null});
}
function only(w,ids){
  for(const a of w.actors)if(!ids.includes(a.id))a.hp=0;
}

test('simultaneous replacement and waypoint orders use stable member IDs and copied input data',()=>{
  function run(reverse){
    const w=createCommandWorld(),units=reverse?[tank,air]:[air,tank];
    give(w,units,move(-22,19));
    units[0]='bogus';
    const order=move(-20,14);
    give(w,[tank],order,true);
    order.x=80;
    give(w,[mech],{type:'HOLD'});
    ticks(w,16);
    const r=commandReceipt(w);
    assert.deepEqual(w.units[tank].queue.map(({x,z})=>[x,z]),[[-22,19],[-20,14]]);
    assert.deepEqual(r.orders[0].units,[air,tank]);
    assert.deepEqual(r.orders.map(o=>o.tick),[0,0,0]);
    give(w,[tank],{type:'DEFEND',x:-23,z:18});
    assert.equal(w.units[tank].queue.length,1);
    return commandReceipt(w);
  }
  const receipt=run(false);
  assert.deepEqual(run(true),receipt);
  assert.deepEqual(commandReceipt(replayCommand(JSON.stringify(receipt))),receipt);
});

test('invalid group commands and overflowing waypoint queues reject atomically, without calling accessors',()=>{
  const w=createCommandWorld(),valid={tick:0,append:false,units:[air],...move(-18,7)};
  let invoked=false;
  const trap=()=>{invoked=true;throw Error('getter called');};
  const getter={...valid};Object.defineProperty(getter,'x',{enumerable:true,get:trap});
  const member=[air];Object.defineProperty(member,'0',{get:trap});
  for(const wrong of [null,[],{...valid,units:['unknown']},{...valid,units:[air,'ember-ship']},
    {...valid,units:[air,air]},{...valid,units:[]},{...valid,units:[,tank]},
    {...valid,tick:1},{...valid,tick:-1},{...valid,tick:COMBINED_LIMIT+1},
    {...valid,x:145},{...valid,z:NaN},{...valid,x:Infinity},{...valid,z:'9'},
    {...valid,type:'PATROL'},{...valid,type:'RETREAT'},{...valid,append:1},
    {...valid,type:'HOLD'},{...valid,extra:true},getter,{...valid,units:member},
    {...valid,type:'ATTACK',target:ship},{...valid,units:Array(5000).fill(air)}]){
    const before=commandReceipt(w),state=structuredClone(w.units);
    assert.throws(()=>issueOrder(w,wrong));
    assert.deepEqual(commandReceipt(w),before);assert.deepEqual(w.units,state);
  }
  assert.equal(invoked,false);
  for(let i=0;i<8;i++)give(w,[tank],move(-18,8+i),true);
  const before=commandReceipt(w),queues=structuredClone(w.units);
  assert.throws(()=>give(w,[air,tank],move(-18,12),true));
  assert.deepEqual(commandReceipt(w),before);assert.deepEqual(w.units,queues);
});

test('mixed group commands actuate tracks, tripod support, lift and six-column buoyancy',()=>{
  const w=createCommandWorld();
  for(const a of w.actors)a.ammo=0; // Isolate locomotion from premature mission kills.
  give(w,[air,tank],move(-25,16));
  give(w,[mech],move(-8,16));give(w,[ship],move(12,14));
  const start=Object.fromEntries([air,tank,mech,ship].map(id=>[id,body(w,id).p.slice()]));
  let turned=false,walked=false,sailed=false,flew=false;
  const completed=new Set();
  ticks(w,1600,()=>{
    const t=body(w,tank),m=body(w,mech),s=body(w,ship),h=body(w,air);
    turned ||= Math.abs(t.leftSpeed-t.rightSpeed)>.1 && Math.abs(t.yaw)>.01;
    walked ||= m.steps>0 && m.feet.some(f=>!f.stance) && m.supportCount>=3;
    sailed ||= s.wetPoints>0 && s.displacedVolume>0 && s.speed>1 && !s.grounded;
    flew ||= Math.abs(h.bank)+Math.abs(h.pitch)>.05 && Math.hypot(...h.v)>1;
    assert.ok(h.p[1]>=w.field.sample(h.p[0],h.p[2]).height+w.offset-1e-5);
    for(const id of Object.keys(start)){
      if(w.units[id].status==='completed')completed.add(id);
      const a=body(w,id);
      const displacement=Math.hypot(...a.p.map((n,k)=>n-start[id][k]));
      assert.ok(displacement<.4*w.tick+1e-8,'bounded travel per accepted tick');
    }
  });
  assert.deepEqual([turned,walked,sailed,flew],[true,true,true,true]);
  assert.ok(completed.has(ship) && completed.has(mech),'reachable coastal channel and shore destinations');
  assert.ok(completed.has(air) || completed.has(tank),'mixed group advances to its marker');
  for(const id of Object.keys(start)){
    const a=body(w,id);
    assert.ok(Math.hypot(a.p[0]-start[id][0],a.p[2]-start[id][2])>10,id);
  }
});

test('ship attempting a dry crossing grounds and reports an obstruction within the mission limit',()=>{
  const w=createCommandWorld(),s=body(w,ship);
  only(w,[ship]);give(w,[ship],move(-18,12));
  let grounded=false;
  for(let i=0;i<4800 && w.units[ship].status!=='blocked' && w.status==='active';i++){
    stepCommand(w);grounded ||= s.grounded;
  }
  assert.equal(w.units[ship].status,'blocked');
  assert.ok(grounded,'six-column cutter reached the seabed');
  assert.ok(Math.hypot(s.p[0]+18,s.p[2]-12)>8);
  const position=s.p.slice();ticks(w,480);
  assert.ok(Math.hypot(s.p[0]-position[0],s.p[2]-position[2])<5);
});

test('designation requires a friendly observation and losing island sight stops tracking and fire',()=>{
  const w=createCommandWorld(),s=body(w,ship),enemy=body(w,'ember-helicopter');
  only(w,[ship,enemy.id]);relocate(w,s,38,-48,Math.PI);
  relocate(w,enemy,38,-30);enemy.ammo=0;
  assert.ok(commandContacts(w).includes(enemy.id));
  give(w,[ship],attack(enemy.id));ticks(w,30);
  relocate(w,enemy,72,2);
  assert.ok(!commandContacts(w).includes(enemy.id));
  const before=commandReceipt(w);
  assert.throws(()=>give(w,[ship],attack(enemy.id)));
  assert.deepEqual(commandReceipt(w),before);
  const serial=w.serial;ticks(w,120);
  assert.equal(w.serial,serial);assert.equal(s.target,null);
  assert.ok(!commandContacts(w).includes(enemy.id));
  relocate(w,enemy,38,-30);
  assert.ok(commandContacts(w).includes(enemy.id));give(w,[ship],attack(enemy.id));
});

test('the four archived numerical Breakwater receipts survive the controller extension',()=>{
  const source=new URL('../evidence/combined-arms/mixed-measure.json',import.meta.url);
  for(const {receipt} of JSON.parse(readFileSync(source)).runs){
    assert.deepEqual(combinedReceipt(replayCombined(JSON.stringify(receipt))),receipt);
  }
});

test('tank reports an occupied point and a wet direct route as blocked and stays on dry tracks',()=>{
  for(const occupied of [false,true]){
    const w=createCommandWorld(),t=body(w,tank);
    only(w,occupied?[tank,mech]:[tank]);
    if(occupied)relocate(w,body(w,mech),-18,20);
    const goal=occupied?move(-18,20):move(26,5);
    give(w,[tank],goal);give(w,[tank],move(-18,30),true);
    ticks(w,2700);
    assert.equal(w.units[tank].status,'blocked');
    assert.equal(w.units[tank].queue.length,0);
    assert.ok(w.field.sample(t.p[0],t.p[2]).height>w.water.level);
    assert.ok(w.units[tank].distance>3);
    if(occupied)assert.ok(Math.hypot(t.p[0]+18,t.p[2]-20)>6);
  }
});

test('HOLD crews stop and engage, DEFEND crews reach the point and remain on station',()=>{
  const w=createCommandWorld(),t=body(w,tank),anchor=t.p.slice();
  for(const a of w.actors)if(a.faction==='ember')a.ammo=0;
  give(w,[tank],{type:'HOLD'});give(w,[mech],{type:'DEFEND',x:-8,z:26});
  let onStation=0;
  const launches=[];
  ticks(w,720,()=>{
    assert.deepEqual(t.p,anchor);
    const u=w.units[mech],m=body(w,mech);
    if(u.onStation){
      onStation++;
      assert.ok(Math.hypot(m.p[0]+8,m.p[2]-26)<=8);
    }
    launches.push(...w.events.filter(e=>e.tick===w.tick && e.type==='launch'));
  });
  assert.ok(launches.some(e=>e.owner===tank),'hold engages visible threats');
  assert.ok(launches.some(e=>e.owner===mech),'defend engages visible threats');
  assert.ok(onStation>240);
  assert.equal(w.units[mech].queue[0].type,'DEFEND');
});

test('multi-crew victory uses prior physical launches, a real gate crossing and survives loss of command units',()=>{
  const w=createCommandWorld(),events=[];
  give(w,[air],move(-16,3));give(w,[tank],attack('relay'));
  give(w,[mech],{type:'DEFEND',x:-8,z:17});give(w,[ship],move(12,15));
  const maximum=COMBINED_LIMIT;
  let continued=false,capturedBy;
  ticks(w,maximum,()=>{
    const current=w.events.filter(e=>e.tick===w.tick);
    events.push(...current);
    continued ||= w.player.hp===0 && w.status==='active';
    const capture=current.find(e=>e.type==='beacon');
    if(capture){
      capturedBy=body(w,capture.source);
      assert.ok(capturedBy.hp>0 && w.relay.hp===0);
      assert.ok(Math.hypot(capturedBy.p[0]-w.beacon[0],capturedBy.p[2]-w.beacon[2])<=8);
    }
  });
  assert.ok(continued && capturedBy);
  assert.equal(w.status,'victory');assert.ok(w.mobileKills>=2);
  assert.ok(w.actors.some(a=>a.faction==='cobalt' && a.hp>0));
  assert.equal(w.units[mech].status,'cancelled');
  assert.equal(w.units[mech].lastResult.type,'DEFEND');
  assert.equal(w.units[mech].lastResult.status,'cancelled');
  assert.equal(w.units[mech].queue.length,0);
  const launches=new Map(events.filter(e=>e.type==='launch').map(e=>[e.shot,e]));
  const impacts=new Map(events.filter(e=>e.type==='impact').map(e=>[e.shot,e]));
  const hits=events.filter(e=>e.type==='damage' && e.shot!==null);
  assert.ok(hits.some(e=>e.source===tank && e.target==='relay'));
  for(const e of hits){
    const launch=launches.get(e.shot),impact=impacts.get(e.shot);
    assert.equal(launch.owner,e.source);assert.ok(launch.tick<e.tick);
    assert.equal(impact.target,e.target);assert.equal(impact.tick,e.tick);
  }
  const receipt=commandReceipt(w);
  assert.deepEqual(commandReceipt(replayCommand(JSON.stringify(receipt))),receipt);
  assert.throws(()=>give(w,[tank],{type:'HOLD'}));stepCommand(w);
  assert.deepEqual(commandReceipt(w),receipt);
});

test('destroyed friendly recipients and replay tampering fail admission and verification',()=>{
  const w=createCommandWorld();give(w,[air,tank],move(-22,18));ticks(w,90);
  give(w,[mech],{type:'HOLD'});const r=commandReceipt(w);
  for(const patch of [
    {version:2},{source:'other'},{scenario:'other'},{seed:-2},
    {roster:r.roster.slice(1)},{ticks:-1},{ticks:COMBINED_LIMIT+1},
    {stateHash:'deadbeef'},{eventHash:'cafebabe'},{outcome:'defeat'},
    {orders:r.orders.toReversed()},
    {orders:[{...r.orders[0],units:r.orders[0].units.toReversed()},r.orders[1]]},
    {orders:[{...r.orders[0],x:r.orders[0].x+1},r.orders[1]]},
    {orders:[{tick:0,units:[tank],append:false,type:'ATTACK',target:air}]}
  ])assert.throws(()=>replayCommand(JSON.stringify({...r,...patch})));
  const m=body(w,mech);m.hp=0;stepCommand(w);const before=commandReceipt(w);
  assert.throws(()=>give(w,[tank,mech],move(-10,12)));
  assert.deepEqual(commandReceipt(w),before);
});

test('mission order history and command time have independent hard bounds',()=>{
  const w=createCommandWorld();
  for(let i=0;i<1024;i++)give(w,[ship],{type:'HOLD'});
  const before=commandReceipt(w);
  assert.throws(()=>give(w,[ship],{type:'HOLD'}));assert.deepEqual(commandReceipt(w),before);
  assert.deepEqual(commandReceipt(replayCommand(JSON.stringify(before))),before);
  const timeout=createCommandWorld();
  give(timeout,[air],move(-35,-36));ticks(timeout,COMBINED_LIMIT);
  assert.equal(timeout.status,'defeat');assert.equal(timeout.tick,COMBINED_LIMIT);
  assert.equal(timeout.reason,'command time expired');
  assert.throws(()=>give(timeout,[tank],{type:'HOLD'}));
});
