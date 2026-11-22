// Tern cutter. Six equal-area columns displace water under a finite box hull.
import {clamp,finiteVector} from '../vendor/vanillajs/modules/math/index.js';
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';
import {HZ} from './clock.js';

export const HULL_HALF=Object.freeze([1.6,1,4]);
const DT=1/HZ, G=9, MASS=78, DENSITY=10, COLUMN_AREA=2;
const DRAFT=MASS/(6*DENSITY*COLUMN_AREA), MAX_DEPTH=2;
const I_PITCH=MASS*6.5, I_ROLL=MASS*1.6, I_YAW=MASS*5.8;
const sides=[-1.1,1.1], stations=[-3,0,3];
const charts=new WeakMap();
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

function coordinate(n){
  if(!Number.isFinite(n)||Math.abs(n)>1e9)throw new RangeError('water coordinate out of range');
}
export class WaterSurface {
  constructor(level=0){
    if(!Number.isFinite(level)||Math.abs(level)>1e6)throw new RangeError('invalid water level');
    this.level=level;
    Object.freeze(this);
  }
  heightAt(x,z){coordinate(x);coordinate(z);return this.level;}
  castSegment(start,delta){
    const a=finiteVector(start,3,'origin'),d=finiteVector(delta,3,'displacement');
    for(let i=0;i<3;i++){coordinate(a[i]);coordinate(a[i]+d[i]);}
    const clearance=a[1]-this.level;
    if(clearance<=0)return {time:0,point:a,startedInside:true};
    if(clearance+d[1]>0)return null;
    const time=-clearance/d[1];
    return {time,point:[a[0]+d[0]*time,this.level,a[2]+d[2]*time],startedInside:false};
  }
}

export function vesselBasis({yaw,pitch,roll}){
  const c=Math.cos(yaw),s=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const cr=Math.cos(roll),sr=Math.sin(roll);
  return {forward:[s*cp,sp,-c*cp],right:[c*cr-s*sp*sr,cp*sr,s*cr+c*sp*sr],
    up:[-c*sr-s*sp*cr,cp*cr,-s*sr+c*sp*cr]};
}

export function vesselPoint(ship,side,up,forward){
  const basis=vesselBasis(ship);
  return ship.p.map((n,i)=>n+side*basis.right[i]+up*basis.up[i]+forward*basis.forward[i]);
}

// Cell maxima only reject deep water cheaply. Near a shoal, sample the
// authoritative surface at every extremum of the clipped triangle pair.
function chart(field){
  let b=charts.get(field);
  if(b)return b;
  if(!(field instanceof Heightfield)||field.cellSize<.5)throw new RangeError('invalid bathymetry');
  const [x0,,z0]=field.triangleAt(0,0)[0][0],size=field.cellSize;
  const peaks=new Float64Array(field.cellsX*field.cellsZ);
  for(let j=0;j<field.cellsZ;j++)for(let i=0;i<field.cellsX;i++){
    const [first,second]=field.triangleAt(i,j);
    peaks[j*field.cellsX+i]=Math.max(first[0][1],first[1][1],first[2][1],second[2][1]);
  }
  b={x0,z0,x1:x0+size*field.cellsX,z1:z0+size*field.cellsZ,peaks,size};
  charts.set(field,b);return b;
}

function extents(basis){
  return [0,1,2].map(i=>HULL_HALF[0]*Math.abs(basis.right[i])+
    HULL_HALF[1]*Math.abs(basis.up[i])+HULL_HALF[2]*Math.abs(basis.forward[i]));
}

