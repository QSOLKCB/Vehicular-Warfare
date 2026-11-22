// Original fixed-tick differential drive for the game's two powered tracks.
import {HZ} from './clock.js';
import {clamp} from '../vendor/vanillajs/modules/math/index.js';

export const HULL_HALF = Object.freeze([1.35, .65, 2.05]);
export const TURRET_HALF = Object.freeze([.8, .4, .8]);
const DT = 1 / HZ;
const MAX_SPEED = 11;
const MAX_GRADE = .64;
const MAX_TRAVEL = .82;
const fields = new WeakMap();

function bounds(field) {
  let b = fields.get(field);
  if (!b) {
    if (field.cellSize < .5) throw new RangeError('track contact requires cells at least 0.5 m wide');
    const [x0,,z0] = field.triangleAt(0,0)[0][0];
    b = {x0,z0,x1:x0+field.cellsX*field.cellSize,z1:z0+field.cellsZ*field.cellSize};
    fields.set(field,b);
  }
  return b;
}

function wrap(angle) {
  return Math.atan2(Math.sin(angle),Math.cos(angle));
}

function control(n) {
  if (!Number.isFinite(n) || Math.abs(n) > 1) throw new RangeError('expected control in [-1,1]');
}

export function tankBasis({yaw,pitch,roll}) {
  const s=Math.sin(yaw), c=Math.cos(yaw), sp=Math.sin(pitch), cp=Math.cos(pitch);
  const sr=Math.sin(roll), cr=Math.cos(roll);
  return {
    forward:[s*cp,sp,-c*cp],
    right:[c*cr-s*sp*sr,cp*sr,s*cr+c*sp*sr],
    up:[-c*sr-s*sp*cr,cp*cr,-s*sr+c*sp*cr]
  };
}

export function tankGun(tank) {
  const {up}=tankBasis(tank);
  const pivot=tank.p.map((n,i)=>n+1.05*up[i]);
  const c=Math.cos(tank.elevation);
  const direction=[Math.sin(tank.turretYaw)*c,Math.sin(tank.elevation),-Math.cos(tank.turretYaw)*c];
  return {pivot,direction,muzzle:pivot.map((n,i)=>n+direction[i]*2.7)};
}

// Over each cell rectangle the difference between terrain and hull plane
// is affine on each side of the authored triangle diagonal. Its extrema
// occur at rectangle corners and intersections of that diagonal with an edge.
function groundEnvelope(field, b, x, z, dx, dz, gx, gz) {
  const size=field.cellSize;
  const xmin=x-dx, xmax=x+dx, zmin=z-dz, zmax=z+dz;
  if (xmin<b.x0 || xmax>b.x1 || zmin<b.z0 || zmax>b.z1) return null;
  const firstX=Math.floor((xmin-b.x0)/size), lastX=Math.min(field.cellsX-1,Math.floor((xmax-b.x0)/size));
  const firstZ=Math.floor((zmin-b.z0)/size), lastZ=Math.min(field.cellsZ-1,Math.floor((zmax-b.z0)/size));
  let low=Infinity, high=-Infinity;
  function visit(px,pz) {
    const residual=field.sample(px,pz).height-gx*(px-x)-gz*(pz-z);
    low=Math.min(low,residual);
    high=Math.max(high,residual);
  }
  for (let iz=firstZ; iz<=lastZ; iz++) {
    const cellZ=b.z0+iz*size, south=Math.max(zmin,cellZ), north=Math.min(zmax,cellZ+size);
    for (let ix=firstX; ix<=lastX; ix++) {
      const cellX=b.x0+ix*size, west=Math.max(xmin,cellX), east=Math.min(xmax,cellX+size);
      visit(west,south); visit(west,north); visit(east,south); visit(east,north);
      const diagonal=cellX+cellZ+size;
      for (const px of [west,east]) {
        const pz=diagonal-px;
        if (pz>south && pz<north) visit(px,pz);
      }
      for (const pz of [south,north]) {
        const px=diagonal-pz;
        if (px>west && px<east) visit(px,pz);
      }
    }
  }
  return {high,roughness:high-low};
}

