// Navigation for the square Breakwater game board. Only friendly bodies enter the
// planning map. Unobserved contacts can still physically obstruct a moving unit.
import {EDGE} from './terrain.js';

const CELL = 6, SIDE = 47, ORIGIN = -138;
export const MAX_VISITS = SIDE * SIDE, SLOT_SPACING = 12;
const radius = {helicopter:2.8, tank:2.7, mech:3.35, ship:4.6};
const charts = new WeakMap();
const axial = [[0,-1],[-1,0],[1,0],[0,1]];
const worldPoint = i => [ORIGIN + CELL*(i % SIDE), ORIGIN + CELL*Math.floor(i/SIDE)];
const nearest = v => Math.min(SIDE-1,Math.max(0,Math.round((v-ORIGIN)/CELL)));

function terrainAllows(w,kind,x,z){
  const pad=radius[kind];
  if(Math.abs(x)+pad>=EDGE || Math.abs(z)+pad>=EDGE)return false;
  if(kind==='helicopter')return true;
  for(const [dx,dz] of [[0,0],[-pad,0],[pad,0],[0,-pad],[0,pad]]){
    const q=w.field.sample(x+dx,z+dz),depth=w.water.level-q.height;
    if(kind==='ship' ? depth<1.2 : depth>=0 || q.normal[1]<.76)return false;
  }
  return true;
}

// Each seed's field is immutable. Cache the five-sample terrain test on an
// integer metre lattice, including the exact sub-metre destination separately.
function terrainProbe(w,kind){
  let layers=charts.get(w.field);
  if(!layers){layers={};charts.set(w.field,layers);}
  const width=2*EDGE+1;
  const values=layers[kind]??=new Uint8Array(width*width);
  return (x,z)=>{
    const ix=Math.round(x),iz=Math.round(z);
    if(Math.abs(ix)>EDGE || Math.abs(iz)>EDGE)return false;
    const i=(iz+EDGE)*width+ix+EDGE;
    if(!values[i])values[i]=terrainAllows(w,kind,ix,iz)?1:2;
    return values[i]===1;
  };
}

function friendlyObstacles(w,actor){
  return w.actors.filter(a=>a.faction===actor.faction && a.hp && a!==actor &&
    (actor.kind==='helicopter')===(a.kind==='helicopter')).map(a=>({
    x:a.p[0], z:a.p[2], distance:radius[a.kind]+radius[actor.kind]+1
  }));
}

function freePoint(w,actor){
  const terrain=terrainProbe(w,actor.kind),obstacles=friendlyObstacles(w,actor);
  return (x,z)=>terrain(x,z) && obstacles.every(o=>(x-o.x)**2+(z-o.z)**2>=o.distance**2);
}

function clearLeg(free,from,to){
  const count=Math.max(1,Math.ceil(Math.hypot(to[0]-from[0],to[1]-from[1])/2));
  for(let i=1;i<=count;i++){
    const t=i/count;
    if(!free(from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t))return false;
  }
  return true;
}

const offsets=[];
for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
  offsets.push([dx*SLOT_SPACING,dz*SLOT_SPACING]);
}

// Reserve the most constrained domains first. Within a domain the crew closest
// to the anchor chooses first, with stable ID tie breaks. Click order is irrelevant.
export function formationSlots(w,actors,x,z){
  const distance=a=>(a.p[0]-x)**2+(a.p[2]-z)**2;
  const priority={ship:0,mech:1,tank:1,helicopter:2};
  const ranked=actors.slice().sort((a,b)=>priority[a.kind]-priority[b.kind] ||
    distance(a)-distance(b) || (a.id<b.id?-1:1));
  const slots=new Map(),used=new Set();
  for(const a of ranked){
    if(actors.length===1){slots.set(a.id,[x,z]);break;}
    const free=freePoint(w,a);
    let best=-1,score=Infinity;
    for(let i=0;i<offsets.length;i++){
      if(used.has(i))continue;
      const [dx,dz]=offsets[i],sx=x+dx,sz=z+dz;
      // Prefer the closest ring of slots, then the shortest approach.
      const cost=(dx*dx+dz*dz)*1e5+(a.p[0]-sx)**2+(a.p[2]-sz)**2;
      if(cost>=score || !free(sx,sz))continue;
      best=i;score=cost;
    }
    if(best<0){slots.set(a.id,null);continue;}
    used.add(best);slots.set(a.id,[x+offsets[best][0],z+offsets[best][1]]);
  }
  return slots;
}

// Breadth-first search has a fixed neighbour order. Connect endpoints to nearby
// grid centres through clear segments, then remove turns with clear sight along
// the sampled travel surface. The vehicle solver checks every accepted tick.
export function planFormationRoute(w,a,goal){
  const free=freePoint(w,a),from=[a.p[0],a.p[2]];
  if(!goal || !terrainAllows(w,a.kind,...goal) || !free(...goal))return {points:[],visited:0};
  if(clearLeg(free,from,goal))return {points:[goal],visited:0};
  const parent=new Int16Array(MAX_VISITS).fill(-2),fifo=new Int16Array(MAX_VISITS);
  let count=0,read=0,finish=-1;
  const sx=nearest(from[0]),sz=nearest(from[1]);
  for(let z=Math.max(0,sz-1);z<=Math.min(SIDE-1,sz+1);z++){
    for(let x=Math.max(0,sx-1);x<=Math.min(SIDE-1,sx+1);x++){
      const i=z*SIDE+x;
      if(clearLeg(free,from,worldPoint(i))){parent[i]=-1;fifo[count++]=i;}
    }
  }
  while(read<count){
    const i=fifo[read++],p=worldPoint(i);
    if(Math.hypot(p[0]-goal[0],p[1]-goal[1])<=CELL*1.6 && clearLeg(free,p,goal)){finish=i;break;}
    for(const [dx,dz] of axial){
      const x=i%SIDE+dx,z=Math.floor(i/SIDE)+dz,j=z*SIDE+x;
      if(x<0 || x>=SIDE || z<0 || z>=SIDE || parent[j]!==-2)continue;
      if(clearLeg(free,p,worldPoint(j))){parent[j]=i;fifo[count++]=j;}
    }
  }
  if(finish<0)return {points:[],visited:read};
  const chain=[goal];
  for(let i=finish;i!==-1;i=parent[i])chain.push(worldPoint(i));
  chain.reverse();
  const points=[];
  let origin=from;
  for(let i=0;i<chain.length;){
    // Only inspect consecutive shortcut candidates. The total number of
    // shortcut tests is bounded by twice the length of the grid chain.
    let last=i;
    while(last+1<chain.length && clearLeg(free,origin,chain[last+1]))last++;
    points.push(chain[last]);origin=chain[last];i=last+1;
  }
  return {points,visited:read};
}
