// Quasi-static tripod walker. A planted foot is a world-space point contact.
import {HZ} from './clock.js';
import {add,clamp,dot,length,mix,normalize,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';

const TRIPODS=[[0,3,4],[1,2,5]];
const BEAT=24, HEIGHT=2.25, LINK=1.55, MAX_RISE=.62, GRADE=.56;
const limits=new WeakMap();
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function axis(n){
  if(!Number.isFinite(n) || Math.abs(n)>1)throw new RangeError('walker control outside [-1,1]');
}
function ground(field,x,z){
  let b=limits.get(field);
  if(!b){
    const [x0,,z0]=field.triangleAt(0,0)[0][0];
    b={x0,z0,x1:x0+field.cellsX*field.cellSize,z1:z0+field.cellsZ*field.cellSize};
    limits.set(field,b);
  }
  return x>=b.x0 && x<=b.x1 && z>=b.z0 && z<=b.z1 ? field.sample(x,z) : null;
}
function usable(sample){
  return sample && sample.normal[1]>=1/Math.hypot(1,GRADE);
}
function anchor(x,z,yaw,index,hip){
  const side=(index%2 ? 1 : -1)*(hip ? .75 : 1.45);
  const forward=(1-Math.floor(index/2))*(hip ? 1 : 1.85);
  const s=Math.sin(yaw),c=Math.cos(yaw);
  return [x+c*side+s*forward, z+s*side-c*forward];
}
function hipPoint(body,index){
  const [x,z]=anchor(body.p[0],body.p[2],body.yaw,index,true);
  const side=(index%2 ? .75 : -.75),forward=1-Math.floor(index/2);
  const y=body.p[1]+side*Math.tan(body.roll)+forward*Math.tan(body.pitch);
  return [x,y,z];
}

// Equal-length links intersect on a circle normal to the hip-to-foot axis.
// The knee takes the outward point on that circle, giving a consistent bend.
export function legJoints(body,index){
  if(!Number.isInteger(index)||index<0||index>5)throw new RangeError('unknown leg');
  const hip=hipPoint(body,index),foot=body.feet[index].p;
  const delta=subtract(foot,hip),d=length(delta),unit=d>1e-9?scale(delta,1/d):[0,-1,0];
  const sign=index%2 ? 1 : -1;
  const side=[Math.cos(body.yaw)*sign,0,Math.sin(body.yaw)*sign];
  const outward=Math.abs(dot(side,unit))>.99 ? [0,1,0] : side;
  const bend=normalize(subtract(outward,scale(unit,dot(outward,unit))));
  const knee=add(mix(hip,foot,.5),scale(bend,Math.sqrt(Math.max(0,LINK*LINK-d*d/4))));
  return {hip,knee,foot};
}

function supportPlane(feet,group,x,z){
  const [a,b,c]=TRIPODS[group].map(i=>feet[i].p);
  const bx=b[0]-a[0],bz=b[2]-a[2],cx=c[0]-a[0],cz=c[2]-a[2];
  const area=bx*cz-bz*cx;
  if(Math.abs(area)<.1)return null;
  const u=((x-a[0])*cz-(z-a[2])*cx)/area;
  const v=(bx*(z-a[2])-bz*(x-a[0]))/area;
  const by=b[1]-a[1],cy=c[1]-a[1];
  return {y:a[1]+u*by+v*cy,gx:(by*cz-bz*cy)/area,gz:(bx*cy-by*cx)/area,
    margin:Math.min(u,v,1-u-v)};
}
function settled(feet,group,x,z){
  if(!TRIPODS[group].every(i=>feet[i].stance))return null;
  const plane=supportPlane(feet,group,x,z);
  return plane && plane.margin>=.008 && Math.hypot(plane.gx,plane.gz)<=GRADE ? plane : null;
}
function pose(x,z,yaw,plane){
  const s=Math.sin(yaw),c=Math.cos(yaw);
  return {p:[x,plane.y+HEIGHT,z],yaw,pitch:Math.atan(s*plane.gx-c*plane.gz),
    roll:Math.atan(c*plane.gx+s*plane.gz)};
}
// Suspension transfers load onto the new tripod over several ticks where
// adjacent contact planes differ. Both speed limits are independent of FPS.
function transfer(body,goal){
  goal.p[1]=body.p[1]+clamp(goal.p[1]-body.p[1],-4/HZ,4/HZ);
  for(const axis of ['pitch','roll'])goal[axis]=body[axis]+clamp(goal[axis]-body[axis],-1.6/HZ,1.6/HZ);
  return goal;
}
function reachable(body,feet){
  return feet.every((f,i)=>length(subtract(hipPoint(body,i),f.p))<=2*LINK-1e-5);
}

export function createWalker(field,x,z,yaw=0){
  if(![x,z,yaw].every(Number.isFinite))throw new TypeError('invalid walker spawn');
  yaw=wrap(yaw);
  const feet=Array.from({length:6},(_,i)=>{
    const [fx,fz]=anchor(x,z,yaw,i,false),sample=ground(field,fx,fz);
    if(!usable(sample))throw new RangeError('unsupported walker spawn');
    return {p:[fx,sample.height,fz],stance:true};
  });
  const plane=settled(feet,0,x,z);
  if(!plane || !settled(feet,1,x,z))throw new RangeError('unstable walker spawn');
  const body=pose(x,z,yaw,plane);
  if(!reachable(body,feet) || body.p[1]-ground(field,x,z).height<.7)
    throw new RangeError('unreachable walker spawn');
  return {...body,v:[0,0,0],speed:0,torsoYaw:yaw,elevation:0,feet,gait:'stance',
    supportCount:6,group:0,phase:0,plan:null,steps:0,blocked:false};
}
export function aimWalker(w,traverse,lift){
  axis(traverse);axis(lift);
  w.torsoYaw=wrap(w.torsoYaw+traverse*1.2/HZ);
  w.elevation=clamp(w.elevation+lift*.48/HZ,-.35,.55);
}
export function walkerGun(w){
  const pivot=add(w.p,[0,1,0]),c=Math.cos(w.elevation);
  const direction=[Math.sin(w.torsoYaw)*c,Math.sin(w.elevation),-Math.cos(w.torsoYaw)*c];
  return {pivot,direction,muzzle:add(pivot,scale(direction,2.15))};
}

function beginStride(w,field,speed,steer){
  const turn=steer*.95*BEAT/HZ,heading=w.yaw+turn/2,dist=speed*BEAT/HZ;
  const dx=dist*Math.sin(heading),dz=-dist*Math.cos(heading);
  const x=w.p[0],z=w.p[2],group=w.group;
  // Include a short projected drift in the COM check. Fixed contacts form
  // a convex triangle, so the whole horizontal segment is supported.
  if(!settled(w.feet,group,x,z) || !settled(w.feet,group,x+1.08*dx,z+1.08*dz))return null;
  const goals=w.feet.map(f=>f.p);
  for(const i of TRIPODS[1-group]){
    const [fx,fz]=anchor(x+1.5*dx,z+1.5*dz,w.yaw+1.5*turn,i,false);
    const sample=ground(field,fx,fz),from=w.feet[i].p;
    if(!usable(sample) || Math.abs(sample.height-from[1])>MAX_RISE)return null;
    const target=[fx,sample.height,fz];
    // A narrow intervening ridge can exceed step clearance even when both
    // endpoints are on flat ground. Check the whole horizontal path.
    if(field.castSegment(add(from,[0,MAX_RISE,0]),subtract(target,from)))return null;
    goals[i]=target;
  }
  return {x,z,yaw:w.yaw,dx,dz,turn,from:w.feet.map(f=>f.p),goals};
}
function swingPose(w,field,plan){
  const phase=w.phase+1,t=phase/BEAT,blend=t*t*(3-2*t);
  const x=plan.x+plan.dx*t,z=plan.z+plan.dz*t,yaw=wrap(plan.yaw+plan.turn*t);
  const plane=supportPlane(w.feet,w.group,x,z);
  if(!plane || plane.margin<0)return null;
  const body=transfer(w,pose(x,z,yaw,plane));
  const sample=ground(field,x,z);
  if(!sample || sample.height>body.p[1]-.7)return null;
  const feet=w.feet.slice();
  for(const i of TRIPODS[1-w.group]){
    const point=mix(plan.from[i],plan.goals[i],blend);
    const surface=ground(field,point[0],point[2]);
    if(!surface)return null;
    point[1]=surface.height+.38*4*t*(1-t);
    feet[i]={p:point,stance:phase===BEAT};
  }
  if(!reachable(body,feet))return null;
  return {...body,feet,phase};
}

// Loss of accepted contacts arrests horizontal motion. Under gravity the
// pelvis settles, and each unloaded leg lowers its shoe at bounded speed.
// Recovery requires three grounded contacts surrounding the COM.
function recoveryFeet(w,body,field){
  return w.feet.map((f,i)=>{
    const h=hipPoint(body,i),dx=f.p[0]-h[0],dz=f.p[2]-h[2];
    // Unreachable targets leave the shoe dangling at full extension.
    // Keep planted XZ anchors fixed whenever they are within lateral reach.
    const reach=2*LINK-.001,horiz=Math.hypot(dx,dz),ratio=Math.min(1,reach/(horiz||1));
    const x=h[0]+dx*ratio,z=h[2]+dz*ratio,groundAt=ground(field,x,z);
    const vertical=Math.sqrt(Math.max(0,reach*reach-(horiz*ratio)**2));
    const wanted=Math.max(groundAt?.height??-Infinity,f.p[1]-4/HZ);
    const y=clamp(wanted,h[1]-vertical,h[1]+vertical);
    return {p:[x,y,z],stance:usable(groundAt)===true && Math.abs(y-groundAt.height)<1e-6};
  });
}

export function stopWalker(w,field){
  const [x,y,z]=w.p, floor=ground(field,x,z);
  const probe=recoveryFeet(w,w,field);
  const group=[w.group,1-w.group].find(g=>settled(probe,g,x,z));
  let body;
  if(group!==undefined){
    body=transfer(w,pose(x,z,w.yaw,supportPlane(probe,group,x,z)));
  }else{
    const floorY=floor ? floor.height+.7 : y;
    const dy=Math.max(floorY-y,Math.max(-6,w.v[1]-9.8/HZ)/HZ);
    body={p:[x,y+dy,z],yaw:w.yaw,pitch:w.pitch,roll:w.roll};
  }
  const feet=recoveryFeet(w,body,field);
  const supported=group!==undefined && settled(feet,group,x,z);
  const done=supported && feet.every(f=>f.stance) &&
    Math.abs(body.p[1]-supported.y-HEIGHT)<1e-6;
  Object.assign(w,body,{feet,speed:0,v:[0,(body.p[1]-y)*HZ,0],plan:null,phase:0,
    gait:done?'stance':'recovering',supportCount:feet.filter(f=>f.stance).length,
    blocked:!done,group:group??w.group});
}

export function stepWalker(w,field,throttle,steer){
  axis(throttle);axis(steer);
  const touching=w.feet.every(f=>{
    if(!f.stance)return true;
    const h=ground(field,f.p[0],f.p[2]);
    return usable(h) && Math.abs(f.p[1]-h.height)<1e-6;
  });
  const attached=settled(w.feet,w.group,w.p[0],w.p[2]) || settled(w.feet,1-w.group,w.p[0],w.p[2]);
  if(!touching || !attached || w.gait==='recovering'){stopWalker(w,field);return;}
  let plan=w.plan,speed=w.speed;
  if(!plan){
    speed+=clamp(4*throttle-speed,-1,1);
    if(speed===0 && steer===0){w.v=[0,0,0];w.blocked=false;w.speed=0;return;}
    plan=beginStride(w,field,speed,steer);
    if(!plan){w.speed=0;w.blocked=true;w.v=[0,0,0];return;}
  }
  const next=swingPose(w,field,plan);
  if(!next){stopWalker(w,field);w.blocked=true;return;}
  const complete=next.phase===BEAT;
  const v=scale(subtract(next.p,w.p),HZ);
  Object.assign(w,next,{v,speed,plan:complete?null:plan,phase:complete?0:next.phase,
    group:complete?1-w.group:w.group,steps:w.steps+Number(complete),
    supportCount:complete?6:3,gait:complete?'stance':'swing',blocked:false});
}
