// Opt-in War Room scenarios. Group destinations and routes are authoritative;
// camera selection, frame rate and drawing never enter the command stream.
import {COMBINED_LIMIT} from './combined-world.js';
import {commandContacts,resetCommandUnit,stepCommand} from './command-control.js';
import {commandReceipt,createCommandWorld,MAX_ORDERS,MAX_QUEUE} from './command-world.js';
import {EDGE} from './terrain.js';
import {formationSlots,planFormationRoute} from './formation-routes.js';
import {FORMATION_SOURCE} from './formation-identity.js';

export const FORMATION_SCENARIO='breakwater-formation-v1';
export const FORMATION_REPLAY_BYTES=1024*1024;
const commonKeys=['tick','type','append','units'];

function data(record,key){
  const d=Object.getOwnPropertyDescriptor(record,key);
  if(!d?.enumerable || !Object.hasOwn(d,'value'))throw TypeError('Expected data field '+key);
  return d.value;
}
function recordFields(object,keys){
  if(!object || Object.getPrototypeOf(object)!==Object.prototype ||
    Reflect.ownKeys(object).length!==keys.length)throw TypeError('Invalid record fields');
  for(const k of keys)data(object,k);
}
function validateOrder(w,raw,maxUnits){
  if(w.status!=='active' || w.tick>=COMBINED_LIMIT)throw RangeError('Mission has ended');
  if(w.orderLog.length>=MAX_ORDERS)throw RangeError('Mission order limit reached');
  if(!raw || Object.getPrototypeOf(raw)!==Object.prototype)throw TypeError('Expected order record');
  const type=data(raw,'type'),spatial=type==='MOVE'||type==='DEFEND';
  if(!spatial && type!=='HOLD' && type!=='ATTACK')throw RangeError('Unsupported order');
  recordFields(raw,commonKeys.concat(spatial?['x','z']:type==='ATTACK'?['target']:[]));
  if(raw.tick!==w.tick || typeof raw.append!=='boolean')throw RangeError('Invalid order boundary');
  const ids=raw.units;
  if(!Array.isArray(ids) || Object.getPrototypeOf(ids)!==Array.prototype || !ids.length ||
    ids.length>maxUnits || Reflect.ownKeys(ids).length!==ids.length+1)throw RangeError('Invalid crew group');
  const members=[];
  for(let i=0;i<ids.length;i++){
    const id=data(ids,i),actor=w.actors.find(a=>a.id===id);
    if(!actor?.hp || actor.faction!=='cobalt' || members.includes(id))throw RangeError('Invalid friendly crew');
    if(raw.append && w.units[id].queue.length>=MAX_QUEUE)throw RangeError('Waypoint queue full');
    members.push(id);
  }
  const order={tick:w.tick,units:Object.freeze(members.sort()),type,append:raw.append};
  if(spatial){
    if(![raw.x,raw.z].every(v=>Number.isFinite(v) && Math.abs(v)<=EDGE))throw RangeError('Destination outside the theatre');
    order.x=raw.x||0;order.z=raw.z||0;
  }else if(type==='ATTACK'){
    if(!commandContacts(w).includes(raw.target))throw RangeError('Target outside friendly contact');
    order.target=raw.target;
  }
  return Object.freeze(order);
}

function plan(w,a,order){
  const u=w.units[a.id],result=planFormationRoute(w,a,order.goal);
  w.navigation.plans++;
  w.navigation.visited+=result.visited;
  if(!result.points.length){
    u.queue.length=0;
    resetCommandUnit(u);
    u.status='blocked';
    u.lastResult={tick:w.tick+1,type:order.type,status:'blocked',reason:order.goal?'no traversable route':'no available formation slot',distance:null};
    return false;
  }
  order.route=result.points;
  [order.x,order.z]=order.route[0];
  return true;
}

export function stepFormation(w){
  if(w.status!=='active')return;
  const intermediate=[];
  for(const a of w.actors){
    const u=w.units[a.id],order=u?.queue[0];
    if(!a.hp || !order || !Object.hasOwn(order,'goal'))continue;
    // One fresh search can route around an ally who moved into this leg.
    if(order.route && !order.replanned && !u.onStation && u.progressTick!==null && w.tick-u.progressTick>=600){
      order.route=null;order.replanned=true;w.navigation.replans++;
      resetCommandUnit(u);
    }
    if(!order.route && !plan(w,a,order))continue;
    if(order.route.length>1)intermediate.push({a,u,order,priorResult:u.lastResult});
  }
  stepCommand(w);
  for(const {a,u,order,priorResult} of intermediate){
    if(!a.hp)continue;
    if(u.queue[0]===order){
      // DEFEND with no successor holds at a reached point. Release the crew
      // for the next leg while retaining DEFEND's usual engagement behaviour.
      if(!u.onStation)continue;
    }else{
      if(u.lastResult?.status!=='completed')continue;
      u.queue.unshift(order);
    }
    order.route.shift();
    [order.x,order.z]=order.route[0];
    resetCommandUnit(u);u.status='active';u.lastResult=priorResult;
  }
}