function contact(field,x,z,yaw) {
  const b=bounds(field), s=Math.sin(yaw), c=Math.cos(yaw);
  const [halfWidth,halfHeight,halfLength]=HULL_HALF;
  const sideX=c*halfWidth, sideZ=s*halfWidth, noseX=s*halfLength, noseZ=-c*halfLength;
  const ex=Math.abs(sideX)+Math.abs(noseX), ez=Math.abs(sideZ)+Math.abs(noseZ);
  if (x-ex<b.x0 || x+ex>b.x1 || z-ez<b.z0 || z+ez>b.z1) return null;
  const h=(side,nose)=>field.sample(x+side*sideX+nose*noseX,z+side*sideZ+nose*noseZ).height;
  const fr=h(1,1), fl=h(-1,1), br=h(1,-1), bl=h(-1,-1);
  const along=(fr+fl-br-bl)/(4*halfLength), across=(fr+br-fl-bl)/(4*halfWidth);
  const grade=Math.hypot(along,across);
  if (grade>MAX_GRADE) return null;
  const pitch=Math.atan(along), roll=Math.atan(across*Math.cos(pitch));
  const {right,up,forward}=tankBasis({yaw,pitch,roll});
  // Enclose the complete tilted hull's projection, including its upper edges.
  // Axis alignment can bridge an adjacent bump on diagonal headings.
  const extent=i=>halfWidth*Math.abs(right[i])+halfHeight*Math.abs(up[i])+halfLength*Math.abs(forward[i]);
  const support=groundEnvelope(field,b,x,z,extent(0),extent(2),across*c+along*s,across*s-along*c);
  if (!support || support.roughness>MAX_TRAVEL) return null;
  return {p:[x,support.high+halfHeight/up[1],z],yaw,pitch,roll,
    traction:clamp(1-.65*grade-.22*support.roughness,.35,1)};
}

export function createTracks(field,x,z,yaw=0) {
  if (![x,z,yaw].every(Number.isFinite)) throw new RangeError('invalid track pose');
  const initial=contact(field,x,z,wrap(yaw));
  if (!initial) throw new RangeError('unsupported track pose');
  return {...initial,v:[0,0,0],speed:0,leftSpeed:0,rightSpeed:0,blocked:false,
    turretYaw:initial.yaw,elevation:0};
}

function accelerate(current,throttle,brake,traction) {
  const target=brake?0:throttle*MAX_SPEED;
  const acceleration=brake?21:throttle===0?2.8:8;
  const limit=acceleration*traction*DT;
  return current+clamp(target-current,-limit,limit);
}

export function stepTracks(tank,field,left,right,brake=false) {
  control(left); control(right);
  if (typeof brake!=='boolean') throw new TypeError('brake must be boolean');
  const leftSpeed=accelerate(tank.leftSpeed,left,brake,tank.traction);
  const rightSpeed=accelerate(tank.rightSpeed,right,brake,tank.traction);
  const speed=(leftSpeed+rightSpeed)/2;
  const turn=clamp((leftSpeed-rightSpeed)/2.7,-1.45,1.45)*tank.traction*DT;
  const distance=speed*DT*Math.cos(tank.pitch);
  const heading=tank.yaw+turn/2;
  const x=tank.p[0]+Math.sin(heading)*distance, z=tank.p[2]-Math.cos(heading)*distance;
  if (turn===0 && distance===0) {
    Object.assign(tank,{v:[0,0,0],leftSpeed,rightSpeed,speed,blocked:false});
    return;
  }
  const next=contact(field,x,z,wrap(tank.yaw+turn));
  if (!next || Math.abs(next.p[1]-tank.p[1])>.28) {
    tank.leftSpeed=tank.rightSpeed=tank.speed=0;
    tank.v=[0,0,0]; tank.blocked=true;
    return;
  }
  const v=next.p.map((n,i)=>(n-tank.p[i])*HZ);
  Object.assign(tank,next,{v,leftSpeed,rightSpeed,speed,blocked:false});
}

export function aimTracks(tank,traverse,lift) {
  control(traverse); control(lift);
  if (traverse!==0) tank.turretYaw=wrap(tank.turretYaw+traverse*1.05*DT);
  tank.elevation=clamp(tank.elevation+lift*.42*DT,-.28,.55);
}
