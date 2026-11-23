import test from 'node:test';
import assert from 'node:assert/strict';
import {bigBattle} from '../sim/big-battle.js';
import {beforeGroupStep,groupPlan} from '../sim/overlord-groups.js';
import {planFormationRoute,MAX_VISITS,SLOT_SPACING} from '../sim/formation-routes.js';

function fixture() {
  const w=bigBattle.createWorld();
  w.tactical={crews:Object.fromEntries(Object.keys(w.units).map(id=>[id,{}]))};
  return w;
}
function task(w,task,units,x,z) {
  groupPlan(w,{type:'TASK',tick:w.tick,units,task,append:false,x,z});
}
const tank='cobalt-tank-3',cutter='cobalt-ship',helicopter='cobalt-helicopter';
const actor=(w,id)=>w.actors.find(a=>a.id===id);

test('Breakwater alternate approach checks both legs and differs from the ordinary cutter route',()=>{
  const w=fixture(),a=actor(w,cutter),goal=[66,25];
  const base=planFormationRoute(w,a,goal);
  assert.ok(base.points.length>1);
  const initial=a.p.slice();
  for(const other of w.actors.filter(a=>a.faction==='ember')) {
    Object.defineProperty(other,'p',{get(){throw Error('hidden route input');}});
  }
  task(w,'FLANK',[cutter],...goal);
  const [first,second]=w.units[cutter].queue;
  assert.ok(first.goal && second.goal);
  assert.deepEqual(first.route,planFormationRoute(w,a,first.goal).points);
  // Independently recheck the final approach with the same cutter on that marker.
  const start={...a,p:[first.goal[0],a.p[1],first.goal[1]]};
  const chart={...w,actors:w.actors.map(member=>member===a?start:member)};
  assert.deepEqual(second.route,planFormationRoute(chart,start,goal).points);
  assert.notDeepEqual([...first.route,...second.route],base.points);
  assert.deepEqual(first.goal,w.tactical.crews[cutter].task.approach);
  assert.deepEqual(a.p,initial);
  assert.ok(w.navigation.plans<=5 && w.navigation.visited<=5*MAX_VISITS);
});

test('a cutter given a dry approach fails independently while a compatible group can proceed',()=>{
  const w=fixture();
  task(w,'ADVANCE',[helicopter],-20,16);
  const order=w.units[helicopter].queue[0];
  task(w,'FLANK',[cutter],-72,60);
  assert.equal(w.units[cutter].status,'blocked');
  assert.equal(w.units[cutter].lastResult.reason,'no traversable route');
  assert.equal(w.units[cutter].queue.length,0);
  assert.equal(w.units[helicopter].queue[0],order);
});

test('regroup assigns spaced validated slots independently of ID submission order',()=>{
  const w=fixture(),ids=[tank,'cobalt-mech-3'];
  function regroup(ids) {
    task(w,'REGROUP',ids,-35,76);
    return [tank,'cobalt-mech-3'].map(id=>w.units[id].queue[0].goal);
  }
  const goals=regroup(ids);
  assert.deepEqual(goals,regroup(ids.slice().reverse()));
  assert.ok(Math.hypot(goals[1][0]-goals[0][0],goals[1][1]-goals[0][1])>=SLOT_SPACING);
});

test('a settling cover crew gates ADVANCE until ready, lost, retasked, timed out, or a player appends',()=>{
  for(const release of ['ready','loss','timeout','append','retasked']) {
    const w=fixture(),cover='cobalt-tank-2';
    task(w,'COVER',[cover],-26,15);
    task(w,'ADVANCE',[helicopter],-30,3);
    const unit=w.units[helicopter],intent=w.tactical.crews[helicopter].task;
    assert.equal(intent.waiting,true);
    beforeGroupStep(w);
    assert.equal(unit.queue[0].type,'HOLD');
    if(release==='ready') w.units[cover].onStation=true;
    if(release==='loss') {actor(w,cover).hp=0;w.units[cover].queue.length=0;}
    if(release==='timeout') w.tick=240;
    if(release==='append') unit.queue.push({type:'HOLD'});
    if(release==='retasked') task(w,'REGROUP',[cover],-34,18);
    beforeGroupStep(w);
    assert.equal(intent.waiting,false);
    assert.equal(unit.queue[0].type,'MOVE');
    assert.equal(intent.releaseTick,w.tick);
    if(release==='append')assert.deepEqual(unit.queue[1],{type:'HOLD'});
  }
});

