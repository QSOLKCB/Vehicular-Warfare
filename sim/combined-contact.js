// All game pulses share the same segment, clock and ordering rules.
import {add,clamp,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {castMovingSegment} from '../vendor/vanillajs/modules/collision/index.js';
import {EDGE} from './terrain.js';
import {pulseSweep} from './tank-combat.js';
import {vehicleParts} from './combined-vehicles.js';

export function mixedContact(world,owner,from,delta,previous=world.actors){
  let fraction=1;
  for(const i of [0,2]){
    if(delta[i])fraction=Math.min(fraction,(Math.sign(delta[i])*EDGE-from[i])/delta[i]);
  }
  const end=add(from,scale(delta,fraction));
  for(const i of [0,2])end[i]=clamp(end[i],-EDGE,EDGE);
  const path=subtract(end,from);
  const rock=world.field.castSegment(from,path),sea=world.water.castSegment(from,path);
  let best=rock?{id:'terrain',time:rock.time*fraction,point:rock.point}:
    fraction<1?{id:'boundary',time:fraction,point:end}:null;
  if(sea && (!best || sea.time*fraction<best.time)){
    best={id:'water',time:sea.time*fraction,point:sea.point};
  }
  // Six game metres enclose all authored hit volumes regardless of orientation.
  // Only a segment overlapping the swept broad-phase box needs a detailed cast.
  const lo=from.map((v,i)=>Math.min(v,end[i])-6);
  const hi=from.map((v,i)=>Math.max(v,end[i])+6);
  for(let i=0;i<world.actors.length;i++){
    const a=world.actors[i],old=previous[i];
    if(!a.hp || a.id===owner ||
       a.p.some((v,k)=>(v<lo[k] && old.p[k]<lo[k]) || (v>hi[k] && old.p[k]>hi[k])))continue;
    if(a.kind==='tank'){
      const hit=pulseSweep(world.field,{p:from,step:delta},old,a);
      if(hit?.id===a.id && (!best || hit.time<best.time))best=hit;
      continue;
    }
    const parts=vehicleParts(a),prior=vehicleParts(old);
    const boxes=parts.map((part,j)=>{
      const start=prior[j];
      // The cutter's projected box changes with attitude. Keep both endpoint
      // extents during the translating sweep, including a shrinking side.
      const half=part.half.map((h,k)=>Math.max(start.half[k],h));
      return {id:part.name,box:{min:subtract(start.p,half),max:add(start.p,half)},
        displacement:subtract(part.p,start.p)};
    });
    const hit=castMovingSegment(from,delta,boxes);
    if(hit && hit.time<=fraction && (!best || hit.time<best.time)){
      best={id:a.id,component:hit.id,time:hit.time,point:hit.point};
    }
  }
  return best;
}
