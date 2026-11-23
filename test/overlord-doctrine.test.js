import assert from 'node:assert/strict';
import test from 'node:test';
import {doctrineScenario as game} from '../sim/overlord.js';
import {bigBattle} from '../sim/big-battle.js';
import {canSee} from '../sim/combined-world.js';

const get=(w,id)=>w.actors.find(a=>a.id===id);
const advance=(w,n)=>{while(n-- && w.status==='active')game.step(w);};
const command=(w,id,order)=>game.issueOrder(w,{tick:w.tick,units:[id],append:false,...order});
const setDoctrine=(w,id,doctrine)=>command(w,id,{type:'DOCTRINE',doctrine});
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);

test('changing one doctrine changes a control mask and physical motion on the same deployment',()=>{
  const id='cobalt-helicopter',a=game.createWorld(),b=game.createWorld(),start=get(a,id).p.slice();
  setDoctrine(a,id,'DEFEND');setDoctrine(b,id,'RECON');
  advance(a,165);advance(b,165);
  assert.equal(a.tactical.crews[id].decision.action,'defend station');
  assert.equal(b.tactical.crews[id].decision.action,'investigate');
  assert.ok(distance(start,get(a,id).p)<1);
  assert.ok(distance(start,get(b,id).p)>4);
  assert.notEqual(a.tactical.crews[id].mask,b.tactical.crews[id].mask);
});

test('an unavailable gun and a hidden contact change outcomes without changing the doctrine',()=>{
  const a=game.createWorld(),b=game.createWorld(),id='cobalt-tank';
  // Perturb a local crew's inventory. Both runs can admit its visible contact.
  get(b,id).ammo=0;
  const launches=[[],[]];
  for(const [k,w] of [a,b].entries()){
    for(let n=0;n<320;n++){
      game.step(w);
      for(const e of w.events.filter(e=>e.tick===w.tick && e.type==='launch' && e.owner===id)){
        assert.ok(w.tick>=100 && canSee(w,get(w,id),get(w,get(w,id).target)));
        launches[k].push(e.shot);
      }
    }
  }
  assert.ok(launches[0].length>0);
  assert.equal(launches[1].length,0);
  const c=game.createWorld();
  const tank=get(c,id),target=get(c,'relay');
  command(c,id,{type:'ATTACK',target:'relay'});
  advance(c,50);assert.ok(tank.seen>0);
  const old=target.p;target.p=[140,0,140];
  advance(c,1);assert.equal(tank.target,null);assert.equal(tank.seen,0);
  target.p=old;
  command(c,id,{type:'ATTACK',target:'relay'});advance(c,1);
  assert.equal(tank.seen,1);
});

test('active and queued player orders survive doctrine changes; manual mode holds',()=>{
  const id='cobalt-tank',w=game.createWorld();
  command(w,id,{type:'MOVE',x:-21,z:3});
  command(w,id,{type:'HOLD',append:true});
  setDoctrine(w,id,'RECON');advance(w,100);
  assert.deepEqual(w.units[id].queue.map(o=>o.type),['MOVE','HOLD']);
  assert.equal(w.tactical.crews[id].decision.reason,'commander order');
  assert.equal(w.tactical.crews[id].decision.contact,null);
  const manual=game.createWorld();
  setDoctrine(manual,id,'MANUAL');advance(manual,150);
  assert.equal(manual.tactical.crews[id].decision.action,'hold');
  assert.equal(get(manual,id).target,null);
  get(w,id).hp=0;advance(w,1);
  assert.equal(w.units[id].queue.length,0);
  assert.equal(w.units[id].status,'cancelled');
  assert.throws(()=>setDoctrine(w,id,'ASSAULT'));
});

test('both factions use accepted decisions and verify complete terminal receipts',async()=>{
  const w=game.createWorld(),id='cobalt-ship';
  setDoctrine(w,id,'SUPPORT');
  const launches=new Set();let peak=0,lastDecision=0;
  while(w.status==='active'){
    game.step(w);
    assert.ok(w.tactical.decisions-lastDecision<=1);
    lastDecision=w.tactical.decisions;
    for(const e of w.events)if(e.tick===w.tick && e.type==='launch')launches.add(get(w,e.owner).faction);
    peak=Math.max(peak,w.shots.length);
  }
  assert.deepEqual([...launches].sort(),['cobalt','ember']);
  assert.ok(peak<=32 && lastDecision>25);
  assert.ok(get(w,'ember-tank').p[2]!==get(game.createWorld(),'ember-tank').p[2]);
  const r=game.receipt(w),decoded=await game.openReplay(JSON.stringify(r,null,2)+'\n');
  assert.deepEqual(game.receipt(decoded),r);
  assert.equal(decoded.tactical.decisionHash,w.tactical.decisionHash);
  assert.throws(()=>bigBattle.replay(JSON.stringify(r)));
  assert.throws(()=>game.replay(JSON.stringify({...r,eventHash:'00000000'})),/diverged/);
});

test('hostile orders reject atomically and noncanonical tactical receipts fail closed',()=>{
  const w=game.createWorld(),before=game.receipt(w);
  let reads=0;const list=['cobalt-tank','cobalt-ship'];
  Object.defineProperty(list,1,{get(){reads++;throw Error('getter');}});
  for(const raw of [
    {type:'DOCTRINE',doctrine:'RECON',units:list},
    {type:'DOCTRINE',doctrine:'RECON',units:['cobalt-tank','ember-mech']},
    {type:'DOCTRINE',doctrine:'UNKNOWN',units:['cobalt-mech']},
    {type:'TASK',task:'COVER',x:0,z:0,units:['cobalt-mech']},
  ])assert.throws(()=>game.issueOrder(w,{tick:0,append:false,...raw}));
  assert.equal(reads,0);assert.deepEqual(game.receipt(w),before);
  const t=JSON.stringify(before);
  assert.throws(()=>game.replay(t.replace('"ticks":0','"ticks":9,"ticks":0')),/Noncanonical/);
  assert.throws(()=>game.replay(t.replace('"ticks":0','"ticks":0.0')),/Noncanonical/);
  assert.throws(()=>game.replay(' '.repeat(1048577)));
});
