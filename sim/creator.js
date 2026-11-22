// Workshop v1 places two editable objectives on the accepted seeded coastal field.
import {BK,CLASSES,COMBINED_LIMIT,COMBINED_SEED,GATE_RADIUS,combinedReceipt,createCombinedWorld,
  stepCombined} from './combined-world.js';
import {COMBINED_SOURCE} from './combined-identity.js';
import {createVehicle} from './combined-vehicles.js';
import {EDGE} from './terrain.js';
import {HULL_HALF as SHIP_HALF} from './vessel.js';
import {CREATOR_SOURCE} from './creator-identity.js';

export {stepCombined as stepCreator};
export const MAX_PACK_BYTES=2048, MAX_REPLAY_BYTES=300000;
const commandMax=Object.values(BK).reduce((mask,bit)=>mask|bit,0);
const checkpointTicks=120;
const boundedInt=(n,min,max)=>Number.isInteger(n) && n>=min && n<=max;
const dimensions=['0','1'];
const packKeys=['version','title','seed','crew','gate','relay'];
const encoder=new TextEncoder();

function readJSON(text,limit,label){
  if(typeof text!=='string' || text.length>limit || encoder.encode(text).length>limit)
    throw RangeError(label+' exceeds its file limit');
  return JSON.parse(text);
}

function dataRecord(value,keys){
  if(!value || Object.getPrototypeOf(value)!==Object.prototype ||
      Reflect.ownKeys(value).length!==keys.length)throw TypeError('Unexpected record fields');
  const result={};
  for(const key of keys){
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d?.enumerable || !Object.hasOwn(d,'value'))throw TypeError('Expected data field '+key);
    result[key]=d.value;
  }
  return result;
}

function coordinatePair(pair,label){
  if(!Array.isArray(pair) || Object.getPrototypeOf(pair)!==Array.prototype ||
      pair.length!==2 || Reflect.ownKeys(pair).length!==3)throw TypeError(label+' needs two coordinates');
  return Object.freeze(dimensions.map(key=>{
    const d=Object.getOwnPropertyDescriptor(pair,key);
    if(!d?.enumerable || !Object.hasOwn(d,'value') || !boundedInt(d.value,-EDGE+GATE_RADIUS,EDGE-GATE_RADIUS))
      throw RangeError(label+' needs whole metres between −136 and 136');
    return d.value===0?0:d.value;
  }));
}

function parsePack(input){
  const raw=typeof input==='string'?readJSON(input,MAX_PACK_BYTES,'Mission pack'):input;
  const p=dataRecord(raw,packKeys);
  if(p.version!==1)throw RangeError('Unknown mission pack version');
  if(typeof p.title!=='string' || p.title.length>120)throw RangeError('Title must be 1–60 characters');
  const title=p.title.trim();
  if([...title].length>60 || !/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,!?()'’_&–—-]*$/u.test(title))
    throw RangeError('Use 1–60 letters, numbers, spaces or simple punctuation in the title');
  if(!boundedInt(p.seed,0,0xffffffff))throw RangeError('Seed must be an unsigned 32-bit integer');
  if(!CLASSES.includes(p.crew))throw RangeError('Unknown crew');
  return Object.freeze({version:1,title,seed:p.seed===0?0:p.seed,crew:p.crew,
    gate:coordinatePair(p.gate,'Gate'),relay:coordinatePair(p.relay,'Relay')});
}

export function defaultPack(crew='helicopter',seed=COMBINED_SEED){
  const w=createCombinedWorld({seed},crew);
  return parsePack({version:1,title:'Breakwater Study',seed,crew,
    gate:[w.beacon[0],w.beacon[2]],relay:[w.relay.p[0],w.relay.p[2]]});
}

// Clip each terrain triangle against the relay footprint. Heights on these
// planar pieces have extrema at rectangle corners, cell edges or the diagonal.
function relayFoundation(w,x,z){
  const [dx,,dz]=w.relay.half,field=w.field,s=field.cellSize;
  let low=Infinity,high=-Infinity;
  function sample(px,pz){
    const h=field.sample(px,pz).height;
    low=Math.min(low,h);high=Math.max(high,h);
  }
  const left=Math.floor((x-dx+EDGE)/s),right=Math.floor((x+dx+EDGE)/s);
  const top=Math.floor((z-dz+EDGE)/s),bottom=Math.floor((z+dz+EDGE)/s);
  for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++){
    const cx=col*s-EDGE,cz=row*s-EDGE;
    const west=Math.max(x-dx,cx),east=Math.min(x+dx,cx+s);
    const north=Math.max(z-dz,cz),south=Math.min(z+dz,cz+s);
    const diagonal=cx+cz+s;
    for(const px of [west,east]){
      sample(px,north);sample(px,south);
      const pz=diagonal-px;
      if(pz>north && pz<south)sample(px,pz);
    }
    for(const pz of [north,south]){
      const px=diagonal-pz;
      if(px>west && px<east)sample(px,pz);
    }
  }
  if(low<=w.water.level || high-low>w.relay.half[1])throw RangeError('Relay needs a dry, supported footprint');
}

