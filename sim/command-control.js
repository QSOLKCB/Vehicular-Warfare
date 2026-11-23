// The command scenario drives the original Breakwater pieces in fixed roster order.
import {BK,driveVehicle,targetPoint} from './combined-vehicles.js';
import {COMBINED_LIMIT,GATE_RADIUS,REQUIRED_DEFENDERS,advanceShots,canSee,cpu,cpuMotion,
  damage,emit,launch,train} from './combined-world.js';
import {HZ} from './clock.js';
import {EDGE,HULL_HALF_HEIGHT} from './terrain.js';

export const ARRIVAL_RADIUS=3, DEFEND_RADIUS=8;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const button=(value,deadband,positive,negative)=>value>deadband?positive:value< -deadband?negative:0;
const cobalt=a=>a.faction==='cobalt';
const distance=(a,x,z)=>Math.hypot(a.p[0]-x,a.p[2]-z);
const horizontalSpeed=a=>Math.hypot(a.v[0],a.v[2]);

// queue[0] controls the next movement step. lastResult survives a queued transition.
export function resetCommandUnit(unit){
  Object.assign(unit,{distance:null,best:null,started:null,progressTick:null,onStation:false});
}

export function initializeCommand(w){
  w.mission='war-room';
  w.units={};
  for(const a of w.actors.filter(cobalt)){
    const unit={queue:[],status:'idle',lastResult:null};
    resetCommandUnit(unit);
    w.units[a.id]=unit;
  }
  return w;
}

function observed(w,target){
  return w.actors.some(a=>cobalt(a) && a.hp && canSee(w,a,target));
}

export function commandContacts(w){
  return w.actors.filter(t=>!cobalt(t) && observed(w,t)).map(t=>t.id);
}

function finish(w,a,status,reason){
  const u=w.units[a.id],order=u.queue.shift();
  u.lastResult={tick:w.tick,type:order.type,status,reason,distance:u.distance};
  // A failed leg invalidates subsequent waypoints along that route.
  if(status!=='completed')u.queue.length=0;
  const terminalDistance=u.distance;
  resetCommandUnit(u);
  u.status=u.queue.length?'active':status;
  if(!u.queue.length)u.distance=terminalDistance;
}

function flightMask(w,a,dx,dz){
  const look=(p,v)=>Math.max(-EDGE,Math.min(EDGE,p+v*.9));
  const x=look(a.p[0],a.v[0]),z=look(a.p[2],a.v[2]);
  const floor=Math.max(w.field.sample(x,z).height+w.offset,w.water.level+HULL_HALF_HEIGHT);
  const dy=floor+4-a.p[1]-.8*a.v[1];
  const s=Math.sin(a.yaw),c=Math.cos(a.yaw);
  dx-=1.15*a.v[0]; dz-=1.15*a.v[2];
  return button(dx*s-dz*c,.55,BK.forward,BK.back) |
    button(dx*c+dz*s,.55,BK.strafeRight,BK.strafeLeft) | button(dy,.45,BK.up,BK.down);
}

function stop(w,a){
  if(a.kind==='helicopter')return flightMask(w,a,0,0);
  if(a.kind==='tank')return BK.brake;
  if(a.kind==='ship')return button(-a.speed,.05,BK.forward,BK.back);
  return 0;
}

function steer(w,a,x,z,d){
  if(a.kind==='helicopter')return flightMask(w,a,x-a.p[0],z-a.p[2]);
  let error=wrap(Math.atan2(x-a.p[0],a.p[2]-z)-a.yaw);
  if(a.kind==='ship'){
    // Reverse into a destination astern, reversing rudder sense with headway.
    const astern=Math.abs(error)>Math.PI*.65;
    if(astern)error=wrap(error+Math.PI);
    const turn=button((error-.5*a.yawRate)*(astern?-1:1),.05,BK.right,BK.left);
    const desired=Math.min(Math.abs(error)>.4?2.5:6,Math.max(.7,d*.35))*(astern?-1:1);
    return turn|button(desired-a.speed,.2,BK.forward,BK.back);
  }
  if(a.kind==='tank'){
    const rotation=(a.leftSpeed-a.rightSpeed)/2.7;
    if(Math.abs(error)>.35 && Math.abs(a.speed)>2)return BK.brake;
    const turn=button(error-.26*rotation,.07,BK.right,BK.left);
    if(Math.abs(error)>.30)return turn;
    if(a.speed*a.speed>28*Math.max(1,d-1))return BK.brake;
    return BK.forward|turn;
  }
  return button(error,.10,BK.right,BK.left)|(Math.abs(error)<.5?BK.forward:0);
}

