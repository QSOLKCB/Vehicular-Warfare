import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BK,CLASSES,combinedReceipt,createCombinedWorld} from '../sim/combined-world.js';
import {Clock} from '../sim/clock.js';
import {CREATOR_SOURCE} from '../sim/creator-identity.js';
import {MAX_PACK_BYTES,MAX_REPLAY_BYTES,acceptPack,creatorReceipt,createCreatorWorld,defaultPack,
  openReplay,replayCreator,stepCreator} from '../sim/creator.js';

const missions=[
  {crew:'tank',seed:2505,gate:[-17,5],relay:[-5,-29]},
  {crew:'helicopter',seed:413,gate:[-15,3],relay:[-5,-28]},
  {crew:'mech',seed:2505,gate:[-8,18],relay:[-5,-29]},
  {crew:'ship',seed:2505,gate:[12,5],relay:[-4,-28]}
];
const course=m=>({version:1,title:'Tidal Ledger',...m});
const controls=w=>BK.fire|(w.captured?(w.selection==='tank'?BK.brake:0):BK.forward);
function play(w){
  const events=[];
  while(w.status==='active'){
    stepCreator(w,controls(w));
    events.push(...w.events.filter(e=>e.tick===w.tick));
  }
  return events;
}

test('workshop defaults preserve all four deployment lanes on the accepted seeded surface',()=>{
  for(const seed of [0,0xffffffff])for(const crew of CLASSES){
    const original=createCombinedWorld({seed},crew),p=defaultPack(crew,seed),w=createCreatorWorld(p);
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.relay) && Object.isFrozen(p.gate));
    assert.deepEqual(w.beacon,original.beacon);
    assert.deepEqual(w.relay.p,original.relay.p);
    assert.deepEqual(w.actors,original.actors);
    assert.deepEqual(w.field.sample(-73,25),original.field.sample(-73,25));
    assert.equal(w.water.level,original.water.level);
    assert.deepEqual(w.pack,acceptPack(JSON.stringify(p)));
  }
  const a=createCreatorWorld(defaultPack('mech',0)),b=createCreatorWorld(defaultPack('mech',7));
  assert.notEqual(a.field.sample(-73,25).height,b.field.sample(-73,25).height);
});

test('pack import is bounded, inert and atomic for plain records and JSON file text',()=>{
  const p=course(missions[0]),w=createCreatorWorld(p),before=creatorReceipt(w);
  const imported=acceptPack({...p,title:'  Écluse 2  '});
  assert.equal(imported.title,'Écluse 2');
  const gate=p.gate.slice(),copy=acceptPack({...p,gate});
  gate[0]=-100;
  assert.deepEqual(copy.gate,p.gate);
  let ran=false;
  const trap=()=>{ran=true;throw Error('accessor invoked');};
  for(const key of Object.keys(p)){
    const bad={...p};Object.defineProperty(bad,key,{get:trap,enumerable:true});
    assert.throws(()=>acceptPack(bad));
  }
  for(const key of ['0','1']){
    const bad=p.gate.slice();Object.defineProperty(bad,key,{get:trap,enumerable:true});
    assert.throws(()=>acceptPack({...p,gate:bad}));
  }
  assert.equal(ran,false);
  const extraPair=[...p.gate];extraPair[Symbol('secret')]=0;
  const hidden={...p};Object.defineProperty(hidden,'title',{value:'Hidden',enumerable:false});
  const custom=Object.assign(Object.create({inherited:1}),p);
  for(const wrong of [hidden,custom,{...p,unknown:1},{...p,[Symbol('seed')]:0},
    {...p,title:'<script>'},{...p,title:'javascript:alert(0)'},{...p,title:'x'.repeat(61)},
    {...p,gate:extraPair},{...p,gate:[1,,]},{...p,gate:[Infinity,1]},{...p,gate:[NaN,1]},
    {...p,gate:[136.5,2]},{...p,gate:[137,2]}, {...p,relay:[0,0,0]},{...p,version:2},
    {...p,crew:'relay'}, {...p,seed:2**32}, {...p,seed:0.1},null,[], '[]',
    ' '.repeat(MAX_PACK_BYTES+1),'"'+'é'.repeat(MAX_PACK_BYTES/2)+'"']){
    assert.throws(()=>acceptPack(wrong));
    assert.deepEqual(creatorReceipt(w),before);
  }
});

test('gate and shore relay placement enforce contact, connectivity and deployment clearance',()=>{
  const p=defaultPack('tank');
  assert.throws(()=>acceptPack({...p,gate:[22,25]}),/support/);
  assert.throws(()=>acceptPack({...p,gate:[58,-20]}),/landmass/);
  assert.throws(()=>acceptPack({...p,relay:[90,28]}),/dry/);
  assert.throws(()=>acceptPack({...p,gate:[-18,37]}),/deployment/);
  assert.throws(()=>acceptPack({...p,relay:[-18,37]}),/deployment/);
  assert.throws(()=>acceptPack({...p,relay:p.gate}),/clear/);
  assert.throws(()=>acceptPack({...defaultPack('ship'),gate:[-18,3]}),/support/);
  assert.equal(acceptPack({...p,crew:'helicopter',gate:[58,-20]}).crew,'helicopter');
});

