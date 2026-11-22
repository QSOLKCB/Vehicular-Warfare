import test from 'node:test';
import assert from 'node:assert/strict';
import {projection,StrategicMap} from '../game/strategic-map.js';

test('north-up CSS coordinates round trip at wide and tall aspect ratios',()=>{
  for(const [w,h] of [[320,700],[1031,592]]){
    const tr=projection(w,h,-12,18,2.72);
    assert.deepEqual(tr.screen(-12,18),[w/2,h/2]);
    assert.ok(tr.screen(-12,17)[1]<h/2);
    for(const point of [[-144,144],[29,-30],[8,7]]){
      tr.world(...tr.screen(...point)).forEach((v,i)=>assert.ok(Math.abs(v-point[i])<1e-9));
    }
  }
});
test('wheel zoom anchors cursor and pan uses CSS pixel deltas',()=>{
  const map=Object.assign(Object.create(StrategicMap.prototype),{canvas:{clientWidth:830,clientHeight:632},zoom:1,cx:0,cz:0});
  const before=map.transform().world(120,300);
  map.zoomAt(120,300,1.25);
  const [u,v]=map.transform().screen(...before);
  assert.ok(Math.hypot(u-120,v-300)<1e-9);
  map.pan(15,42);const next=map.transform().screen(...before);
  assert.ok(Math.hypot(next[0]-135,next[1]-342)<1e-9);
  map.zoomAt(300,200,100);assert.equal(map.zoom,8);
});
