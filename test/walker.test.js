import test from 'node:test';
import assert from 'node:assert/strict';
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';
import {createWalker,stepWalker,aimWalker,legJoints,walkerGun,stopWalker} from '../sim/walker.js';

function terrain(fn=()=>0){
  const heights=[],n=96,cell=.5,origin=-24;
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++)heights.push(fn(origin+i*cell,origin+j*cell));
  return new Heightfield({originX:origin,originZ:origin,cellSize:cell,cellsX:n,cellsZ:n,heights});
}
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
function verifyLegs(w,field){
  for(let i=0;i<6;i++){
    const {hip,knee,foot}=legJoints(w,i);
    near(distance(hip,knee),1.55);near(distance(knee,foot),1.55);
    const ground=field.sample(foot[0],foot[2]).height;
    assert.ok(foot[1]>=ground-1e-7);
    if(w.feet[i].stance)near(foot[1],ground);
  }
  assert.equal(w.supportCount,w.feet.filter(f=>f.stance).length);
}
// Independent half-plane check for the triangle formed by the planted toes.
function insideTripod(w){
  const feet=w.feet.filter(f=>f.stance).map(f=>f.p);
  assert.equal(feet.length,3);
  const cross=feet.map((a,i)=>{
    const b=feet[(i+1)%3];
    return (b[0]-a[0])*(w.p[2]-a[2])-(b[2]-a[2])*(w.p[0]-a[0]);
  });
  return cross.every(v=>v>=0) || cross.every(v=>v<=0);
}
test('tripods anchor the moving pelvis, clear swing feet, solve fixed link lengths and carry independent aim',()=>{
  const field=terrain((x,z)=>.12*x-.13*z+.19*Math.sin(.7*z));
  const w=createWalker(field,0,10);
  let maxSpeed=0,tilted=false,raised=false,seenRight=false,seenLeft=false;
  for(let t=0;t<460;t++){
    const before=w.feet,old=w.p,oldPitch=w.pitch;
    stepWalker(w,field,1,t<280?0:.6);
    aimWalker(w,t<100?-.5:0,0);
    for(let i=0;i<6;i++)if(before[i].stance && w.feet[i].stance)assert.deepEqual(w.feet[i].p,before[i].p);
    assert.ok(Math.abs(w.p[1]-old[1])<=4/120+1e-7);
    assert.ok(Math.abs(w.pitch-oldPitch)<=1.6/120+1e-7);
    if(w.gait==='swing'){
      assert.ok(insideTripod(w));
      if(w.feet[0].stance)seenLeft=true;else seenRight=true;
      raised ||= w.feet.some(f=>f.p[1]>field.sample(f.p[0],f.p[2]).height+.2);
    }
    verifyLegs(w,field);
    tilted ||= Math.abs(w.roll)>.06 && Math.abs(w.pitch)>.05;
    maxSpeed=Math.max(maxSpeed,w.speed);
  }
  assert.ok(seenLeft && seenRight && raised && tilted);assert.equal(maxSpeed,4);
  assert.ok(w.steps>=18 && w.p[2]<2 && w.yaw>.5);near(w.torsoYaw,-.5);
  const barrel=walkerGun(w);
  near(distance(barrel.muzzle,barrel.pivot),2.15);near(Math.hypot(...barrel.direction),1);
  const stopping=w.p.slice();
  for(let t=0;t<230;t++)stepWalker(w,field,0,0);
  assert.equal(w.speed,0);assert.equal(w.supportCount,6);assert.equal(w.gait,'stance');
  assert.ok(distance(w.p,stopping)>.1 && distance(w.p,stopping)<3);
});

test('accepted low rise, rejected cliff, slope limits, field edges and finite controls',()=>{
  const rise=terrain((x,z)=>Math.min(.42,Math.max(0,-z*.4)));
  const w=createWalker(rise,0,5);
  for(let t=0;t<450;t++)stepWalker(w,rise,1,0);
  assert.ok(w.p[2]<-7);near(w.p[1],2.25+.42);
  const cliff=terrain((x,z)=>z<0?2:0),stopped=createWalker(cliff,0,6);
  for(let t=0;t<1000;t++)stepWalker(stopped,cliff,1,0);
  assert.equal(stopped.blocked,true);
  assert.ok(stopped.p[2]>0);verifyLegs(stopped,cliff);
  assert.throws(()=>createWalker(terrain((x,z)=>.62*x),0,0));
  assert.throws(()=>createWalker(rise,0,-24));
  const edge=createWalker(rise,0,-19);
  for(let t=0;t<900;t++)stepWalker(edge,rise,1,0);
  assert.ok(edge.blocked);verifyLegs(edge,rise);
  const copy=structuredClone(edge);
  for(const bad of [NaN,Infinity,1.5,-2]){
    assert.throws(()=>stepWalker(edge,rise,1,bad));assert.throws(()=>aimWalker(edge,bad,0));
  }
  assert.deepEqual(edge,copy);
});

test('unsupported shoes unload, pelvis descends and reachable ground restores support',()=>{
  const high=terrain(()=>2),low=terrain(()=>-1);
  const w=createWalker(high,0,4);
  const original=w.p[1];
  stepWalker(w,low,1,0);
  assert.equal(w.supportCount,0);assert.equal(w.gait,'recovering');assert.ok(w.p[1]<original);
  for(let t=0;t<360;t++){
    verifyLegs(w,low);
    stepWalker(w,low,0,0);
  }
  assert.equal(w.gait,'stance');assert.equal(w.supportCount,6);near(w.p[1],1.25);
  const plain=terrain(),ledge=terrain(x=>x>=1?-9:0);
  const stranded=createWalker(plain,0,0);
  for(let t=0;t<360;t++){
    stepWalker(stranded,ledge,1,0);
    verifyLegs(stranded,ledge);
  }
  assert.equal(stranded.gait,'recovering');assert.ok(stranded.supportCount<=3);
  assert.ok(stranded.p[1]<1 && stranded.p[2]===0);
  assert.equal(stranded.feet[1].stance,false);
  const [x,y,z]=stranded.feet[1].p;
  assert.ok(y>ledge.sample(x,z).height);
});
test('aborting a swing retracts propulsion and plants airborne feet before resuming',()=>{
  const field=terrain(),w=createWalker(field,0,0);
  for(let t=0;t<11;t++)stepWalker(w,field,1,0);
  assert.equal(w.gait,'swing');
  const place=w.p.slice();
  stopWalker(w,field);
  assert.equal(w.speed,0);assert.equal(w.gait,'recovering');
  for(let t=0;t<60;t++)stepWalker(w,field,0,0);
  assert.deepEqual(w.p,place);assert.equal(w.supportCount,6);assert.equal(w.gait,'stance');
  const start=w.p.slice();
  for(let t=0;t<120;t++)stepWalker(w,field,-1,0);
  assert.ok(w.p[2]>start[2]+1);
});