test('coordinated advance waits for an occupied cover slot, then receives physical fire support',async()=>{
  const {overlord}=await import('../sim/coordinated-overlord.js');
  const {groupFixture}=await import('../tools/overlord-groups-fixture.mjs');
  const run=groupFixture(overlord,'advance');
  assert.equal(run.release.reason,'cover on station');
  assert.ok(run.release.tick>0 && run.release.tick<240);
  const advancing=run.engagements.find(e=>e.advancing && e.advanceSpeed>1);
  assert.ok(advancing && advancing.tick>run.release.tick);
  assert.ok(run.impact.some(e=>e.shot===advancing.shot));
  assert.notEqual(run.recording.outcome,'active');
});

test('alternate section physically completes both independently validated stages and replay',async()=>{
  const {overlord}=await import('../sim/coordinated-overlord.js');
  const {groupFixture}=await import('../tools/overlord-groups-fixture.mjs');
  const run=groupFixture(overlord,'alternate');
  for(const id of ['cobalt-tank-3','cobalt-helicopter-3']){
    const assignment=run.plans.find(row=>row.id===id).assignment;
    const arrivals=run.results.filter(r=>r.id===id && r.status==='completed');
    assert.equal(arrivals.length,2);
    for(const [i,goal] of [assignment.approach,assignment.slot].entries()){
      const {p}=arrivals[i];
      assert.ok(Math.hypot(p[0]-goal[0],p[2]-goal[1])<3);
    }
  }
  const start=fixture();
  const conventional=planFormationRoute(start,actor(start,tank),run.plans.find(row=>row.id===tank).assignment.slot);
  assert.ok(conventional.points.length>1 && conventional.visited>0);
  const w=overlord.createWorld(),before=overlord.receipt(w);
  const raw={tick:0,units:[tank],type:'TASK',task:'FLANK',append:false,x:12,z:5};
  for(const invalid of [{...raw,units:[tank,'ember-ship']},{...raw,x:NaN},{...raw,task:'INVALID'},{...raw,append:true}]){
    assert.throws(()=>overlord.issueOrder(w,invalid));assert.deepEqual(overlord.receipt(w),before);
  }
  assert.throws(()=>overlord.replay(JSON.stringify({...run.recording,eventHash:'deadbeef'})));
});

for (const [label, recipient, destination] of [
  ['identical replacement', 'cobalt-tank-2', [-26,15]],
  ['distant replacement', 'cobalt-tank-2', [-90,90]],
  ['unrelated cover order', 'cobalt-tank-3', [-90,90]]
]) {
  test('waiting ADVANCE retains the identity of its covering assignment through '+label, async()=>{
    const {overlord}=await import('../sim/coordinated-overlord.js');
    const w=overlord.createWorld();
    const issue=(task,id,[x,z])=>overlord.issueOrder(w,{
      tick:w.tick,type:'TASK',task,units:[id],append:false,x,z
    });
    const cover='cobalt-tank-2';
    issue('COVER',cover,[-26,15]);
    issue('ADVANCE',helicopter,[-30,3]);
    assert.equal(w.tactical.crews[helicopter].task.cover,cover);
    assert.equal(w.tactical.crews[helicopter].task.waiting,true);
    issue('COVER',recipient,destination);
    assert.equal(w.units[recipient].queue[0].sectionTask,'COVER');
    assert.deepEqual(w.orderLog.map(order=>order.tick),[0,0,0]);
    overlord.step(w);
    const advance=w.tactical.crews[helicopter].task;
    const stillWaiting=recipient!==cover;
    assert.equal(advance.waiting,stillWaiting);
    assert.equal(advance.releaseTick,stillWaiting?undefined:0);
    assert.equal(w.units[helicopter].queue[0].type,stillWaiting?'HOLD':'MOVE');
    const saved=overlord.receipt(w);
    const rebuilt=overlord.replay(JSON.stringify(saved));
    assert.deepEqual(rebuilt.tactical.crews[helicopter].task,advance);
    assert.deepEqual(overlord.receipt(rebuilt),saved);
  });
}