function navigate(w,a,order,x,z){
  const u=w.units[a.id],d=distance(a,x,z);
  u.distance=d;
  if(u.best===null || d<u.best-.35){u.best=d;u.progressTick=w.tick;}
  const radius=order.type==='DEFEND' && u.onStation?DEFEND_RADIUS:ARRIVAL_RADIUS;
  if(!u.onStation && (w.tick-u.progressTick>=7*HZ || w.tick-u.started>=90*HZ)){
    finish(w,a,'blocked',a.grounded?'cutter grounded':'no direct route');
    return stop(w,a);
  }
  if(d<=radius){
    if(horizontalSpeed(a)<.65 && (a.kind!=='mech' || a.gait==='stance') && !a.grounded){
      if(order.type==='MOVE' || (order.type==='DEFEND' && u.queue.length>1)){
        finish(w,a,'completed','destination reached');
      }else{
        u.onStation=true;
        u.progressTick=w.tick;
      }
    }
    return stop(w,a);
  }
  if(u.onStation){
    u.onStation=false;u.started=w.tick;u.progressTick=w.tick;u.best=d;
  }
  return steer(w,a,x,z,d);
}

function motion(w,a){
  const u=w.units[a.id],order=u.queue[0];
  if(!order)return stop(w,a);
  if(u.started===null){u.started=w.tick;u.progressTick=w.tick;}
  if(order.type==='HOLD'){
    if(u.queue.length>1 && horizontalSpeed(a)<.65)finish(w,a,'completed','position held');
    return stop(w,a);
  }
  if(order.type==='ATTACK'){
    const target=w.actors.find(b=>b.id===order.target);
    if(!observed(w,target)){
      finish(w,a,'blocked','contact lost');return stop(w,a);
    }
    u.distance=distance(a,target.p[0],target.p[2]);
    if(!a.ammo || w.tick-u.started>=45*HZ){
      finish(w,a,'blocked',a.ammo?'engagement expired':'out of ammunition');
      return stop(w,a);
    }
    if(canSee(w,a,target))return stop(w,a);
    return navigate(w,a,order,target.p[0],target.p[2]);
  }
  return navigate(w,a,order,order.x,order.z);
}

function engage(w,a,index,order){
  if(order?.type==='MOVE'){a.target=null;a.seen=0;return;}
  if(order?.type!=='ATTACK'){cpu(w,a,index);return;}
  const target=w.actors.find(b=>b.id===order.target);
  if(!canSee(w,a,target)){
    a.target=null;a.seen=0;
    return;
  }
  if(a.target!==target.id){a.target=target.id;a.seen=0;}
  a.seen=Math.min(100,a.seen+1);
  if(train(a,targetPoint(target)) && a.seen===100)launch(w,a);
}

function objective(w){
  const survivors=w.actors.filter(a=>cobalt(a) && a.hp);
  if(!w.captured && !w.relay.hp){
    const point=w.beacon;
    const holder=survivors.find(a=>distance(a,point[0],point[2])<=GATE_RADIUS &&
      (a.kind!=='helicopter' || Math.abs(a.p[1]-point[1])<10) &&
      !a.grounded && a.gait!=='recovering');
    if(holder){
      w.captured=true;w.score+=50;
      emit(w,'beacon',{source:holder.id,point:point.slice()});
    }
  }
  if(!survivors.length)w.reason='all crews disabled';
  else if(w.captured && w.mobileKills>=REQUIRED_DEFENDERS)w.reason='crossing secured';
  else if(w.tick>=COMBINED_LIMIT)w.reason='command time expired';
  if(w.reason){
    w.status=w.reason==='crossing secured'?'victory':'defeat';
    emit(w,'outcome',{status:w.status,reason:w.reason,score:w.score});
  }
}

export function stepCommand(w){
  if(w.status!=='active')return;
  w.tick++;
  const previous=w.actors.map(a=>({...a}));
  const executing=[];
  for(const [i,a] of w.actors.entries()){
    if(!a.hp || a.kind==='relay')continue;
    const unit=w.units[a.id];
    // Use the same order in both phases. A queued successor begins next tick.
    const order=unit?.queue[0];
    const cmd=unit?motion(w,a):cpuMotion(w,a,i);
    executing[i]=order===unit?.queue[0]?order:null;
    const crash=driveVehicle(w,a,cmd,w.actors);
    if(crash)damage(w,a,a.hp,crash,null,a.p.slice());
  }
  // Only report a confirmed kill if the designated contact was observable
  // immediately before the shared impact ledger resolved the shot.
  const watched=executing.map(order=>{
    if(order?.type!=='ATTACK')return null;
    const t=w.actors.find(b=>b.id===order.target);
    return observed(w,t)?t:null;
  });
  advanceShots(w,previous);
  for(const [i,a] of w.actors.entries()){
    const unit=w.units[a.id];
    if(!a.hp){
      if(unit?.queue.length)finish(w,a,'cancelled','crew disabled');
      if(unit)unit.status='cancelled';
      continue;
    }
    if(!unit){cpu(w,a,i);continue;}
    if(watched[i] && !watched[i].hp){
      finish(w,a,'completed','contact disabled');
      a.target=null;a.seen=0;
    }else if(executing[i]?.type==='ATTACK' && !watched[i]){
      finish(w,a,'blocked','contact lost');
      a.target=null;a.seen=0;
    }else engage(w,a,i,executing[i]);
  }
  objective(w);
}

// Shared movement and mission rules for the separately versioned doctrine game.
export {finish,navigate,objective,stop};