test('all four edited layouts play to a physical gate and score with their embedded pack',()=>{
  for(const m of missions){
    const p=course(m),w=createCreatorWorld(p),events=play(w);
    assert.equal(w.status,'victory',m.crew);
    assert.ok(w.captured && !w.relay.hp && w.mobileKills>=2);
    assert.deepEqual(w.relay.p,[p.relay[0],w.field.sample(...p.relay).height+w.relay.half[1],p.relay[1]]);
    const gate=events.find(e=>e.type==='beacon');
    assert.deepEqual([gate.point[0],gate.point[2]],p.gate);
    assert.ok(events.some(e=>e.type==='damage' && e.target==='relay' && e.source===w.player.id));
    const r=creatorReceipt(w);
    assert.equal(r.source,CREATOR_SOURCE);assert.deepEqual(r.pack,p);
    assert.deepEqual(creatorReceipt(replayCreator(JSON.stringify(r))),r);
  }
});

test('authored controls and outcomes reproduce across fixed-clock display schedules',()=>{
  const p=course(missions[0]);
  const results=[];
  for(const rate of [30,60,144]){
    const w=createCreatorWorld(p),clock=new Clock();
    for(let frame=0;w.status==='active' && frame<30*rate;frame++){
      clock.frame(frame*1000/rate,()=>{if(w.status==='active')stepCreator(w,controls(w));});
    }
    assert.equal(w.status,'victory');
    results.push(creatorReceipt(w));
  }
  assert.deepEqual(results[0],results[1]);assert.deepEqual(results[0],results[2]);
});

test('verified timeline seek, rewind and stepping reproduce partial and terminal recordings',async()=>{
  const p=course(missions[0]),w=createCreatorWorld(p),snapshots=new Map([[0,creatorReceipt(w)]]);
  while(w.status==='active'){
    stepCreator(w,controls(w));
    if([1,119,120,121,350,717].includes(w.tick) || w.status!=='active')snapshots.set(w.tick,creatorReceipt(w));
  }
  const end=creatorReceipt(w),progress=[];
  const cursor=await openReplay(JSON.stringify(end),{onProgress:(tick,total)=>progress.push([tick,total])});
  assert.equal(cursor.world.tick,0);assert.equal(cursor.ticks,end.ticks);
  assert.deepEqual(progress.at(-1),[end.ticks,end.ticks]);
  for(const tick of [350,119,121,end.ticks,0,717,120,1,end.ticks]){
    const current=cursor.seek(tick);
    assert.deepEqual(creatorReceipt(current),snapshots.get(tick));
    assert.equal(current.player,current.actors.find(a=>a.id===w.player.id));
    assert.equal(current.relay,current.actors.find(a=>a.id==='relay'));
    assert.equal(current.pack,cursor.world.pack);
  }
  assert.equal(cursor.advance(100).tick,end.ticks);
  cursor.seek(119);assert.deepEqual(creatorReceipt(cursor.advance()),snapshots.get(120));
  for(const tick of [NaN,1.5,-1,end.ticks+1])assert.throws(()=>cursor.seek(tick));
  assert.throws(()=>cursor.advance(-1));
  assert.equal(cursor.world.tick,120);
  assert.ok(Object.isFrozen(cursor.receipt.commands[0]));
  const partial=snapshots.get(350),short=await openReplay(JSON.stringify(partial));
  assert.deepEqual(creatorReceipt(short.advance(999)),partial);
  const zero=await openReplay(JSON.stringify(snapshots.get(0)));
  assert.equal(zero.ticks,0);assert.equal(zero.advance().tick,0);
});

test('corrupt headers, pack changes, oversized recordings and cancellation never expose a timeline',async()=>{
  const w=createCreatorWorld(course(missions[1]));play(w);
  const r=creatorReceipt(w),differentPack={...r.pack,title:'Another Chart'};
  const invalid=[{...r,source:'other'},{...r,mission:'breakwater'},{...r,ticks:14401},
    {...r,commands:[[0,16384]]},{...r,commands:[[0,0],[0,1]]},{...r,commands:[[0,1],[1,1]]},
    {...r,commands:[[1,2]]},{...r,stateHash:'deadbeef'},{...r,eventHash:'12345678'},
    {...r,pack:differentPack},{...r,ticks:r.ticks+1}];
  for(const bad of invalid)await assert.rejects(openReplay(JSON.stringify(bad)));
  await assert.rejects(openReplay(' '.repeat(MAX_REPLAY_BYTES+1)));
  const controller=new AbortController();
  await assert.rejects(openReplay(JSON.stringify(r),{signal:controller.signal,onProgress:()=>controller.abort()}),
    {name:'AbortError'});
});

test('the timeline accepts archived VW-005 commands under their original source identity',async()=>{
  const archive=JSON.parse(readFileSync(new URL('../evidence/combined-arms/mixed-measure.json',import.meta.url)));
  const r=archive.runs[0].receipt,cursor=await openReplay(JSON.stringify(r));
  assert.equal(cursor.receipt.source,r.source);assert.equal(cursor.world.mission,'breakwater');
  assert.deepEqual(combinedReceipt(cursor.advance(r.ticks)),r);
  assert.equal(cursor.seek(1).tick,1);assert.deepEqual(combinedReceipt(cursor.seek(r.ticks)),r);
  assert.throws(()=>replayCreator(JSON.stringify(r)));
});
