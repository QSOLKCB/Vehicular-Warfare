import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Clock} from '../sim/clock.js';
import {createWorld,step,K,aim,sweep,receipt,replay,REACTION,MEMORY} from '../sim/world.js';
import {sight,HULL_RADIUS,HULL_HALF_HEIGHT} from '../sim/terrain.js';

const ticks=(w,n,k=0)=>{ for(let i=0;i<n;i++) step(w,k); };
const launches=(w,id)=>w.events.filter(e=>e.type==='launch' && e.owner===id);

test('upstream bytes and simulation content identity',()=>{
  const root='vendor/vanillajs/';
  const manifest=JSON.parse(readFileSync(root+'provenance.json'));
  for(const [file,hex] of Object.entries(manifest.sha256))
    assert.equal(createHash('sha256').update(readFileSync(root+file)).digest('hex'),hex);
  execFileSync('python3',['tools/identity.py','--check']);
});

test('immutable field and triangle centroids agree across the seeded grid',()=>{
  const {field}=createWorld(), copy=createWorld().field, other=createWorld({seed:418}).field;
  assert.notDeepEqual(other.triangleAt(0,0),field.triangleAt(0,0));
  for(let j=0;j<48;j+=3) for(let i=0;i<48;i+=2) {
    const triangles=field.triangleAt(i,j);
    assert.deepEqual(triangles,copy.triangleAt(i,j));
    for(const tri of triangles) {
      const [x,y,z]=tri[0].map((_,k)=>tri.reduce((a,p)=>a+p[k]/3,0));
      assert.ok(Math.abs(field.sample(x,z).height-y)<1e-12);
    }
    triangles[0][0][1]=999;
    assert.notEqual(field.triangleAt(i,j)[0][0][1],999);
  }
});

test('hover trim, rotor tilt, yaw and fully swept terrain envelope',()=>{
  const w=createWorld(), spawn=w.player.p;
  ticks(w,1000); assert.deepEqual(w.player.p,spawn);
  ticks(w,100,K.forward|K.right|K.yawRight|K.up);
  assert.ok(w.player.pitch>0 && w.player.bank>0 && w.player.yaw>0);
  assert.ok(w.player.p[0]>spawn[0] && w.player.p[2]<spawn[2] && w.player.p[1]>spawn[1]);
  let contact=false;
  for(let i=0;i<2000 && w.status==='flying';i++) {
    step(w,K.forward|K.down);
    const [x,y,z]=w.player.p;
    for(let a=0;a<6.28;a+=0.25)
      assert.ok(y-HULL_HALF_HEIGHT>=w.field.sample(x+HULL_RADIUS*Math.cos(a),z+HULL_RADIUS*Math.sin(a)).height);
    if(y-w.field.sample(x,z).height-w.offset<0.003) contact=true;
  }
  assert.ok(contact);
});

test('mask → delayed acquisition → rocket → memory → fresh acquisition → victory',()=>{
  const w=createWorld();
  ticks(w,300); assert.equal(w.aa.visible,false); assert.equal(w.aa.lastSeen,null);
  assert.equal(launches(w,'aa').length,0);
  assert.equal(sight(w.field,w.aa.p,w.player.p),false);
  step(w,K.fire); ticks(w,90);
  assert.ok(w.events.some(e=>e.type==='impact' && e.target==='terrain'));
  while(!w.aa.visible && w.tick<1000) step(w,K.up);
  assert.equal(w.aa.seen,1); const exposed=w.tick;
  ticks(w,REACTION-2); assert.equal(launches(w,'aa').length,0);
  step(w); assert.equal(launches(w,'aa')[0].tick,exposed+REACTION-1);
  assert.ok(aim(w).target);
  step(w,K.fire); const fired=w.serial;
  assert.ok(w.shots.some(s=>s.id===fired));
  while(w.aa.visible && w.tick<1700) step(w,K.down);
  assert.equal(w.aa.mode,'search');
  const last=w.aa.lastSeen, count=launches(w,'aa').length;
  ticks(w,20); assert.deepEqual(w.aa.lastSeen,last);
  assert.notDeepEqual(w.player.p,last);
  ticks(w,MEMORY); assert.equal(w.aa.lastSeen,null);
  assert.equal(launches(w,'aa').length,count);
  assert.ok(w.events.some(e=>e.type==='damage' && e.shot===fired));
  while(!w.aa.visible && w.tick<2300) step(w,K.up);
  assert.equal(w.aa.seen,1);
  ticks(w,REACTION-2); assert.equal(launches(w,'aa').length,count);
  step(w); assert.equal(launches(w,'aa').length,count+1);
  ticks(w,650,K.fire);
  assert.equal(w.status,'victory'); assert.equal(w.score,200);
  for (const e of w.events.filter(e=>e.type==='damage')) {
    assert.ok(w.events.some(l=>l.type==='launch' && l.owner===e.source && l.shot===e.shot && l.tick<e.tick));
    assert.ok(w.events.some(l=>l.type==='impact' && l.shot===e.shot && l.target===e.target && l.tick===e.tick));
  }
});

