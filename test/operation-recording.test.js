import assert from 'node:assert/strict';
import test from 'node:test';
import {overlord} from '../sim/coordinated-overlord.js';
import {COMBINED_LIMIT} from '../sim/combined-world.js';

function defend(){
  const world=overlord.createWorld();
  overlord.issueOrder(world,{tick:0,type:'DOCTRINE',doctrine:'DEFEND',
    units:Object.keys(world.units),append:false});
  return world;
}

test('holding the deployment bays leaves the crossing unsecured at the two-minute deadline',()=>{
  const world=defend();
  while(world.status==='active' && world.tick<COMBINED_LIMIT)overlord.step(world);
  assert.equal(world.tick,COMBINED_LIMIT);
  assert.equal(world.captured,false);
  assert.equal(world.reason,'command time expired');
  assert.equal(world.status,'defeat');
  assert.ok(world.actors.some(a=>a.faction==='cobalt' && a.hp>0));
  const last=world.events.at(-1);
  assert.deepEqual([last.tick,last.type,last.status,last.reason],
    [COMBINED_LIMIT,'outcome','defeat','command time expired']);
  const receipt=overlord.receipt(world);
  const checked=overlord.replay(JSON.stringify(receipt,null,2)+'\n');
  assert.deepEqual(overlord.receipt(checked),receipt);
  assert.equal(checked.tactical.decisionHash,world.tactical.decisionHash);
});

test('both operation replay readers reject duplicate fields, noncanonical numbers and unsorted crew IDs',async()=>{
  const receipt=overlord.receipt(defend()),canonical=JSON.stringify(receipt);
  const unsorted=structuredClone(receipt);
  unsorted.orders[0].units.reverse();
  for(const text of [
    canonical.replace('"ticks":0','"ticks":0,"ticks":0'),
    canonical.replace('"ticks":0','"ticks":-0'),
    canonical.replace('"ticks":0','"ticks":0.0'),
    JSON.stringify(unsorted)
  ]){
    assert.throws(()=>overlord.replay(text),/Noncanonical/);
    await assert.rejects(overlord.openReplay(text),/Noncanonical/);
  }
  assert.deepEqual(overlord.receipt(await overlord.openReplay(canonical)),receipt);
});