// A scenario supplies only its bounded roster and source identity. Every
// roster uses the same navigation, admission and reconstruction path.
export function makeFormationScenario({id,source,create,maxUnits}){
  function createWorld(pack){
    const w=create(pack);
    w.scenario=id;
    w.navigation={plans:0,visited:0,replans:0};
    return w;
  }
  function issueOrder(w,raw){
    const accepted=validateOrder(w,raw,maxUnits);
    const members=accepted.units.map(id=>w.actors.find(a=>a.id===id));
    const spatial=Object.hasOwn(accepted,'x');
    const slots=spatial?formationSlots(w,members,accepted.x,accepted.z):null;
    for(const a of members){
      const u=w.units[a.id],type=accepted.type;
      const order={type};
      if(spatial){
        order.goal=slots.get(a.id);
        [order.x,order.z]=order.goal??[accepted.x,accepted.z];
        order.route=null;order.replanned=false;
      }else if(type==='ATTACK')order.target=accepted.target;
      if(!accepted.append || !u.queue.length){u.queue.length=0;resetCommandUnit(u);u.status='active';}
      u.queue.push(order);
    }
    w.orderLog.push(accepted);
    return accepted;
  }
  function receipt(w){
    return {...commandReceipt(w),version:2,source,scenario:id};
  }
  function* rebuild(text){
    if(typeof text!=='string' || text.length>FORMATION_REPLAY_BYTES ||
      new TextEncoder().encode(text).length>FORMATION_REPLAY_BYTES)throw RangeError('Replay too large');
    const r=JSON.parse(text);
    recordFields(r,['version','source','scenario','seed','roster','orders','ticks','stateHash','eventHash','outcome']);
    if(r.version!==2 || r.source!==source || r.scenario!==id ||
      !Number.isInteger(r.ticks) || r.ticks<0 || r.ticks>COMBINED_LIMIT ||
      !Array.isArray(r.orders) || r.orders.length>MAX_ORDERS ||
      ![r.stateHash,r.eventHash].every(h=>typeof h==='string' && /^[0-9a-f]{8}$/.test(h)) ||
      !['active','victory','defeat'].includes(r.outcome))throw RangeError('Invalid formation recording');
    let previousTick=0;
    for(const order of r.orders){
      if(!Number.isInteger(order?.tick) || order.tick<previousTick || order.tick>r.ticks)throw RangeError('Invalid recorded order tick');
      previousTick=order.tick;
    }
    const w=createWorld({seed:r.seed});
    if(!Array.isArray(r.roster) || r.roster.length!==w.actors.length)throw RangeError('Unknown roster');
    for(const [i,a] of w.actors.entries()){
      const entry=r.roster[i];
      recordFields(entry,['id','kind','faction']);
      if(entry.id!==a.id || entry.kind!==a.kind || entry.faction!==a.faction)throw RangeError('Unknown roster member');
    }
    let i=0;
    for(;;){
      while(i<r.orders.length && r.orders[i]?.tick===w.tick){
        const raw=r.orders[i++],actual=issueOrder(w,raw);
        if(actual.units.some((u,j)=>u!==raw.units[j]))throw RangeError('Noncanonical crew order');
      }
      if(w.tick===r.ticks)break;
      if(w.status!=='active')throw RangeError('Replay exceeds mission duration');
      stepFormation(w);
      if(w.tick%32===0)yield w.tick;
    }
    const result=receipt(w);
    if(i!==r.orders.length || result.stateHash!==r.stateHash || result.eventHash!==r.eventHash ||
      result.outcome!==r.outcome)throw Error('Formation replay diverged');
    return w;
  }
  function replay(text){
    const run=rebuild(text);
    let result;
    do{result=run.next();}while(!result.done);
    return result.value;
  }
  async function openReplay(text,{signal,onProgress}={}){
    const run=rebuild(text);
    for(;;){
      signal?.throwIfAborted();
      const start=performance.now();
      let result;
      do{
        result=run.next();
        if(result.done)return result.value;
      }while(performance.now()-start<8);
      onProgress?.(result.value);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  return {createWorld,issueOrder,step:stepFormation,receipt,replay,openReplay};
}

export const formationScenario=makeFormationScenario({
  id:FORMATION_SCENARIO,source:FORMATION_SOURCE,create:createCommandWorld,maxUnits:4
});
export const {createWorld:createFormationWorld,issueOrder:issueFormationOrder,receipt:formationReceipt,
  replay:replayFormation,openReplay:openFormationReplay}=formationScenario;