test('terrain and fast moving hitboxes compete on the same interval',()=>{
  const w=createWorld(), target={id:'convoy',prev:[-5,40,0],p:[5,40,0],half:[0.3,0.3,0.3]};
  assert.equal(sweep(w,{p:[0,40,10],step:[0,0,-20]},[target]).id,'convoy');
  assert.equal(sweep(w,{p:[0,40,10],step:[0,0,-20]},[{...target,prev:target.p}]),null);
  assert.equal(sweep(w,{p:[0,9,38],step:[0,0,-100]},[w.aa]).id,'terrain');
  assert.equal(sweep(w,{p:[141,90,30],step:[12,0,3]},[]).id,'boundary');
});

test('moving convoy, real enemy defeat, cooldown and last-round exhaustion',()=>{
  const w=createWorld(), spawn=w.convoy.p;
  ticks(w,140,K.up); ticks(w,1800);
  assert.notDeepEqual(w.convoy.p,spawn);
  assert.equal(w.status,'defeat');
  assert.ok(w.events.some(e=>e.type==='destroy' && e.target==='player' && e.shot>0));
  const dry=createWorld(); ticks(dry,1300,K.fire);
  assert.equal(dry.reason,'rockets exhausted');
  const shots=launches(dry,'player');
  assert.equal(shots.length,16);
  shots.slice(1).forEach((s,i)=>assert.ok(s.tick-shots[i].tick>=42));
});

test('same accepted controls at 30, 60 and 144 presentation Hz replay identically',()=>{
  const results=[30,60,144].map(hz=>{
    const w=createWorld(), clock=new Clock();
    for(let frame=0;frame<=hz*4;frame++) clock.frame(1000*frame/hz,()=>step(w,w.tick<140?K.up:K.fire));
    assert.equal(w.status,'victory');
    const r=receipt(w);
    assert.deepEqual(receipt(replay(JSON.stringify(r))),r);
    return r;
  });
  assert.deepEqual(results[2],results[0]); assert.deepEqual(results[1],results[0]);
  const clock=new Clock(); let n=0;
  clock.frame(0,()=>n++); clock.frame(1e6,()=>n++); assert.equal(n,12);
  clock.reset(); clock.frame(2e6,()=>n++); assert.equal(n,12);
});

test('malformed packs, commands and replay are atomic',()=>{
  const w=createWorld(), before=receipt(w);
  let invoked=false;
  for(const invalid of [{seed:NaN},{seed:1,x:1},{get seed(){invoked=true;}},' '.repeat(130),{},[]])
    assert.throws(()=>createWorld(invalid));
  assert.equal(invoked,false);
  for(const invalid of [1.2,2048,-1,NaN,null]) assert.throws(()=>step(w,invalid));
  assert.deepEqual(receipt(w),before);
  for(const change of [{ticks:1},{source:'old'},{stateHash:'bad'},{commands:[[0,0]]},{ticks:3,commands:[[0,0],[0,1]]}])
    assert.throws(()=>replay(JSON.stringify({...before,...change})));
});
