// The route follower and mounts send requests to the released Breakwater solvers.
import {advanceShots,canSee,damage,launch,train} from './combined-world.js';
import {driveVehicle,targetPoint} from './combined-vehicles.js';
import {finish,navigate,objective,resetCommandUnit,stop} from './command-control.js';
import {planFormationRoute} from './formation-routes.js';

const find=(w,id)=>w.actors.find(a=>a.id===id);

function leg(w,a,u,order){
  if(order.route && !order.replanned && !u.onStation && u.progressTick!==null && w.tick-u.progressTick>=600){
    order.route=null;order.replanned=true;w.navigation.replans++;
    resetCommandUnit(u);
  }
  if(!order.route){
    // The released planner uses mobile footprint radii. Keep the fixed relay
    // outside the friendly traffic list while the physical world retains it.
    const chart={field:w.field,water:w.water,actors:w.actors.filter(b=>b.faction===a.faction && b.kind!=='relay')};
    const result=planFormationRoute(chart,a,order.goal);
    w.navigation.plans++;w.navigation.visited+=result.visited;
    if(!result.points.length){
      finish(w,a,'blocked',order.goal?'no traversable route':'no available formation slot');
      return stop(w,a);
    }
    order.route=result.points;
    [order.x,order.z]=order.route[0];
  }
  if(u.started===null){u.started=w.tick;u.progressTick=w.tick;}
  const prior=u.lastResult,cmd=navigate(w,a,order,order.x,order.z);
  if(order.route.length>1 && (u.onStation || (prior!==u.lastResult && u.lastResult?.status==='completed'))){
    if(u.queue[0]!==order)u.queue.unshift(order);
    order.route.shift();[order.x,order.z]=order.route[0];
    u.lastResult=prior;resetCommandUnit(u);u.status='active';
  }
  return cmd;
}

function move(w,a,u,order){
  if(!order)return stop(w,a);
  if(u.started===null){u.started=w.tick;u.progressTick=w.tick;}
  if(order.type==='HOLD'){
    if(u.queue.length>1 && Math.hypot(a.v[0],a.v[2])<.65)finish(w,a,'completed','position held');
    return stop(w,a);
  }
  if(order.type==='ATTACK'){
    const target=find(w,order.target);
    // Explicit commands may use current crew-to-crew observations, as at
    // admission. Defer access to coordinates until a friendly actually sees it.
    if(!w.actors.some(b=>b.faction===a.faction && b.hp && canSee(w,b,target))){
      finish(w,a,'blocked','contact lost');return stop(w,a);
    }
    if(!a.ammo || w.tick-u.started>=5400){
      finish(w,a,'blocked',a.ammo?'engagement expired':'out of ammunition');
      return stop(w,a);
    }
    if(canSee(w,a,target))return stop(w,a);
    return navigate(w,a,order,target.p[0],target.p[2]);
  }
  return leg(w,a,u,order);
}

function mount(w,a,id){
  const target=id && find(w,id);
  if(!target || !canSee(w,a,target)){a.seen=0;a.target=null;return;}
  if(a.target!==id){a.target=id;a.seen=0;}
  a.seen=Math.min(100,a.seen+1);
  if(train(a,targetPoint(target)) && a.seen===100)launch(w,a);
}

export function advanceOverlord(w){
  w.tick++;
  const previous=w.actors.map(a=>({...a})),executing=[],watched=[];
  // The shared navigation routines use their world's units table. This
  // tick-local view maps each piece to its current controller, including Ember.
  const view=Object.create(w);
  view.units={};
  for(const [i,a] of w.actors.entries()){
    const crew=w.tactical.crews[a.id],human=w.units[a.id];
    const u=human?.queue.length?human:crew.controller;
    view.units[a.id]=u;
    if(!a.hp || a.kind==='relay')continue;
    const order=u.queue[0];
    crew.mask=move(view,a,u,order);
    executing[i]=order===u.queue[0]?order:null;
    const crash=driveVehicle(w,a,crew.mask,w.actors);
    if(crash)damage(w,a,a.hp,crash,null,a.p.slice());
  }
  for(const [i,order] of executing.entries()){
    if(order?.type==='ATTACK'){
      const target=find(w,order.target);
      if(w.actors.some(a=>a.faction==='cobalt' && a.hp && canSee(w,a,target)))watched[i]=target;
    }
  }
  advanceShots(w,previous);
  for(const [i,a] of w.actors.entries()){
    const crew=w.tactical.crews[a.id],order=executing[i];
    if(!a.hp){
      for(const u of [w.units[a.id],crew.controller]){
        if(!u)continue;
        view.units[a.id]=u;
        if(u.queue.length)finish(view,a,'cancelled','crew disabled');
        u.status='cancelled';
      }
      crew.mask=0;crew.task=null;
      continue;
    }
    if(order?.type==='ATTACK' && !watched[i]?.hp){
      finish(view,a,watched[i]?'completed':'blocked',watched[i]?'contact disabled':'contact lost');
      mount(w,a,null);
    }else{
      const id=order?.type==='ATTACK'?order.target:order?.type==='MOVE'?null:crew.decision?.contact;
      mount(w,a,id);
    }
  }
  objective(w);
}
