import {bigBattle} from './big-battle.js';
import {COMBINED_LIMIT} from './combined-world.js';
import {MAX_ORDERS} from './command-world.js';
import {FORMATION_REPLAY_BYTES} from './formation-world.js';
import {EDGE} from './terrain.js';
import {OVERLORD_SOURCE} from './overlord-identity.js';
import {createIntelligence,sampleIntelligence} from './overlord-intel.js';
import {DOCTRINES,DECISION_PERIOD,decide,newController,newCrew} from './overlord-doctrine.js';
import {advanceOverlord} from './overlord-control.js';

export {DOCTRINES};
const tasks=['ADVANCE','COVER','FLANK','REGROUP'];
const bounded=(n,max)=>Number.isInteger(n) && n>=0 && n<=max;
const fields=['version','source','scenario','seed','roster','orders','ticks','stateHash','eventHash','outcome'];

function value(raw,key){
  const d=Object.getOwnPropertyDescriptor(raw,key);
  if(!d?.enumerable || !Object.hasOwn(d,'value'))throw TypeError('Expected data field '+key);
  return d.value;
}

function exact(raw,keys){
  if(!raw || Object.getPrototypeOf(raw)!==Object.prototype ||
     Reflect.ownKeys(raw).length!==keys.length)throw TypeError('Unexpected record fields');
  for(const k of keys)value(raw,k);
}

function instruction(w,raw,type){
  const isTask=type==='TASK';
  exact(raw,['tick','units','type','append',...(isTask?['task','x','z']:['doctrine'])]);
  if(w.status!=='active' || raw.tick!==w.tick || raw.append!==false ||
     w.orderLog.length>=MAX_ORDERS)throw RangeError('Invalid command boundary');
  const ids=raw.units;
  if(!Array.isArray(ids) || Object.getPrototypeOf(ids)!==Array.prototype || !ids.length ||
     ids.length>12 || Reflect.ownKeys(ids).length!==ids.length+1)throw RangeError('Invalid crew list');
  const units=[];
  for(let i=0;i<ids.length;i++){
    const id=value(ids,i);
    if(typeof id!=='string' || !Object.hasOwn(w.units,id) || units.includes(id) ||
       !w.actors.find(a=>a.id===id).hp)throw RangeError('Invalid friendly crew');
    units.push(id);
  }
  const accepted={tick:w.tick,units:Object.freeze(units.sort()),type,append:false};
  if(isTask){
    if(!tasks.includes(raw.task) || ![raw.x,raw.z].every(n=>Number.isFinite(n) && Math.abs(n)<=EDGE))
      throw RangeError('Invalid section task');
    Object.assign(accepted,{task:raw.task,x:raw.x||0,z:raw.z||0});
  }else{
    if(!DOCTRINES.includes(raw.doctrine))throw RangeError('Unknown doctrine');
    accepted.doctrine=raw.doctrine;
  }
  return Object.freeze(accepted);
}

