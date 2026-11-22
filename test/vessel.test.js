import test from 'node:test';
import assert from 'node:assert/strict';
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';
import {WaterSurface,createVessel,stepVessel,vesselPoint} from '../sim/vessel.js';

function bottom(height=()=>-12,cellSize=2){
  const n=128,origin=-n*cellSize/2,heights=[];
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++)heights.push(height(origin+i*cellSize,origin+j*cellSize));
  return new Heightfield({cellsX:n,cellsZ:n,cellSize,originX:origin,originZ:origin,heights});
}
const near=(v,w,eps=1e-8)=>assert.ok(Math.abs(v-w)<=eps,v+' vs '+w);
function drive(ship,field,water,ticks,throttle=0,rudder=0){
  for(let i=0;i<ticks;i++)stepVessel(ship,field,water,throttle,rudder);
}
function checkHull(ship,field){
  for(const side of [-1.6,-.8,0,.8,1.6])for(const fore of [-4,-3,-2,0,2,3,4]){
    const [x,y,z]=vesselPoint(ship,side,-1,fore);
    assert.ok(y>=field.sample(x,z).height-1e-8,'keel penetrated bed');
  }
}

test('finite water surface and segment-entry times include both endpoints',()=>{
  const water=new WaterSurface(2);
  assert.ok(Object.isFrozen(water));assert.equal(water.heightAt(-50,60),2);
  assert.deepEqual(water.castSegment([0,4,0],[6,-4,-8]),{time:.5,point:[3,2,-4],startedInside:false});
  assert.deepEqual(water.castSegment([0,4,0],[0,-2,0]),{time:1,point:[0,2,0],startedInside:false});
  assert.deepEqual(water.castSegment([0,2,0],[2,0,1]),{time:0,point:[0,2,0],startedInside:true});
  assert.equal(water.castSegment([0,1,0],[0,3,0]).time,0);
  assert.equal(water.castSegment([0,2.1,0],[3,0,1]),null);
  for(const n of [NaN,Infinity,-Infinity,2e9])assert.throws(()=>new WaterSurface(n));
  assert.throws(()=>water.heightAt(Infinity,0));assert.throws(()=>water.castSegment([NaN,1,4],[0,-3,4]));
  assert.throws(()=>water.castSegment([1e9,3,4],[1,-3,4]));
});

test('weight balances displacement at trim, unsupported hull falls and asymmetric immersion rights it',()=>{
  const field=bottom(),water=new WaterSurface(3),ship=createVessel(field,water,0,12);
  drive(ship,field,water,240);
  near(ship.p[1],3.35);near(ship.v[1],0);near(ship.roll,0);near(ship.pitch,0);
  assert.equal(ship.wetPoints,6);near(ship.displacedVolume,7.8);
  ship.p[1]+=2.2;
  stepVessel(ship,field,water,0,0);
  assert.equal(ship.wetPoints,0);near(ship.v[1],-9/120);assert.ok(ship.p[1]>5.5);
  ship.pitch=.22;ship.roll=-.30;
  let partial=false,sankBelowTrim=false,rose=false;
  for(let i=0;i<1700;i++){
    stepVessel(ship,field,water,0,0);
    partial ||= ship.wetPoints>0 && ship.wetPoints<6;
    sankBelowTrim ||= ship.p[1]<3.30;rose ||= ship.v[1]>.2;
    assert.ok(Number.isFinite(ship.roll) && Number.isFinite(ship.pitch));
  }
  assert.ok(partial && sankBelowTrim && rose);
  near(ship.p[1],3.35,1e-5);near(ship.roll,0,1e-5);near(ship.pitch,0,1e-5);near(ship.displacedVolume,7.8,1e-4);
  const low=createVessel(field,water,2,10);
  low.p[1]-=1;stepVessel(low,field,water,0,0);
  assert.ok(low.v[1]>0 && low.displacedVolume>7.8);
});

test('surge and sway drag, keel moments, signed rudder authority and engine inertia',()=>{
  const field=bottom(),water=new WaterSurface(),ship=createVessel(field,water,0,48);
  drive(ship,field,water,120,0,1);near(ship.yaw,0);near(ship.p[0],0);near(ship.p[2],48);
  drive(ship,field,water,120,1);
  assert.ok(ship.speed>3 && ship.speed<4.5);assert.ok(ship.pitch>.02);
  const coast=structuredClone(ship);drive(coast,field,water,120);
  assert.ok(coast.speed>0 && coast.speed<ship.speed && coast.p[2]<ship.p[2]);
  drive(ship,field,water,120,1,.6);
  assert.ok(ship.yaw>.15 && ship.roll<-.02);assert.ok(ship.speed>5);
  let volume=0;
  for(const side of [-1.1,1.1])for(const fore of [-3,0,3]){
    const [x,y,z]=vesselPoint(ship,side,-1,fore);
    volume+=2*Math.max(0,Math.min(2,water.heightAt(x,z)-y));
  }
  near(ship.displacedVolume,volume);
  const reversing=createVessel(field,water,0,-20);
  drive(reversing,field,water,360,-1,1);
  assert.ok(reversing.yaw<-.6 && reversing.speed>=-4.01 && reversing.speed<-2);
  const drifting=createVessel(field,water,0,0),forward=structuredClone(drifting);
  drifting.v[0]=3;forward.v[2]=-3;
  drive(drifting,field,water,120);drive(forward,field,water,120);
  assert.ok(drifting.v[0]<.4 && -forward.v[2]>2);
});

test('an interior shoal, shallow shelf and bank stop the complete hull and allow reverse',()=>{
  // The interior grid spike lies between both rows of buoyancy samples.
  const water=new WaterSurface(),shoal=bottom((x,z)=>x===0 && z===0?1:-8,.5);
  assert.throws(()=>createVessel(shoal,water,0,0,.5),/navigable depth/);
  for(const field of [shoal,bottom((x,z)=>z<=0?-.2:-6,.5),bottom(()=>-10,.5)]){
    const ship=createVessel(field,water,0,12);
    let found=false;
    for(let i=0;i<1200;i++){
      stepVessel(ship,field,water,1,0);checkHull(ship,field);
      if(ship.grounded){found=true;break;}
    }
    assert.ok(found);near(ship.speed,0);const stopped=ship.p[2];
    drive(ship,field,water,180,-1,0);assert.ok(ship.p[2]>stopped+1 && !ship.grounded);
  }
  assert.throws(()=>createVessel(shoal,water,31,0));
  assert.doesNotThrow(()=>createVessel(bottom(()=>-.5),new WaterSurface(1),1,0));
});

test('invalid controls cannot mutate the accepted vessel',()=>{
  const field=bottom(),water=new WaterSurface(),ship=createVessel(field,water,0,0);
  const original=structuredClone(ship);
  for(const axes of [[NaN,0],[1,Infinity],[-2,1],[1,1.1]]){
    assert.throws(()=>stepVessel(ship,field,water,...axes));assert.deepEqual(ship,original);
  }
  assert.throws(()=>createVessel(field,water,0,Infinity));
  assert.throws(()=>createVessel(field,null,0,0));
  for(const invalid of [{p:[200,1,0]},{v:[0,NaN,0]},{roll:Infinity},{pitchRate:NaN}]){
    const bad={...structuredClone(original),...invalid},before=structuredClone(bad);
    assert.throws(()=>stepVessel(bad,field,water,0,0));assert.deepEqual(bad,before);
  }
});
