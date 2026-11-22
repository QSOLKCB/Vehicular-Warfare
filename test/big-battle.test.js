import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_VISITS} from '../sim/formation-routes.js';
import {bigBattle} from '../sim/big-battle.js';
import {commandContacts} from '../sim/command-control.js';
import {MAX_PULSES} from '../sim/combined-world.js';
import {DistantFleet} from '../game/distant-fleet.js';
import {crewName} from '../game/strategic-map.js';
import {foamRibbon} from '../game/naval-view.js';
import {shadowDisc} from '../game/mech-view.js';

test('three complete sections per side deploy with separate contact states and IDs',()=>{
  for(const seed of [0,2505,0xffffffff]){
    const w=bigBattle.createWorld({seed});
    assert.equal(Object.keys(w.units).length,12);
    assert.equal(w.actors.length,25);
    assert.equal(w.actors.filter(a=>a.kind==='relay').length,1);
    const mobile=w.actors.filter(a=>a.kind!=='relay');
    assert.equal(new Set(mobile.map(a=>a.id)).size,24);
    for(const faction of ['cobalt','ember']){
      const side=mobile.filter(a=>a.faction===faction);
      assert.equal(new Set(side.map(crewName)).size,12);
      for(const kind of ['tank','ship','mech','helicopter']){
        const crews=side.filter(a=>a.kind===kind);
        assert.deepEqual(crews.map(a=>a.section),[1,2,3]);
        for(const a of crews){
          assert.ok(a.p.every(Number.isFinite) && a.hp>0);
          assert.ok(mobile.every(b=>a===b || Math.hypot(a.p[0]-b.p[0],a.p[2]-b.p[2])>8));
          if(kind==='mech')assert.equal(a.supportCount,6);
          if(kind==='ship')assert.equal(a.grounded,false);
        }
      }
    }
  }
});

test('twelve-crew order, second-section track motion, shared impacts, victory and verified replay',()=>{
  const w=bigBattle.createWorld();
  const crew=w.actors.find(a=>a.id==='cobalt-tank-2'),start=crew.p.slice(),units=Object.keys(w.units);
  const attack={tick:w.tick,units,type:'ATTACK',target:'relay',append:false};
  assert.ok(commandContacts(w).includes('relay'));
  const before=bigBattle.receipt(w);
  for(const id of ['ember-tank-2','cobalt-mech-4','relay']){
    assert.throws(()=>bigBattle.issueOrder(w,{...attack,units:[...units.slice(0,11),id]}));
    assert.deepEqual(bigBattle.receipt(w),before);
  }
  bigBattle.issueOrder(w,attack);
  bigBattle.issueOrder(w,{tick:0,units:[crew.id],type:'MOVE',x:-16,z:3,append:true});
  let peak=0,intercept=false,steered=false;
  while(w.tick<1800 && w.status==='active'){
    bigBattle.step(w);
    peak=Math.max(peak,w.shots.length);
    steered ||= Math.abs(crew.leftSpeed-crew.rightSpeed)>.1;
    intercept ||= w.events.some(e=>e.tick===w.tick && e.type==='damage' && e.shot>0);
  }
  assert.equal(w.status,'victory');
  assert.ok(w.captured && w.mobileKills>=2 && w.relay.hp===0);
  assert.ok(steered && Math.hypot(crew.p[0]-start[0],crew.p[2]-start[2])>10);
  assert.ok(intercept && peak>0 && peak<=MAX_PULSES);
  const record=bigBattle.receipt(w);
  assert.equal(record.roster.length,25);
  assert.deepEqual(bigBattle.receipt(bigBattle.replay(JSON.stringify(record))),record);
  for(const patch of [{source:'wrong'},{scenario:'breakwater-command-v1'},{roster:record.roster.slice(1)}]){
    assert.throws(()=>bigBattle.replay(JSON.stringify({...record,...patch})));
  }
});

test('render buffers fit all 24 silhouettes, all 6 wakes and all 54 detailed ground shadows',()=>{
  const w=bigBattle.createWorld();
  const fleet=new DistantFleet([.21,.53,.52],[.83,.32,.19],w.crewSets);
  const storage=fleet.data.buffer;
  for(const a of w.actors)if(a.kind!=='relay')fleet.append(a,0);
  assert.equal(fleet.count,24);
  assert.equal(fleet.used,fleet.data.length);
  assert.ok(fleet.meshView().every(Number.isFinite));
  assert.throws(()=>fleet.append(w.player,0));
  fleet.reset();assert.equal(fleet.data.buffer,storage);
  assert.throws(()=>new DistantFleet([1,1,1],[0,0,0],4));
  const foam=new Float32Array(w.crewSets*2*2*8*6*6), shadows=new Float32Array(w.crewSets*18*8*3*6);
  let wake=0,discs=0;
  for(const a of w.actors){
    if(a.kind==='ship')wake=foamRibbon(foam,wake,w,{...a,speed:2});
    if(['tank','helicopter','mech'].includes(a.kind))discs=shadowDisc(shadows,discs,w.field,a.p,1,1);
    if(a.kind==='mech')for(const foot of a.feet)discs=shadowDisc(shadows,discs,w.field,foot.p,.3,.3);
  }
  assert.equal(wake,foam.length);assert.equal(discs,shadows.length);
  assert.ok(foam.every(Number.isFinite) && shadows.every(Number.isFinite));
});

test('the twelve-member movement plan allocates distinct slots and bounded routes',()=>{
  const w=bigBattle.createWorld(),ids=Object.keys(w.units);
  bigBattle.issueOrder(w,{tick:0,units:ids,type:'MOVE',x:-15,z:6,append:false});
  const destinations=ids.map(id=>w.units[id].queue[0].goal);
  assert.ok(destinations.every(point=>point?.every(Number.isFinite)));
  assert.equal(new Set(destinations.map(p=>p.join(','))).size,12);
  bigBattle.step(w);
  assert.equal(w.navigation.plans,12);
  assert.ok(w.navigation.visited>0 && w.navigation.visited<=12*MAX_VISITS);
  for(let i=0;i<500 && w.status==='active';i++)bigBattle.step(w);
  assert.ok(Object.values(w.units).some(u=>u.lastResult?.status==='completed'));
  const record=bigBattle.receipt(w);
  assert.deepEqual(bigBattle.receipt(bigBattle.replay(JSON.stringify(record))),record);
});
