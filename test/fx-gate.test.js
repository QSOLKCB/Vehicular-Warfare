import test from 'node:test';
import assert from 'node:assert/strict';
import {FxGateBeacon} from '../game/fx-gate.js';
import {createCombinedWorld,combinedReceipt} from '../sim/combined-world.js';

// Draw-space reference built directly in floating point with no engine transforms.
function reference(gate,tick){
  const yaw=Math.floor(tick/6)*2*Math.PI/48,vertices=[];
  for(let side=0;side<4;side++){
    function point(which,radius,height){
      const angle=which*Math.PI/2-yaw;
      return [gate[0]+radius*Math.cos(angle),gate[1]+height,gate[2]+radius*Math.sin(angle)];
    }
    const a=point(side,1.5,3.75),b=point(side+1,1.5,3.75),c=point(side,1.0625,3.75),d=point(side+1,1.0625,3.75);
    const e=point(side,1,3.125),f=point(side+1,1,3.125);
    vertices.push(a,b,c,c,b,d,a,e,b,b,e,f,point(side,.875,2.8125),point(side,0,1.625),point(side+1,.875,2.8125));
  }
  return vertices;
}

test('the FX gate matches analytic rotation and translation at all 48 angles',()=>{
  for(const gate of [[0,0,0],[-135.999,12.34567,135.75],[33.333,4.871,-24.753]]){
    const marker=new FxGateBeacon(gate);
    for(let tick=0;tick<288;tick+=6){
      assert.equal(marker.prepare(tick,true,false),true);
      const expected=reference(gate,tick),data=marker.pipe.view();
      assert.equal(expected.length,60);assert.equal(data.length,expected.length*6);
      for(const [i,point] of expected.entries()){
        for(let k=0;k<3;k++)assert.ok(Math.abs(data[i*6+k]-point[k])<5e-5,'Q16 + Float32 position tolerance');
        assert.ok(Math.hypot(data[i*6]-gate[0],data[i*6+2]-gate[2])<=1.50005);
        assert.ok(data[i*6+1]>=gate[1]+1.625-.00005 && data[i*6+1]<=gate[1]+3.75+.00005);
      }
    }
  }
});

test('the FX gate reuses its bounded stream, follows gate state and restores the same frame',()=>{
  const w=createCombinedWorld(undefined,'helicopter'),before=combinedReceipt(w),marker=new FxGateBeacon(w.beacon);
  assert.equal(marker.prepare(6,true,false),true);
  const storage=marker.pipe.view().buffer,first=marker.pipe.view().slice();
  assert.equal(marker.pipe.vertexCount,60);assert.equal(marker.pipe.capacityVertices,60);
  assert.equal(marker.prepare(11,true,false),false);
  assert.equal(marker.prepare(11,false,false),true);
  const open=marker.pipe.view().slice();
  assert.notDeepEqual(open,first);
  for(let i=0;i<open.length;i+=6)assert.deepEqual(open.subarray(i,i+3),first.subarray(i,i+3));
  assert.equal(marker.prepare(11,false,true),true);
  assert.notDeepEqual(marker.pipe.view(),open);
  assert.equal(marker.prepare(75,true,false),true);
  assert.notDeepEqual(marker.pipe.view(),first);
  assert.equal(marker.prepare(6,true,false),true);
  assert.equal(marker.pipe.view().buffer,storage);assert.deepEqual(marker.pipe.view(),first);
  assert.deepEqual(combinedReceipt(w),before);
});
