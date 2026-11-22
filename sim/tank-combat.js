// Cutbank's fictional pulse and four armour ratings use integer game points.
import {add, clamp, dot, scale, subtract} from '../vendor/vanillajs/modules/math/index.js';
import {castSegment} from '../vendor/vanillajs/modules/collision/index.js';
import {sight} from './terrain.js';
import {tankBasis,tankGun,HULL_HALF,TURRET_HALF} from './tracks.js';

export const ARENA_EDGE=144;
export const ARMOUR=Object.freeze({front:3,side:2,rear:1,top:0});
const boxes={};
for(const [name,half] of [['hull',HULL_HALF],['turret',TURRET_HALF]]){
  boxes[name]=[{id:name,box:{min:scale(half,-1),max:half}}];
}

const inArena=p=>Math.abs(p[0])<=ARENA_EDGE && Math.abs(p[2])<=ARENA_EDGE;
export function barrelClear(field,tank){
  const {pivot,muzzle}=tankGun(tank);
  if(!inArena(pivot) || !inArena(muzzle) || !sight(field,pivot,muzzle))return false;
  const hull=pose(tank,'hull'),a=local(pivot,hull),b=local(muzzle,hull);
  return castSegment(a,subtract(b,a),boxes.hull)===null;
}

export function componentSight(field,observer,target){
  const eye=tankGun(observer).pivot;
  const hullPoint=visiblePoint(field,eye,target,'hull');
  const turretPoint=visiblePoint(field,eye,target,'turret');
  return {hull:Boolean(hullPoint),turret:Boolean(turretPoint),point:turretPoint??hullPoint};
}

function visiblePoint(field,eye,target,name){
  const {center,right,up,forward}=pose(target,name);
  if(sight(field,eye,center))return center.slice();
  const half=boxes[name][0].box.max;
  // Centre then eight authored component corners, in stable order. Near
  // the arena boundary a rotated corner can fall outside the finite grid.
  for(const x of [-1,1])for(const y of [1,-1])for(const z of [1,-1]){
    const point=center.map((n,i)=>n+x*half[0]*right[i]+y*half[1]*up[i]+z*half[2]*forward[i]);
    if(inArena(point) && sight(field,eye,point))return point;
  }
  return null;
}

function pose(actor,name){
  if(name==='hull')return {center:actor.p,...tankBasis(actor)};
  const c=Math.cos(actor.turretYaw),s=Math.sin(actor.turretYaw);
  return {center:tankGun(actor).pivot,right:[c,0,s],up:[0,1,0],forward:[s,0,-c]};
}

function local(point,{center,right,up,forward}){
  const d=subtract(point,center);
  return [dot(d,right),dot(d,up),dot(d,forward)];
}

// A closed segment is linear between its two component-local endpoints.
// Translation is swept exactly. Rotation during a tick is a chord in the
// rotating frame, a bounded small-angle approximation at 120 Hz.
export function pulseSweep(field,shot,previous,target){
  const from=shot.p,delta=shot.step;
  let fraction=1;
  for(const axis of [0,2]){
    if(delta[axis]!==0){
      const border=Math.sign(delta[axis])*ARENA_EDGE;
      fraction=Math.min(fraction,(border-from[axis])/delta[axis]);
    }
  }
  const end=add(from,scale(delta,fraction));
  for(const axis of [0,2])end[axis]=clamp(end[axis],-ARENA_EDGE,ARENA_EDGE);
  const terrain=field.castSegment(from,subtract(end,from));
  let best=terrain ? {id:'terrain',time:terrain.time*fraction,point:terrain.point} :
    fraction<1 ? {id:'boundary',time:fraction,point:end} : null;

  if(!target.hp)return best;
  const fullEnd=add(from,delta);
  for(const name of ['hull','turret']){
    const a=local(from,pose(previous,name)), b=local(fullEnd,pose(target,name));
    const d=subtract(b,a);
    const hit=castSegment(a,d,boxes[name]);
    if(!hit || hit.time>fraction || (best && hit.time>=best.time))continue;
    // A start inside the volume has no entering plane. Use the dominant
    // incoming axis for that one case, with deterministic axis ties.
    const n=hit.normal.slice();
    if(hit.startedInside){
      const axis=d.reduce((largest,v,i)=>Math.abs(v)>Math.abs(d[largest])?i:largest,0);
      n[axis]=-Math.sign(d[axis]);
    }
    const plate=n[1]>0?'top':n[2]>0?'front':n[2]<0?'rear':'side';
    best={id:target.id,component:name,plate,time:hit.time,point:add(from,scale(delta,hit.time))};
  }
  return best;
}
