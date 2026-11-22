import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxVertexStream} from '../vendor/vanillajs/modules/render-packing/index.js';
import {createCombinedWorld,combinedReceipt,MAX_PULSES} from '../sim/combined-world.js';
import {DistantFleet,useDistantActor} from '../game/distant-fleet.js';
import {packMixedEffects} from '../game/combined-view.js';

test('distance detail uses camera magnification and a return threshold; the pilot and relay stay detailed',()=>{
  const w=createCombinedWorld(),other=w.actors.find(a=>a.kind==='mech');
  function far(range,fov=.89,previous=false,actor=other){
    return useDistantActor(actor,w.player,[actor.p[0],actor.p[1],actor.p[2]+range],fov,previous);
  }
  assert.equal(far(60),true);
  assert.equal(far(48),false);
  assert.equal(far(48,.89,true),true);
  assert.equal(far(43,.89,true),false);
  assert.equal(far(60,.62),false);
  assert.equal(far(200,.89,true,w.player),false);
  assert.equal(far(200,.89,true,w.relay),false);
});

test('the compact buffer fits all eight moving actors and retains their posed geometry through reuse',()=>{
  const w=createCombinedWorld(),before=combinedReceipt(w);
  const fleet=new DistantFleet([.21,.53,.52],[.83,.32,.19]);
  const storage=fleet.data.buffer;
  for(const a of w.actors)if(a.kind!=='relay')fleet.append(a,0);
  assert.equal(fleet.count,8);assert.equal(fleet.used,fleet.data.length);
  assert.ok(fleet.meshView().every(Number.isFinite));
  fleet.reset();
  const mech=w.actors.find(a=>a.kind==='mech');
  fleet.append(mech,0);
  const start=fleet.meshView().slice();
  fleet.reset();fleet.append(mech,0);
  assert.deepEqual(fleet.meshView(),start);
  assert.equal(fleet.meshView().buffer,storage);
  assert.deepEqual(combinedReceipt(w),before);
  const turned={...mech,torsoYaw:mech.torsoYaw+.3};
  fleet.reset();fleet.append(turned,0);
  assert.notDeepEqual(fleet.meshView(),start);
});

test('balanced reserves all 32 pulse boxes before admitting up to eight recent four-piece impacts',()=>{
  const w=createCombinedWorld(),p=w.player.p;
  w.shots=Array.from({length:MAX_PULSES},(_,i)=>({p:[i,3,4],faction:'cobalt'}));
  w.events=Array.from({length:96},(_,i)=>({type:'impact',point:[i,0,0],tick:99,target:'water'}));
  w.tick=100;
  for(const [detail,capacity,debris] of [['balanced',64,32],['full',128,96]]){
    const stream=new BoxVertexStream(capacity),storage=stream.view().buffer;
    assert.equal(packMixedEffects(stream,w,detail),debris);
    assert.equal(stream.boxCount,MAX_PULSES+debris);
    const packed=stream.view();
    for(let i=0;i<MAX_PULSES;i++){
      const off=i*216;
      assert.ok(Math.abs(packed[off]-(i-.12))<.00001);
      assert.ok(Math.abs(packed[off+1]-2.88)<.00001);
    }
    const s={...w,events:[{type:'impact',point:p,tick:0,target:'terrain'}]};
    assert.equal(packMixedEffects(stream,s,detail),0);
    assert.equal(stream.boxCount,MAX_PULSES);assert.equal(stream.view().buffer,storage);
  }
  const empty=new BoxVertexStream(64);
  assert.equal(packMixedEffects(empty,{...w,shots:[]},'balanced'),32);
});