function bedHeight(field,xmin,xmax,zmin,zmax,keel){
  const b=chart(field),size=b.size;
  if(xmin<b.x0||xmax>b.x1||zmin<b.z0||zmax>b.z1)return Infinity;
  const firstX=Math.floor((xmin-b.x0)/size),lastX=Math.min(field.cellsX-1,Math.floor((xmax-b.x0)/size));
  const firstZ=Math.floor((zmin-b.z0)/size),lastZ=Math.min(field.cellsZ-1,Math.floor((zmax-b.z0)/size));
  let peak=-Infinity;
  function visit(x,z){peak=Math.max(peak,field.sample(x,z).height);}
  for(let j=firstZ;j<=lastZ;j++)for(let i=firstX;i<=lastX;i++){
    const cellPeak=b.peaks[j*field.cellsX+i];
    if(cellPeak<=peak)continue;
    const x=b.x0+i*size,z=b.z0+j*size;
    const left=Math.max(x,xmin),right=Math.min(x+size,xmax);
    const far=Math.max(z,zmin),near=Math.min(z+size,zmax);
    if(cellPeak<keel || (left===x && right===x+size && far===z && near===z+size)){
      peak=Math.max(peak,cellPeak);continue;
    }
    visit(left,far);visit(left,near);visit(right,far);visit(right,near);
    const diagonal=x+z+size;
    for(const px of [left,right]){
      const pz=diagonal-px;
      if(pz>far && pz<near)visit(px,pz);
    }
    for(const pz of [far,near]){
      const px=diagonal-pz;
      if(px>left && px<right)visit(px,pz);
    }
  }
  return peak;
}

function hydrostatics(ship,water,basis){
  let volume=0,wet=0,vertical=-MASS*G,pitchMoment=0,rollMoment=0;
  for(const side of sides)for(const forward of stations){
    const x=ship.p[0]+side*basis.right[0]-basis.up[0]+forward*basis.forward[0];
    const y=ship.p[1]+side*basis.right[1]-basis.up[1]+forward*basis.forward[1];
    const z=ship.p[2]+side*basis.right[2]-basis.up[2]+forward*basis.forward[2];
    const depth=clamp(water.heightAt(x,z)-y,0,MAX_DEPTH);
    if(!depth)continue;
    volume+=COLUMN_AREA*depth;wet++;
    // Small-angle moments about the body centre and immersion-dependent
    // vertical damping at each column give restoring pitch, roll and heave.
    const localVy=ship.v[1]+ship.pitchRate*forward+ship.rollRate*side;
    const pressure=DENSITY*G*COLUMN_AREA*depth;
    const lift=Math.max(0,pressure-2.9*MASS/6*Math.min(1,depth/DRAFT)*localVy);
    vertical+=lift;pitchMoment+=forward*lift;rollMoment+=side*lift;
  }
  return {volume,wet,vertical,pitchMoment,rollMoment};
}

export function createVessel(field,water,x,z,yaw=0){
  if(!(water instanceof WaterSurface)||![x,z,yaw].every(Number.isFinite))throw new RangeError('invalid vessel spawn');
  const level=water.heightAt(x,z);
  const ship={p:[x,level+HULL_HALF[1]-DRAFT,z],v:[0,0,0],yaw:wrap(yaw),pitch:0,roll:0,
    pitchRate:0,rollRate:0,yawRate:0,grounded:false,speed:0,displacedVolume:MASS/DENSITY,wetPoints:6};
  const [dx,,dz]=extents(vesselBasis(ship)),keel=level-DRAFT;
  if(bedHeight(field,x-dx,x+dx,z-dz,z+dz,keel)>=keel)throw new RangeError('insufficient navigable depth');
  return ship;
}

