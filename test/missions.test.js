import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld,aim,step,siteClear,receipt,replay} from '../sim/world.js';
import {MISSIONS,enemyIds,zone} from '../sim/missions.js';
import {routeControls} from './route-controls.js';

for(const id of ['longwatch','frostline']) test(id+' full route with finite ammunition, enemy fire and replay',()=>{
  const spec=MISSIONS[id], w=createWorld({seed:spec.seed},id);
  const ids=enemyIds(w);
  assert.equal(ids.length,spec.sites.reduce((sum,s)=>sum+s[3].length,0));
  let cmd=0,shots=new Set(),destroyed=new Set(),beacons=new Set();
  while(w.status==='flying' && w.tick<30000){
    if(w.tick%12===0) cmd=routeControls(zone(w),siteClear(w),w.player.p,w.player.v,aim(w).target);
    step(w,cmd);
    for(let i=w.events.length-1;i>=0 && w.events[i].tick===w.tick;i--){
      const e=w.events[i];
      if(e.type==='launch' && e.owner!=='player') shots.add(e.owner);
      if(e.type==='destroy' && e.source==='player') destroyed.add(e.target);
      if(e.type==='beacon') beacons.add(e.name);
    }
  }
  assert.equal(w.status,'victory',JSON.stringify([w.reason,w.tick,zone(w),w.player.p,w.player.ammo]));
  assert.equal(destroyed.size,ids.length);assert.equal(beacons.size,spec.sites.length);
  assert.ok(shots.size>=spec.sites.length);assert.ok(w.tick>6000);
  assert.equal(w.score,ids.length*100);
  const r=receipt(w);assert.deepEqual(receipt(replay(JSON.stringify(r))),r);
  console.log(id,w.tick,'ticks;',shots.size,'enemy shooters;',r.stateHash,r.eventHash);
});

test('a cleared site must be visited low, in order, with an uninterrupted survey',()=>{
  const w=createWorld({seed:868},'longwatch');
  for(const id of enemyIds(w)) w[id].hp=0;
  const [,x,z]=zone(w);
  w.player.p=[x,50,z];
  for(let i=0;i<400;i++)step(w);
  assert.equal(w.route.hold,0);assert.equal(w.route.site,0);
  w.player.p=[x,24,z];
  for(let i=0;i<359;i++)step(w);
  assert.equal(w.route.hold,359);
  w.player.p=[x+20,24,z];step(w);assert.equal(w.route.hold,0);
  w.player.p=[x,24,z];w.player.ammo=0;
  for(let i=0;i<360;i++)step(w);
  assert.equal(w.route.site,1);assert.equal(w.player.ammo,16);
  assert.equal(w.status,'flying');
});

test('old field receipts verified, unknown operations rejected',()=>{
  const archive=JSON.parse(readFileSync('evidence/browser/playthrough.json'));
  for(const key of ['win','loss']) assert.equal(replay(JSON.stringify(archive[key].receipt)).tick,archive[key].receipt.ticks);
  for(const id of ['unknown','__proto__',null,{}])assert.throws(()=>createWorld({seed:2},id));
  const foreign={...archive.win.receipt,mission:'longwatch'};
  assert.throws(()=>replay(JSON.stringify(foreign)));
});