// Each triangle's part above (or below) a flat surface is convex and contains
// at least one vertex on that side. Its passable edge vertices thus connect
// the corresponding landmass or channel without inventing a second height map.
function connectsToStart(w,gx,gz){
  if(w.selection==='helicopter')return true;
  const ship=w.selection==='ship',field=w.field,width=field.cellsX+1;
  const keel=w.player.p[1]-SHIP_HALF[1];
  const passable=height=>ship?height<keel:height>w.water.level;
  function vertices(x,z){
    const {cell,triangle}=field.sample(x,z);
    return field.triangleAt(...cell)[triangle].filter(v=>passable(v[1])).map(([px,,pz])=>
      (pz+EDGE)/field.cellSize*width+(px+EDGE)/field.cellSize);
  }
  const goals=vertices(gx,gz),start=vertices(w.player.p[0],w.player.p[2]);
  const visited=new Uint8Array(width*(field.cellsZ+1)),queue=start.slice();
  for(const index of start)visited[index]=1;
  const edges=[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
  for(let next=0;next<queue.length;next++){
    const i=queue[next],col=i%width,row=Math.floor(i/width);
    if(goals.includes(i))return true;
    for(const [dc,dr] of edges){
      const x=col+dc,z=row+dr,j=z*width+x;
      if(x<0 || x>=width || z<0 || z>field.cellsZ || visited[j])continue;
      visited[j]=1;
      if(passable(field.sample(x*field.cellSize-EDGE,z*field.cellSize-EDGE).height))queue.push(j);
    }
  }
  return false;
}

export function createCreatorWorld(input){
  const pack=parsePack(input);
  const w=createCombinedWorld({seed:pack.seed},pack.crew);
  const [rx,rz]=pack.relay,[gx,gz]=pack.gate;
  relayFoundation(w,rx,rz);
  // Ask the actual crew solver whether it can occupy the gate centre.
  try{createVehicle(w,pack.crew,'gate-probe','cobalt',gx,gz);}
  catch(error){throw RangeError('Gate cannot support this crew. '+error.message);}
  if(!connectsToStart(w,gx,gz))throw RangeError('Gate must share the deployment landmass or channel');
  if(Math.hypot(gx-rx,gz-rz)<GATE_RADIUS+3.5)throw RangeError('Keep the gate clear of the relay');
  for(const a of w.actors){
    if(a===w.relay)continue;
    // Five metres enclose the horizontal exclusion radius of each mobile unit.
    if(Math.hypot(a.p[0]-rx,a.p[2]-rz)<8.5)throw RangeError('Relay overlaps a deployment position');
    if(Math.hypot(a.p[0]-gx,a.p[2]-gz)<GATE_RADIUS+5)throw RangeError('Gate overlaps a deployment position');
  }
  const surface=Math.max(w.field.sample(gx,gz).height,w.water.heightAt(gx,gz));
  w.beacon=[gx,surface+(pack.crew==='helicopter'?w.offset+2.5:0),gz];
  w.relay.p=[rx,w.field.sample(rx,rz).height+w.relay.half[1],rz];
  w.mission='workshop';w.pack=pack;
  return w;
}

export function acceptPack(input){
  return createCreatorWorld(input).pack;
}

export function creatorReceipt(w){
  const {ticks,commands,stateHash,eventHash}=combinedReceipt(w);
  return {source:CREATOR_SOURCE,mission:'workshop',pack:w.pack,ticks,commands,stateHash,eventHash};
}

function recording(text,allowCombined){
  const input=readJSON(text,MAX_REPLAY_BYTES,'Replay');
  const legacy=allowCombined && input?.source===COMBINED_SOURCE;
  const fields=['source','mission','commands','ticks','stateHash','eventHash',...(legacy?['seed','selection']:['pack'])];
  const r=dataRecord(input,fields);
  if(legacy){
    if(r.mission!=='breakwater' || !CLASSES.includes(r.selection) || !boundedInt(r.seed,0,0xffffffff))
      throw RangeError('Invalid Breakwater recording');
  }else{
    if(r.source!==CREATOR_SOURCE || r.mission!=='workshop')throw RangeError('Unknown replay source or mission');
    r.pack=parsePack(r.pack);
  }
  if(!boundedInt(r.ticks,0,COMBINED_LIMIT) || !Array.isArray(r.commands) || r.commands.length>r.ticks ||
    ![r.stateHash,r.eventHash].every(h=>typeof h==='string' && /^[0-9a-f]{8}$/.test(h)))throw RangeError('Invalid replay header');
  let previousTick=-1,previousMask=-1;
  for(const pair of r.commands){
    if(!Array.isArray(pair) || pair.length!==2 || !boundedInt(pair[0],previousTick+1,r.ticks-1) ||
       !boundedInt(pair[1],0,commandMax) || pair[1]===previousMask)throw RangeError('Invalid replay commands');
    [previousTick,previousMask]=pair;Object.freeze(pair);
  }
  if(r.ticks && r.commands[0]?.[0]!==0)throw RangeError('Missing first command');
  Object.freeze(r.commands);
  return {r:Object.freeze(r),world:legacy?createCombinedWorld({seed:r.seed},r.selection):createCreatorWorld(r.pack),
    record:legacy?combinedReceipt:creatorReceipt};
}

function advanceWorld(world,commands,end){
  let i=world.commands.length,mask=world.lastCommand;
  while(world.tick<end){
    if(world.status!=='active')throw Error('Recording extends beyond the mission');
    if(commands[i]?.[0]===world.tick)mask=commands[i++][1];
    stepCombined(world,mask);
  }
  return world;
}

function verify(world,record,r){
  const result=record(world);
  if(result.ticks!==r.ticks || result.stateHash!==r.stateHash || result.eventHash!==r.eventHash)
    throw Error('Replay diverged in this runtime');
}

export function replayCreator(text){
  const {world,record,r}=recording(text,false);
  advanceWorld(world,r.commands,r.ticks);
  verify(world,record,r);
  return world;
}

export async function openReplay(text,{signal,onProgress}={}){
  signal?.throwIfAborted();
  const {world:initial,record,r}=recording(text,true);
  const {field,water,pack}=initial,checkpoints=[];
  // Native cloning preserves aliases between actors, player, relay and events.
  // Immutable geometry and the command ledger are shared across checkpoints.
  function capture(w){
    const state={...w,field:null,water:null,commands:null};
    if(pack)state.pack=null;
    checkpoints.push({state:structuredClone(state),commandCount:w.commands.length});
  }
  function restore(i){
    const {state,commandCount}=checkpoints[i],w=structuredClone(state);
    w.field=field;w.water=water;w.commands=r.commands.slice(0,commandCount);
    if(pack)w.pack=pack;
    return w;
  }
  capture(initial);
  while(initial.tick<r.ticks){
    signal?.throwIfAborted();
    const started=performance.now();
    do{
      advanceWorld(initial,r.commands,initial.tick+1);
      if(initial.tick%checkpointTicks===0)capture(initial);
    }while(initial.tick<r.ticks && performance.now()-started<8);
    onProgress?.(initial.tick,r.ticks);
    if(initial.tick<r.ticks)await new Promise(resolve=>setTimeout(resolve,0));
  }
  signal?.throwIfAborted();
  verify(initial,record,r);
  let current=restore(0);
  function seek(tick){
    if(!boundedInt(tick,0,r.ticks))throw RangeError('Seek beyond recording');
    const i=Math.floor(tick/checkpointTicks);
    if(tick<current.tick || current.tick<i*checkpointTicks)current=restore(i);
    return advanceWorld(current,r.commands,tick);
  }
  return Object.freeze({get world(){return current;},ticks:r.ticks,receipt:r,seek,
    advance(n=1){
      if(!Number.isSafeInteger(n) || n<0)throw RangeError('Invalid replay step count');
      return seek(Math.min(current.tick+n,r.ticks));
    }});
}
