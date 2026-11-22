import test from 'node:test';
import assert from 'node:assert/strict';
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';
import {aimTracks,createTracks,HULL_HALF,stepTracks,tankBasis,tankGun} from '../sim/tracks.js';

function terrain(height=()=>0,cellSize=2) {
  const n=64, origin=-n*cellSize/2, heights=[];
  for(let j=0;j<=n;j++) for(let i=0;i<=n;i++)
    heights.push(height(origin+i*cellSize,origin+j*cellSize));
  return new Heightfield({cellsX:n,cellsZ:n,cellSize,originX:origin,originZ:origin,heights});
}
const near=(actual,expected,eps=1e-9)=>assert.ok(Math.abs(actual-expected)<eps,actual+' vs '+expected);
function drive(tank,field,ticks,left,right,brake=false) {
  for(let i=0;i<ticks;i++)stepTracks(tank,field,left,right,brake);
}

test('independent belt inertia gives forward, reverse, pivot, arcing turns, coast and braking',()=>{
  const field=terrain(),base=createTracks(field,0,15);
  const t=structuredClone(base);
  drive(t,field,60,1,1);
  near(t.speed,4); near(t.yaw,0); assert.ok(t.p[2]<14 && t.p[2]>13.9);
  const coast=structuredClone(t),braked=structuredClone(t);
  drive(coast,field,25,0,0);drive(braked,field,25,1,1,true);
  assert.ok(coast.speed>3);near(braked.speed,0);assert.ok(coast.p[2]<braked.p[2]);
  drive(braked,field,120,-1,-1);near(braked.speed,-8);assert.ok(braked.p[2]>t.p[2]);
  const pivot=structuredClone(base);
  drive(pivot,field,120,1,-1);
  near(pivot.p[0],base.p[0]);near(pivot.p[2],base.p[2]);
  assert.ok(pivot.yaw>1 && pivot.leftSpeed>0 && pivot.rightSpeed<0);
  const arc=structuredClone(base);
  drive(arc,field,60,1,0);
  assert.ok(arc.p[0]>0 && arc.p[2]<base.p[2] && arc.yaw>0 && arc.yaw<1);
});

function verifyHull(t,field) {
  const {right,up,forward}=tankBasis(t);
  // Sample the actual tilted solid, including corners/extrema in projection.
  for(const side of [-1,-.5,0,.5,1])for(const length of [-1,-.5,0,.5,1]){
    const bottom=t.p.map((v,i)=>v+right[i]*side*HULL_HALF[0]-up[i]*HULL_HALF[1]+forward[i]*length*HULL_HALF[2]);
    assert.ok(bottom[1]+1e-8>=field.sample(bottom[0],bottom[2]).height);
  }
}

test('contact fits tilted planes, limits incline, scales traction and supports an interior ridge',()=>{
  const field=terrain((x,z)=>.2*x-.3*z);
  const t=createTracks(field,0,4);
  near(t.pitch,Math.atan(.3));near(t.roll,Math.atan(.2*Math.cos(t.pitch)));
  assert.ok(t.traction<1);
  drive(t,field,120,1,1);
  assert.ok(t.speed<8 && t.speed>5);
  verifyHull(t,field);
  const banked=createTracks(field,0,2,.78);
  for(let i=0;i<180;i++){
    stepTracks(banked,field,1,i%30<10?-.5:.5);
    verifyHull(banked,field);
  }
  assert.throws(()=>createTracks(terrain((x,z)=>z*.72),0,0),/unsupported/);
  // The four contact pads lie on the flat surrounding the interior vertex.
  const ridge=terrain((x,z)=>x===0 && z===0?.45:0,.5);
  const raised=createTracks(ridge,0,0,.6);
  near(raised.p[1],HULL_HALF[1]+.45);verifyHull(raised,ridge);
  const obstacle=terrain((x,z)=>z<=0?1.7:0,.5);
  const approaching=createTracks(obstacle,0,7);
  drive(approaching,obstacle,600,1,1);
  assert.ok(approaching.blocked);near(approaching.speed,0);
  assert.ok(approaching.p[2]>0);verifyHull(approaching,obstacle);
});

test('world edges, invalid controls and turret stops preserve finite accepted poses',()=>{
  const field=terrain(),t=createTracks(field,0,-58);
  drive(t,field,400,1,1);
  assert.ok(t.blocked && t.p[2]-HULL_HALF[2]>=-64);
  const snapshot=structuredClone(t);
  for(const args of [[NaN,0,false],[0,2,false],[1,1,1]]){
    assert.throws(()=>stepTracks(t,field,...args));assert.deepEqual(t,snapshot);
  }
  assert.throws(()=>aimTracks(t,NaN,0));assert.deepEqual(t,snapshot);
  assert.throws(()=>createTracks(field,NaN,0));
  assert.throws(()=>createTracks(field,-64,0));
  assert.throws(()=>createTracks(terrain(()=>0,.2),0,0));
  const moving=createTracks(field,0,0);
  for(let i=0;i<120;i++)aimTracks(moving,1,1);
  near(moving.turretYaw,1.05);near(moving.elevation,.42);
  const before=tankGun(moving);
  drive(moving,field,120,1,1);
  drive(moving,field,120,-1,1);
  assert.notEqual(moving.yaw,0);assert.ok(moving.p[2]<0);
  assert.deepEqual(tankGun(moving).direction,before.direction);
  for(let i=0;i<240;i++)aimTracks(moving,0,1);
  near(moving.elevation,.55);
  for(let i=0;i<360;i++)aimTracks(moving,0,-1);
  near(moving.elevation,-.28);
  const {pivot,muzzle,direction}=tankGun(moving);
  near(Math.hypot(...direction),1);
  for(let i=0;i<3;i++)near(muzzle[i]-pivot[i],2.7*direction[i]);
});