export function stepVessel(ship,field,water,throttle,rudder){
  if(!(water instanceof WaterSurface)||![throttle,rudder].every(n=>Number.isFinite(n)&&Math.abs(n)<=1))
    throw new RangeError('invalid vessel controls or water');
  const angle=n=>Number.isFinite(n)&&Math.abs(n)<=Math.PI;
  if(!Array.isArray(ship.p)||ship.p.length!==3||!Array.isArray(ship.v)||ship.v.length!==3||
    ![ship.yaw,ship.pitch,ship.roll].every(angle)||Math.abs(ship.pitch)>.38||Math.abs(ship.roll)>.45||
    ![ship.pitchRate,ship.rollRate,ship.yawRate].every(n=>Number.isFinite(n)&&Math.abs(n)<=1))
    throw new RangeError('invalid vessel state');
  for(let i=0;i<3;i++){
    coordinate(ship.p[i]);
    if(!Number.isFinite(ship.v[i])||Math.abs(ship.v[i])>12)throw new RangeError('invalid vessel velocity');
  }
  const basis=vesselBasis(ship),old=extents(basis),b=chart(field);
  if(ship.p[0]-old[0]<b.x0||ship.p[0]+old[0]>b.x1||ship.p[2]-old[2]<b.z0||ship.p[2]+old[2]>b.z1)
    throw new RangeError('vessel outside field');
  const h=hydrostatics(ship,water,basis);
  const wet=clamp(h.volume/(MASS/DENSITY),0,1);
  const s=Math.sin(ship.yaw),c=Math.cos(ship.yaw);
  const surge=ship.v[0]*s-ship.v[2]*c,sway=ship.v[0]*c+ship.v[2]*s;
  const thrust=4.8*throttle*(throttle<0?.63:1)*wet;
  const rudderForce=-.40*rudder*surge*wet; // lateral acceleration applied at the stern
  const along=clamp(surge+DT*(thrust-wet*(.26+.046*Math.abs(surge))*surge),-4,8);
  const across=clamp(sway+DT*(rudderForce-wet*(2.4+.18*Math.abs(sway))*sway),-4,4);
  let vx=s*along+c*across,vz=-c*along+s*across;
  let vy=clamp(ship.v[1]+DT*h.vertical/MASS,-12,12);
  let yawRate=clamp(ship.yawRate+DT*(-3*MASS*rudderForce/I_YAW-1.7*ship.yawRate*wet),-.72,.72);
  // Submerged thrust and rudder forces also have a vertical moment arm.
  let pitchRate=clamp(ship.pitchRate+DT*(h.pitchMoment+.48*MASS*thrust)/I_PITCH,-1,1);
  let rollRate=clamp(ship.rollRate+DT*(h.rollMoment+.65*MASS*rudderForce)/I_ROLL,-1,1);
  let pitch=clamp(ship.pitch+pitchRate*DT,-.38,.38),roll=clamp(ship.roll+rollRate*DT,-.45,.45);
  if(Math.abs(pitch)===.38)pitchRate=0;
  if(Math.abs(roll)===.45)rollRate=0;
  let x=ship.p[0]+vx*DT,z=ship.p[2]+vz*DT,y=ship.p[1]+vy*DT,yaw=wrap(ship.yaw+yawRate*DT);
  let nextBasis=vesselBasis({yaw,pitch,roll}),extent=extents(nextBasis),grounded=false;
  if(vx || vz || yawRate){
    // Enclose the whole translation and the short rotational arc during
    // this tick. Every horizontal move must also admit the static draft.
    const tiltArc=4.5*(Math.abs(pitch-ship.pitch)+Math.abs(roll-ship.roll));
    const arc=4.5*Math.abs(wrap(yaw-ship.yaw))+tiltArc;
    const dx=Math.max(extent[0],old[0])+arc,dz=Math.max(extent[2],old[2])+arc;
    const keel=Math.min(Math.min(y-extent[1],ship.p[1]-old[1])-tiltArc,water.heightAt(x,z)-DRAFT);
    const bed=bedHeight(field,Math.min(ship.p[0],x)-dx,Math.max(ship.p[0],x)+dx,
      Math.min(ship.p[2],z)-dz,Math.max(ship.p[2],z)+dz,keel);
    if(bed>=keel){
      x=ship.p[0];z=ship.p[2];yaw=ship.yaw;vx=vz=yawRate=0;grounded=true;
      nextBasis=vesselBasis({yaw,pitch,roll});extent=extents(nextBasis);
    }
  }
  let bed=bedHeight(field,x-extent[0],x+extent[0],z-extent[2],z+extent[2],y-extent[1]);
  if(bed===Infinity){
    // Even a stationary hull's projection can widen on a change of heel.
    pitch=ship.pitch;roll=ship.roll;pitchRate=rollRate=0;
    nextBasis=vesselBasis({yaw,pitch,roll});extent=extents(nextBasis);
    bed=bedHeight(field,x-extent[0],x+extent[0],z-extent[2],z+extent[2],y-extent[1]);
    grounded=true;
  }
  if(bed>=y-extent[1]){y=bed+extent[1];vy=Math.max(0,vy);grounded=true;}
  Object.assign(ship,{p:[x,y,z],v:[vx,vy,vz],yaw,pitch,roll,pitchRate,rollRate,yawRate,
    speed:vx*Math.sin(yaw)-vz*Math.cos(yaw),grounded});
  const accepted=hydrostatics(ship,water,nextBasis);
  ship.wetPoints=accepted.wet;ship.displacedVolume=accepted.volume;
}
