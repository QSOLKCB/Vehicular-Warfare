import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCommandWorld,issueOrder,stepCommand,replayCommand,commandReceipt} from '../sim/command-world.js';
import {createFormationWorld,issueFormationOrder,stepFormation,formationReceipt,replayFormation,
  openFormationReplay,FORMATION_REPLAY_BYTES} from '../sim/formation-world.js';
import {MAX_VISITS,SLOT_SPACING,planFormationRoute} from '../sim/formation-routes.js';

const tank='cobalt-tank',mech='cobalt-mech',ship='cobalt-ship';
const actor=(w,id)=>w.actors.find(a=>a.id===id);
const order=(w,units,x,z,type='MOVE',append=false)=>({tick:w.tick,units,type,append,x,z});
function runUntil(w,done,limit=4000,step=stepFormation){
  for(let i=0;i<limit && !done() && w.status==='active';i++)step(w);
  assert.ok(done(),'required physical state reached');
}
test('mixed crews reserve distinct stable slots and both physically arrive',()=>{
  function run(ids){
    const w=createFormationWorld();
    issueFormationOrder(w,order(w,ids,-17,16));
    const slot=id=>w.units[id].queue[0].goal.slice();
    const goals=[slot(tank),slot(mech)];
    assert.ok(Math.hypot(goals[0][0]-goals[1][0],goals[0][1]-goals[1][1])>=SLOT_SPACING);
    runUntil(w,()=>ids.every(id=>w.units[id].status==='completed'));
    for(const [i,id] of [tank,mech].entries()){
      const a=actor(w,id);
      assert.ok(Math.hypot(a.p[0]-goals[i][0],a.p[2]-goals[i][1])<=3);
    }
    assert.ok(actor(w,mech).steps>0);
    return formationReceipt(w);
  }
  const saved=run([mech,tank]);
  assert.deepEqual(run([tank,mech]),saved);
  assert.deepEqual(formationReceipt(replayFormation(JSON.stringify(saved))),saved);
});

test('Tern skirts the island on a two-leg route and a queued successor starts after arrival',()=>{
  const direct=createCommandWorld();
  issueOrder(direct,order(direct,[ship],66,25));
  let grounded=false;
  runUntil(direct,()=>{
    grounded ||= actor(direct,ship).grounded;
    return direct.units[ship].status==='blocked';
  },4000,stepCommand);
  assert.ok(grounded);
  const w=createFormationWorld(),u=w.units[ship];
  issueFormationOrder(w,order(w,[ship],66,25));
  issueFormationOrder(w,{tick:0,units:[ship],append:true,type:'HOLD'});
  stepFormation(w);
  assert.equal(u.queue[0].route.length,2);
  assert.ok(w.navigation.visited>0 && w.navigation.visited<=MAX_VISITS);
  let underway=false;
  runUntil(w,()=>{
    const a=actor(w,ship);
    assert.equal(a.grounded,false);
    underway ||= a.speed>1 && a.displacedVolume>0;
    return u.queue[0].type==='HOLD';
  });
  assert.ok(underway);
  const s=actor(w,ship);
  assert.ok(Math.hypot(s.p[0]-66,s.p[2]-25)<3);
  assert.equal(u.lastResult.status,'completed');
  const saved=formationReceipt(w);
  assert.deepEqual(formationReceipt(replayFormation(JSON.stringify(saved))),saved);
});

test('a moving ally can block an accepted walking leg and trigger one search around its stopped hull',()=>{
  const w=createFormationWorld();
  for(const a of w.actors)a.ammo=0; // Isolate crew interaction using the actual track and foot solvers.
  issueFormationOrder(w,order(w,[mech],-20,10));stepFormation(w);
  assert.equal(w.units[mech].queue[0].route.length,1);
  issueFormationOrder(w,order(w,[tank],-14,24));
  runUntil(w,()=>w.navigation.replans>0);
  assert.equal(w.units[tank].status,'completed');
  assert.ok(w.units[mech].queue[0].route.length>1);
  runUntil(w,()=>w.units[mech].status==='completed');
  assert.equal(w.navigation.replans,1);
  assert.ok(actor(w,mech).supportCount>=3);
});

test('DEFEND keeps its engagement rules on intermediate legs and holds its final slot',()=>{
  const w=createFormationWorld(),u=w.units[ship];
  issueFormationOrder(w,order(w,[ship],66,25,'DEFEND'));stepFormation(w);
  assert.equal(u.queue[0].route.length,2);
  let engaged=false;
  runUntil(w,()=>{
    if(u.queue[0]?.route.length>1)engaged ||= w.events.some(e=>e.type==='launch' && e.owner===ship);
    return u.onStation && u.queue[0]?.route.length===1;
  });
  assert.ok(engaged);
  const s=actor(w,ship);
  assert.ok(Math.hypot(s.p[0]-66,s.p[2]-25)<=3);
  assert.equal(u.queue[0].type,'DEFEND');
});

test('invalid admissions preserve the queue, submerged crew slots block and routes cannot read hidden opponents',()=>{
  const w=createFormationWorld(),before=formationReceipt(w);
  const move=order(w,[tank],15,20),getter={...move};
  let calls=0;
  Object.defineProperty(getter,'z',{enumerable:true,get(){calls++;}});
  for(const raw of [getter,{...move,units:[tank,'ember-ship']},{...move,x:NaN},{...move,type:'PATROL'}, {...move,tick:7}]){
    assert.throws(()=>issueFormationOrder(w,raw));assert.deepEqual(formationReceipt(w),before);
  }
  assert.equal(calls,0);
  issueFormationOrder(w,move);stepFormation(w);
  assert.equal(w.units[tank].status,'blocked');
  assert.equal(w.units[tank].queue.length,0);
  for(const a of w.actors.filter(a=>a.faction==='ember')){
    Object.defineProperty(a,'p',{get(){throw Error('opponent leaked into route search');}});
  }
  assert.ok(planFormationRoute(w,actor(w,ship),[66,25]).points.length>1);
});

test('formation and War Room sources verify their own recordings and reject corruption',async()=>{
  const old=JSON.parse(readFileSync(new URL('../evidence/command-authority/measure.json',import.meta.url))).encounter.receipt;
  assert.deepEqual(commandReceipt(replayCommand(JSON.stringify(old))),old);
  assert.throws(()=>replayFormation(JSON.stringify(old)));
  const w=createFormationWorld();issueFormationOrder(w,order(w,[ship],66,25));
  for(let i=0;i<75;i++)stepFormation(w);
  const saved=formationReceipt(w);
  assert.deepEqual(formationReceipt(await openFormationReplay(JSON.stringify(saved))),saved);
  assert.throws(()=>replayCommand(JSON.stringify(saved)));
  for(const patch of [{source:'bad'},{roster:[]},{scenario:'other'},{orders:[{...saved.orders[0],x:-25}]},
    {orders:[{...saved.orders[0],tick:-1}]},{ticks:1e5},{stateHash:'deadbeef'},{eventHash:'bad'},{outcome:'victory'}]){
    assert.throws(()=>replayFormation(JSON.stringify({...saved,...patch})));
  }
  assert.throws(()=>replayFormation(' '.repeat(FORMATION_REPLAY_BYTES+1)));
});
