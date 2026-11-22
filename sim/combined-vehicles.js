// Shared adapters for Breakwater Reach. Each mobile family retains its own
// motion state; the mission supplies the same accepted terrain, water and tick.
import {add,clamp,dot,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {castSegment} from '../vendor/vanillajs/modules/collision/index.js';
import {HZ} from './clock.js';
import {EDGE,HULL_HALF_HEIGHT,sight} from './terrain.js';
import {createTracks,stepTracks,aimTracks,tankGun,tankBasis,HULL_HALF,TURRET_HALF} from './tracks.js';
import {barrelClear} from './tank-combat.js';
import {createWalker,stepWalker,stopWalker,aimWalker,walkerGun} from './walker.js';
import {createVessel,stepVessel,vesselBasis,HULL_HALF as SHIP_HALF} from './vessel.js';
import {navalGun} from './naval-world.js';

export const CLASSES=Object.freeze(['helicopter','tank','mech','ship']);
export const BK=Object.freeze({forward:1,back:2,left:4,right:8,aimLeft:16,aimRight:32,elevate:64,
  depress:128,fire:256,up:512,down:1024,strafeLeft:2048,strafeRight:4096,brake:8192});
const DT=1/HZ;
const axis=(cmd,pos,neg)=>Number(Boolean(cmd&pos))-Number(Boolean(cmd&neg));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const inside=p=>Math.abs(p[0])<=EDGE && Math.abs(p[2])<=EDGE;
const tideCharts=new WeakMap();

function projectedHalf(half,basis){
  return [0,1,2].map(i=>half[0]*Math.abs(basis.right[i])+half[1]*Math.abs(basis.up[i])+
    half[2]*Math.abs(basis.forward[i]));
}

// A track footprint may straddle an underwater cell even if every corner is
// dry. Check extrema of each clipped triangle in its conservative envelope.
function dryTrack(w,actor){
  const half=projectedHalf(HULL_HALF,tankBasis(actor)),[x,,z]=actor.p;
  const xmin=x-half[0],xmax=x+half[0],zmin=z-half[2],zmax=z+half[2];
  const {field,water}=w,size=field.cellSize;
  let chart=tideCharts.get(field);
  if(!chart){
    const [x0,,z0]=field.triangleAt(0,0)[0][0];
    chart={x0,z0,low:new Float64Array(field.cellsZ*field.cellsX).fill(NaN)};
    tideCharts.set(field,chart);
  }
  const {x0,z0,low}=chart;
  if(xmin<x0||xmax>x0+size*field.cellsX||zmin<z0||zmax>z0+size*field.cellsZ)return false;
  const dry=(a,b)=>field.sample(a,b).height>water.heightAt(a,b);
  for(let j=Math.floor((zmin-z0)/size);j<=Math.min(field.cellsZ-1,Math.floor((zmax-z0)/size));j++){
    const cz=z0+j*size,south=Math.max(zmin,cz),north=Math.min(zmax,cz+size);
    for(let i=Math.floor((xmin-x0)/size);i<=Math.min(field.cellsX-1,Math.floor((xmax-x0)/size));i++){
      const cell=j*field.cellsX+i;
      if(Number.isNaN(low[cell])){
        const [a,b]=field.triangleAt(i,j);
        low[cell]=Math.min(a[0][1],a[1][1],a[2][1],b[2][1]);
      }
      if(low[cell]>water.level)continue;
      const cx=x0+i*size,west=Math.max(xmin,cx),east=Math.min(xmax,cx+size);
      if(!dry(west,south)||!dry(west,north)||!dry(east,south)||!dry(east,north))return false;
      const diagonal=cx+cz+size;
      for(const px of [west,east]){
        const pz=diagonal-px;
        if(pz>south && pz<north && !dry(px,pz))return false;
      }
      for(const pz of [south,north]){
        const px=diagonal-pz;
        if(px>west && px<east && !dry(px,pz))return false;
      }
    }
  }
  return true;
}

function dryWalker(w,a){
  const dry=p=>w.field.sample(p[0],p[2]).height>w.water.heightAt(p[0],p[2]);
  return dry(a.p) && a.feet.every(f=>dry(f.p)) && (!a.plan || a.plan.goals.every(dry));
}

// The accepted gait plans one 24-tick stride at a time. Before transferring
// weight at the coast, verify that the opposite tripod can actually land.
// A bank can leave the last swing shoe beyond reach even on a dry patch.
function admissibleStride(w,next){
  if(!dryWalker(w,next))return false;
  if(next.phase!==1)return true;
  const probe={...next};
  for(let i=1;i<24;i++){
    stepWalker(probe,w.field,0,0);
    if(probe.blocked || !dryWalker(w,probe))return false;
  }
  return probe.gait==='stance' && probe.supportCount===6;
}

export function createVehicle(w,kind,id,faction,x,z,yaw=0){
  if(!CLASSES.includes(kind)||typeof id!=='string'||!id||typeof faction!=='string'||!faction||
    ![x,z,yaw].every(Number.isFinite)||Math.abs(x)>EDGE-4||Math.abs(z)>EDGE-4)
    throw new RangeError('invalid estuary vehicle spawn');
  let state;
  if(kind==='tank'){
    state=createTracks(w.field,x,z,yaw);
    if(!dryTrack(w,state))throw new RangeError('tracks need dry ground');
  }else if(kind==='mech'){
    state=createWalker(w.field,x,z,yaw);
    if(!dryWalker(w,state))throw new RangeError('walker needs dry footholds');
  }else if(kind==='ship'){
    state={...createVessel(w.field,w.water,x,z,yaw),mountYaw:wrap(yaw),elevation:0};
  }else{
    const floor=Math.max(w.field.sample(x,z).height+w.offset,w.water.heightAt(x,z)+HULL_HALF_HEIGHT);
    state={p:[x,floor+2.5,z],v:[0,0,0],yaw:wrap(yaw),pitch:0,roll:0,bank:0,aim:0};
  }
  return {...state,id,kind,faction,hp:100,maxHp:100,ammo:48,ready:0};
}

export function aimVehicle(a,turn,lift){
  if(![turn,lift].every(n=>Number.isFinite(n)&&Math.abs(n)<=1))throw new RangeError('invalid mount command');
  if(a.kind==='tank')return aimTracks(a,turn,lift);
  if(a.kind==='mech')return aimWalker(a,turn,lift);
  if(a.kind==='helicopter'){
    a.yaw=(a.yaw+turn*1.35*DT)%(2*Math.PI);
    a.aim=clamp(a.aim+lift*.75*DT,-.95,.65);
  }else{
    a.mountYaw=wrap(a.mountYaw+turn*1.5/HZ);
    a.elevation=clamp(a.elevation+lift*.55/HZ,-.18,.55);
  }
}

// RIDGEFIRE's private fly step is part of a frozen replay identity. Preserve
// its equations, operation order and ground envelope; add the estuary surface.
// A parity test compares each pose with an actual accepted RIDGEFIRE step.
function fly(w,a,cmd,drive,steer){
  const collective=axis(cmd,BK.up,BK.down);
  a.pitch+=(.48*drive-a.pitch)*4*DT;
  a.bank+=(.48*axis(cmd,BK.strafeRight,BK.strafeLeft)-a.bank)*4*DT;
  a.roll=a.bank;
  aimVehicle(a,clamp(steer+axis(cmd,BK.aimRight,BK.aimLeft),-1,1),axis(cmd,BK.elevate,BK.depress));
  const lift=(20+17*collective)/(Math.cos(a.bank)*Math.cos(a.pitch));
  const side=lift*Math.sin(a.bank),forward=lift*Math.cos(a.bank)*Math.sin(a.pitch);
  const c=Math.cos(a.yaw),s=Math.sin(a.yaw);
  const acceleration=[side*c+forward*s,lift*Math.cos(a.bank)*Math.cos(a.pitch)-20,side*s-forward*c];
  a.v=a.v.map((v,i)=>clamp(v+DT*(acceleration[i]-v*(i===1?1.8:.65)),-25,25));
  const next=add(a.p,scale(a.v,DT));
  for(let i=0;i<3;i++){
    const bounded=i===1?Math.min(95,next[i]):clamp(next[i],-EDGE+4,EDGE-4);
    if(bounded!==next[i])a.v[i]=0;
    next[i]=bounded;
  }
  const delta=subtract(next,a.p),bed=w.field.castSegment(a.p,delta,{verticalOffset:w.offset});
  const water=w.water.castSegment([a.p[0],a.p[1]-HULL_HALF_HEIGHT,a.p[2]],delta);
  if(!bed && !water){a.p=next;return null;}
  const wet=water && (!bed || water.time<bed.time);
  a.p=wet?[water.point[0],w.water.level+HULL_HALF_HEIGHT+.002,water.point[2]]:add(bed.point,[0,.002,0]);
  const impact=wet?-a.v[1]:-dot(a.v,bed.normal);
  a.v=[0,0,0];
  return impact>7.2?(wet?'water':'terrain'):null;
}

export function vehicleGun(a){
  if(a.kind==='tank')return tankGun(a);
  if(a.kind==='mech')return walkerGun(a);
  if(a.kind==='ship')return navalGun(a);
  const flying=a.kind==='helicopter';
  const pivot=flying?add(a.p,[0,-.1,0]):add(a.p,[0,a.half[1]+.4,0]);
  const yaw=flying?a.yaw:a.mountYaw,angle=flying?a.aim-a.pitch*.55:a.elevation;
  const direction=[Math.sin(yaw)*Math.cos(angle),Math.sin(angle),-Math.cos(yaw)*Math.cos(angle)];
  return {pivot,direction,muzzle:add(pivot,scale(direction,flying?2.35:1.8))};
}

export function targetPoint(a){
  if(a.kind==='tank'||a.kind==='mech')return vehicleGun(a).pivot;
  if(a.kind==='ship')return add(a.p,[0,1.15,0]);
  return a.p;
}

export function vehicleParts(a){
  if(a.kind==='tank'){
    const c=Math.abs(Math.cos(a.turretYaw)),s=Math.abs(Math.sin(a.turretYaw));
    return [{name:'hull',p:a.p,half:projectedHalf(HULL_HALF,tankBasis(a))},
      {name:'turret',p:tankGun(a).pivot,half:[(s+c)*TURRET_HALF[0],TURRET_HALF[1],(s+c)*TURRET_HALF[2]]}];
  }
  if(a.kind==='mech')return [{name:'pelvis',p:a.p,half:[1,.45,1.05]},
    {name:'torso',p:add(a.p,[0,1,0]),half:[.98,.88,1.05]}];
  if(a.kind==='ship')return [{name:'hull',p:a.p,half:projectedHalf(SHIP_HALF,vesselBasis(a))},
    {name:'deck',p:add(a.p,[0,1.15,0]),half:[1.15,1,1.15]}];
  if(a.kind==='relay')return [{name:'station',p:a.p,half:a.half}];
  return [{name:'airframe',p:a.p,half:[1.35,.8,2]}];
}

export function gunClear(w,a){
  const {pivot,muzzle}=vehicleGun(a);
  if(!inside(pivot)||!inside(muzzle)||w.water.castSegment(pivot,subtract(muzzle,pivot)))return false;
  if(a.kind==='tank')return barrelClear(w.field,a);
  if(!sight(w.field,pivot,muzzle))return false;
  if(a.kind!=='ship' && a.kind!=='relay')return true;
  const boxes=vehicleParts(a).map(({name,p,half})=>({id:name,box:{min:subtract(p,half),max:add(p,half)}}));
  return !castSegment(pivot,subtract(muzzle,pivot),boxes);
}

// The physical exclusion envelope is deliberately larger than the scoring
// volumes. It extends under the feet and over the rendered superstructure.
const envelopes={tank:[2.7,1.4,1.75],mech:[3.35,3.2,2],ship:[4.6,2.8,2.6],
  helicopter:[2.8,1.4,1.4],relay:[3.5,3.2,3.2]};
function occupied(candidate,others){
  const [radius,below,above]=envelopes[candidate.kind],p=candidate.p;
  return others.some(b=>{
    if(!b.hp||b.id===candidate.id)return false;
    const [r,lo,hi]=envelopes[b.kind];
    return p[1]-below<b.p[1]+hi && p[1]+above>b.p[1]-lo &&
      Math.hypot(p[0]-b.p[0],p[2]-b.p[2])<radius+r;
  });
}

export function driveVehicle(w,a,cmd,others=[]){
  if(!Number.isInteger(cmd)||cmd<0||cmd>16383)throw new RangeError('invalid combined controls');
  if(!a.hp)return null;
  const drive=axis(cmd,BK.forward,BK.back),steer=axis(cmd,BK.right,BK.left);
  const next={...a};
  let crash=null,wet=false;
  if(a.kind==='helicopter')crash=fly(w,next,cmd,drive,steer);
  else if(a.kind==='tank'){
    stepTracks(next,w.field,clamp(drive+steer,-1,1),clamp(drive-steer,-1,1),Boolean(cmd&BK.brake));
    wet=!dryTrack(w,next);
  }else if(a.kind==='mech'){
    stepWalker(next,w.field,drive,steer);wet=!admissibleStride(w,next);
  }else if(a.kind==='ship')stepVessel(next,w.field,w.water,drive,steer);
  if(wet || occupied(next,others)){
    if(a.kind==='tank'){a.leftSpeed=a.rightSpeed=a.speed=0;a.v=[0,0,0];a.blocked=true;}
    if(a.kind==='mech'){stopWalker(a,w.field);a.blocked=true;}
    if(a.kind==='ship'){
      a.v=[0,a.v[1],0];a.yawRate=0;stepVessel(a,w.field,w.water,0,0);
    }
    if(a.kind==='helicopter'){
      a.v=[0,0,0];a.aim=next.aim;a.yaw=next.yaw;
    }
    crash=null;
  }else Object.assign(a,next);
  if(a.kind!=='helicopter')aimVehicle(a,axis(cmd,BK.aimRight,BK.aimLeft),axis(cmd,BK.elevate,BK.depress));
  return crash;
}