export function makeOverlordScenario({id,source,groupPlan=null,beforeGroupStep=null}){
  function createWorld(pack){
    const w=bigBattle.createWorld(pack);
    w.scenario=id;
    w.tactical={crews:{},intel:createIntelligence(),decisions:0,decisionHash:2166136261};
    for(const a of w.actors)w.tactical.crews[a.id]=newCrew(a);
    sampleIntelligence(w,w.tactical.intel);
    return w;
  }

  function issueOrder(w,raw){
    if(!raw || Object.getPrototypeOf(raw)!==Object.prototype)throw TypeError('Expected order data');
    const type=value(raw,'type');
    if(type!=='DOCTRINE' && type!=='TASK'){
      const accepted=bigBattle.issueOrder(w,raw);
      for(const id of accepted.units){
        const crew=w.tactical.crews[id];
        crew.controller=newController();
        if(!accepted.append)crew.task=null;
      }
      return accepted;
    }
    if(type==='TASK' && !groupPlan)throw RangeError('Unsupported section task');
    const accepted=instruction(w,raw,type);
    if(type==='TASK')groupPlan(w,accepted);
    else for(const id of accepted.units){
      const a=w.actors.find(a=>a.id===id),crew=w.tactical.crews[id];
      crew.doctrine=accepted.doctrine;
      crew.station=[a.p[0],a.p[2]];
      crew.controller=newController();
      crew.decision=null;
    }
    w.orderLog.push(accepted);
    return accepted;
  }

  function step(w,measurement){
    if(w.status!=='active')return;
    const start=measurement?.onTactics?performance.now():0;
    beforeGroupStep?.(w);
    // Each of the 25 roster entries has one decision slot in a 50-tick round.
    const slot=w.tick%DECISION_PERIOD;
    if(slot%2===0){
      const a=w.actors[slot/2];
      if(a.hp)decide(w,a);
    }
    const decisionMs=measurement?.onTactics?performance.now()-start:0;
    advanceOverlord(w);
    const sampleStart=measurement?.onTactics?performance.now():0;
    sampleIntelligence(w,w.tactical.intel);
    if(measurement?.onTactics)measurement.onTactics(decisionMs+performance.now()-sampleStart);
  }

  function receipt(w){
    const {intel,...tactical}=w.tactical;
    // The last 32 display notifications per faction never influence a decision.
    const verifiedIntel={lastTick:intel.lastTick,evaluations:intel.evaluations,
      cobalt:{contacts:intel.cobalt.contacts},ember:{contacts:intel.ember.contacts}};
    const snapshot={...w,tactical:{...tactical,intel:verifiedIntel}};
    return {...bigBattle.receipt(snapshot),version:3,source,scenario:id};
  }

  function* rebuild(text){
    if(typeof text!=='string' || text.length>FORMATION_REPLAY_BYTES ||
       new TextEncoder().encode(text).length>FORMATION_REPLAY_BYTES)throw RangeError('Tactical recording too large');
    const r=JSON.parse(text);
    exact(r,fields);
    if(r.version!==3 || r.source!==source || r.scenario!==id || !bounded(r.seed,0xffffffff) ||
       !bounded(r.ticks,COMBINED_LIMIT) || !Array.isArray(r.orders) || r.orders.length>MAX_ORDERS ||
       !['active','victory','defeat'].includes(r.outcome) ||
       ![r.stateHash,r.eventHash].every(v=>typeof v==='string' && /^[0-9a-f]{8}$/.test(v)))
      throw RangeError('Invalid tactical recording');
    // Accept compact or indented JSON. Duplicate fields, alternate numeric
    // spellings and escaped aliases cannot describe a second command stream.
    const compact=text.replace(/"(?:[^"\\]|\\.)*"|[ \t\r\n]+/g, token=>token[0]==='"'?token:'');
    if(compact!==JSON.stringify(r))throw RangeError('Noncanonical tactical JSON');
    const w=createWorld({seed:r.seed});
    const roster=w.actors.map(({id,kind,faction})=>({id,kind,faction}));
    if(JSON.stringify(roster)!==JSON.stringify(r.roster))throw RangeError('Invalid tactical roster');
    let previous=0;
    for(const order of r.orders){
      if(!bounded(order?.tick,r.ticks) || order.tick<previous)throw RangeError('Invalid command tick');
      previous=order.tick;
    }
    let i=0;
    for(;;){
      while(r.orders[i]?.tick===w.tick){
        const raw=r.orders[i++],accepted=issueOrder(w,raw);
        if(accepted.units.some((u,j)=>u!==raw.units[j]))throw RangeError('Noncanonical crew IDs');
      }
      if(w.tick===r.ticks)break;
      if(w.status!=='active')throw RangeError('Replay exceeds operation');
      step(w);
      if(w.tick%32===0)yield w.tick;
    }
    const result=receipt(w);
    if(result.stateHash!==r.stateHash || result.eventHash!==r.eventHash || result.outcome!==r.outcome)
      throw Error('Tactical replay diverged');
    return w;
  }

  function replay(text){
    const gen=rebuild(text);
    let result;
    do{result=gen.next();}while(!result.done);
    return result.value;
  }

  async function openReplay(text,{signal,onProgress}={}){
    const gen=rebuild(text);
    for(;;){
      signal?.throwIfAborted();
      const start=performance.now();
      let result;
      do{
        result=gen.next();
        if(result.done)return result.value;
      }while(performance.now()-start<8);
      onProgress?.(result.value);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  return {createWorld,issueOrder,step,receipt,replay,openReplay};
}

export const doctrineScenario=makeOverlordScenario({id:'breakwater-doctrine-v1',source:OVERLORD_SOURCE});
