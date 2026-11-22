// Breakwater Reach. All mobile pieces use the same theatre and ordered game ledger.
import {add,clamp,dot,normalize,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {HZ} from './clock.js';
import {missionSeed,sight} from './terrain.js';
import {ARMOUR} from './tank-combat.js';
import {receipt} from './world.js';
import {createEstuary} from './estuary.js';
import {BK,CLASSES,createVehicle,driveVehicle,aimVehicle,vehicleGun,targetPoint,gunClear} from './combined-vehicles.js';
import {mixedContact} from './combined-contact.js';
import {COMBINED_SOURCE} from './combined-identity.js';

export {BK,CLASSES};
export const COMBINED_SEED=2505, COMBINED_LIMIT=120*HZ, GATE_RADIUS=8, REQUIRED_DEFENDERS=2;
export const MAX_PULSES=32;
const commandMax=Object.values(BK).reduce((a,b)=>a|b,0);
const life=3*HZ, sensorRange=100;
const speeds={helicopter:68,tank:50,mech:48,ship:50,relay:45};
const delays={helicopter:52,tank:70,mech:52,ship:50,relay:105};
const integer=(v,max)=>Number.isInteger(v) && v>=0 && v<=max;
const byId=(w,id)=>w.actors.find(a=>a.id===id);

function emit(w,type,detail){
  const event={tick:w.tick,type,...detail};
  for(const c of JSON.stringify(event))w.eventHash=Math.imul(w.eventHash^c.charCodeAt(0),16777619)>>>0;
  if(w.events.length===96)w.events.shift();
  w.events.push(event);
}

export function createCombinedWorld(pack={seed:COMBINED_SEED},selection='helicopter'){
  const seed=missionSeed(pack);
  if(!CLASSES.includes(selection))throw RangeError('unknown vehicle selection');
  const theatre=createEstuary(seed),actors=[];
  const w={mission:'breakwater',selection,seed,field:theatre.field,water:theatre.water,offset:theatre.offset,actors,
    beacon:theatre.gates[selection].slice(),captured:false,supplies:120,serviceReady:0,mobileKills:0,tick:0,status:'active',reason:'',score:0,
    shots:[],serial:0,events:[],eventHash:2166136261,commands:[],lastCommand:-1};
  for(const faction of ['cobalt','ember'])for(const kind of CLASSES){
    const [x,z,yaw]=(faction==='cobalt'?theatre.spawns:theatre.opponents)[kind];
    const actor=createVehicle(w,kind,faction+'-'+kind,faction,x,z,yaw);
    const hp=faction==='ember'?120:100;
    Object.assign(actor,{home:[x,z],target:null,seen:0,ammo:36,ready:0,hp,maxHp:hp});
    actors.push(actor);
  }
  const [x,z]=theatre.relay;
  const relay={id:'relay',faction:'ember',kind:'relay',p:[x,w.field.sample(x,z).height+3.2,z],v:[0,0,0],
    half:[2.4,3.2,2.4],yaw:Math.PI,mountYaw:Math.PI,elevation:0,maxHp:80,hp:80,ammo:45,ready:0,target:null,seen:0};
  actors.push(relay);
  w.relay=relay;w.player=byId(w,'cobalt-'+selection);
  return w;
}

function canSee(w,actor,target){
  if(!target?.hp || actor.faction===target.faction)return false;
  const eye=vehicleGun(actor).pivot,point=targetPoint(target);
  return Math.hypot(...subtract(point,eye))<=sensorRange && sight(w.field,eye,point) &&
    !w.water.castSegment(eye,subtract(point,eye));
}

function choose(w,actor){
  let target=null,best=Infinity;
  for(const a of w.actors){
    if(!a.hp || a.faction===actor.faction)continue;
    const d=Math.hypot(...subtract(a.p,actor.p));
    if(d<best && canSee(w,actor,a)){best=d;target=a;}
  }
  return target;
}

function train(actor,point){
  const gun=vehicleGun(actor),dir=normalize(subtract(point,gun.pivot));
  const bearing=Math.atan2(gun.direction[0],-gun.direction[2]),tilt=Math.asin(clamp(gun.direction[1],-1,1));
  const yaw=Math.atan2(dir[0],-dir[2])-bearing;
  const turn=clamp(Math.atan2(Math.sin(yaw),Math.cos(yaw))*80,-1,1);
  const lift=clamp((Math.asin(clamp(dir[1],-1,1))-tilt)*100,-1,1);
  aimVehicle(actor,turn,lift);
  return dot(vehicleGun(actor).direction,dir)>.998;
}

function cpuMotion(w,a,index){
  if(a.kind==='relay')return 0;
  const phase=(Math.floor(w.tick/420)+index)%2===0?1:-1;
  const goal=a.home[1]+phase*(a.kind==='ship'?6:4);
  if(a.kind==='helicopter'){
    // The flight lead runs a short hover survey. Local translation commands
    // carry the aircraft back towards its survey station as the nose slews.
    const dx=a.home[0]-a.p[0]-.9*a.v[0],dz=goal-a.p[2]-.9*a.v[2];
    const forward=dx*Math.sin(a.yaw)-dz*Math.cos(a.yaw),side=dx*Math.cos(a.yaw)+dz*Math.sin(a.yaw);
    const height=w.field.sample(a.home[0],a.home[1]).height+w.offset+3+phase*.8;
    const dy=height-a.p[1]-.75*a.v[1];
    return (forward>.8?BK.forward:forward<-.8?BK.back:0)|
      (side>.8?BK.strafeRight:side<-.8?BK.strafeLeft:0)|(dy>.4?BK.up:dy<-.4?BK.down:0);
  }
  // Each family's drive adapter consumes the command with its own inertia,
  // turn geometry, feet or rudder. Patrol centres stay in the authored lane.
  const travel=(a.p[2]-goal+.8*a.v[2])*Math.cos(a.yaw);
  return travel>1?BK.forward:travel< -1?BK.back:0;
}

function clearMount(w,a,gun){
  return gunClear(w,a) && !mixedContact(w,a.id,gun.pivot,subtract(gun.muzzle,gun.pivot));
}

function launch(w,a){
  if(!a.ammo || w.tick<a.ready || w.shots.length>=MAX_PULSES)return;
  const gun=vehicleGun(a);
  if(!clearMount(w,a,gun)){a.ready=w.tick+12;emit(w,'blocked',{source:a.id,point:gun.muzzle});return;}
  const id=++w.serial;
  w.shots.push({id,owner:a.id,faction:a.faction,p:gun.muzzle,prev:gun.muzzle,
    v:scale(gun.direction,speeds[a.kind]),gravity:a.kind==='ship'?3:0,life});
  a.ammo--;a.ready=w.tick+delays[a.kind]+(a===w.player?0:a.faction==='ember'?240:115);
  emit(w,'launch',{owner:a.id,shot:id,point:gun.muzzle});
}

function damage(w,a,amount,source,shot,point,extra={}){
  a.hp=Math.max(0,a.hp-amount);
  emit(w,'damage',{source,shot,target:a.id,amount,hp:a.hp,point,...extra});
  if(!a.hp){
    a.target=null;a.seen=0;
    if(a.faction==='ember'){
      w.score+=100;
      if(a.kind!=='relay')w.mobileKills++;
    }
    emit(w,'destroy',{source,shot,target:a.id,point:a.p.slice()});
  }
}

function advanceShots(w,previous){
  for(let i=0;i<w.shots.length;){
    const s=w.shots[i],delta=scale(s.v,1/HZ);
    delta[1]-=s.gravity/(2*HZ*HZ);
    const hit=mixedContact(w,s.owner,s.p,delta,previous);
    if(hit){
      const a=byId(w,hit.id);
      emit(w,'impact',{source:s.owner,shot:s.id,target:hit.id,component:hit.component??null,point:hit.point});
      if(a?.hp && a.faction!==s.faction){
        const amount=hit.plate?10*(5-ARMOUR[hit.plate]):20;
        damage(w,a,amount,s.owner,s.id,hit.point,{component:hit.component,plate:hit.plate??null});
      }
    }
    if(hit || --s.life===0){w.shots.splice(i,1);continue;}
    s.prev=s.p;s.p=add(s.p,delta);s.v[1]-=s.gravity/HZ;i++;
  }
}

function cpu(w,a,index){
  let target=byId(w,a.target);
  if(!canSee(w,a,target)){target=null;a.seen=0;a.target=null;}
  if((w.tick+index)%16===0){
    const next=choose(w,a);
    if(next!==target)a.seen=0;
    target=next;a.target=next?.id??null;
  }
  if(!target)return;
  a.seen=Math.min(100,a.seen+1);
  if(train(a,targetPoint(target)) && a.seen===100)launch(w,a);
}

// The player's single trigger can slew a mount toward a visible game piece
// already within its forward cone. Manual input retains control of the mount.
function focus(w,a){
  const gun=vehicleGun(a);
  let target=null,best=.8;
  for(const t of w.actors){
    if(!t.hp || t.faction===a.faction)continue;
    const direction=normalize(subtract(targetPoint(t),gun.pivot)),alignment=dot(gun.direction,direction);
    if(alignment<=.8 || !canSee(w,a,t))continue;
    if(t===w.relay)return t;
    if(alignment>best){best=alignment;target=t;}
  }
  return target;
}

export function sightCombined(w){
  const a=w.player,gun=vehicleGun(a),ray=scale(gun.direction,sensorRange),clear=clearMount(w,a,gun);
  const hit=clear?mixedContact(w,a.id,gun.muzzle,ray):null;
  return {clear,point:clear?(hit?.point??add(gun.muzzle,ray)):gun.muzzle,
    target:byId(w,hit?.id)?.id??null,visible:w.actors.filter(t=>canSee(w,a,t)).map(t=>t.id)};
}

export function stepCombined(w,cmd=0){
  if(!integer(cmd,commandMax))throw RangeError('invalid combined controls');
  if(w.status!=='active')return;
  if(w.lastCommand!==cmd){w.commands.push([w.tick,cmd]);w.lastCommand=cmd;}
  w.tick++;
  const previous=w.actors.map(a=>({...a}));
  for(let i=0;i<w.actors.length;i++){
    const a=w.actors[i];
    if(!a.hp || a.kind==='relay')continue;
    const crash=driveVehicle(w,a,a===w.player?cmd:cpuMotion(w,a,i),w.actors);
    if(crash)damage(w,a,a.hp,crash,null,a.p.slice());
  }
  advanceShots(w,previous);
  for(let i=0;i<w.actors.length;i++){
    const a=w.actors[i];if(!a.hp)continue;
    if(a!==w.player){cpu(w,a,i);continue;}
    if(!(cmd&BK.fire))continue;
    if(!(cmd&(BK.aimLeft|BK.aimRight|BK.elevate|BK.depress|BK.left|BK.right))){
      const target=focus(w,a);
      if(target)train(a,targetPoint(target));
    }
    launch(w,a);
  }
  const p=w.player,gate=w.beacon;
  const inGate=Math.hypot(p.p[0]-gate[0],p.p[2]-gate[2])<=GATE_RADIUS &&
    (p.kind!=='helicopter' || Math.abs(p.p[1]-gate[1])<10) &&
    (p.kind!=='ship' || !p.grounded) && (p.kind!=='mech' || p.gait!=='recovering');
  if(p.hp && !w.captured && !w.relay.hp && inGate){
    w.captured=true;w.score+=50;
    p.ammo=Math.min(36,p.ammo+8);
    emit(w,'beacon',{source:p.id,point:gate,hp:p.hp,ammo:p.ammo});
  }
  if(p.hp && w.captured && inGate && p.hp<p.maxHp && w.supplies>0 && w.tick>=w.serviceReady){
    const repaired=Math.min(30,w.supplies,p.maxHp-p.hp);
    p.hp+=repaired;w.supplies-=repaired;w.serviceReady=w.tick+HZ;
    emit(w,'repair',{source:p.id,amount:repaired,hp:p.hp,reserve:w.supplies});
  }
  if(!p.hp)w.reason='vehicle disabled';
  else if(w.captured && w.mobileKills>=REQUIRED_DEFENDERS)w.reason='crossing secured';
  else if(w.tick>=COMBINED_LIMIT)w.reason='held too long';
  if(w.reason){
    w.status=w.reason==='crossing secured'?'victory':'defeat';
    emit(w,'outcome',{status:w.status,reason:w.reason,score:w.score});
  }
}

export function combinedReceipt(w){
  return {...receipt(w),source:COMBINED_SOURCE,mission:w.mission,selection:w.selection};
}
export function replayCombined(text){
  if(typeof text!=='string' || text.length>300000)throw RangeError('invalid combined replay size');
  const r=JSON.parse(text);
  if(!r || Object.keys(r).sort().join()!=='commands,eventHash,mission,seed,selection,source,stateHash,ticks' ||
    r.source!==COMBINED_SOURCE || r.mission!=='breakwater' || !CLASSES.includes(r.selection) ||
    !integer(r.seed,0xffffffff) || !integer(r.ticks,COMBINED_LIMIT) || !Array.isArray(r.commands) ||
    r.commands.length>r.ticks || (r.ticks>0 && r.commands[0]?.[0]!==0) ||
    ![r.stateHash,r.eventHash].every(s=>typeof s==='string' && /^[0-9a-f]{8}$/.test(s)))throw Error('invalid combined replay');
  let lastTick=-1,lastMask=-1;
  for(const c of r.commands){
    if(!Array.isArray(c) || c.length!==2 || !integer(c[0],r.ticks-1) || c[0]<=lastTick ||
      !integer(c[1],commandMax) || c[1]===lastMask)throw Error('invalid combined replay controls');
    [lastTick,lastMask]=c;
  }
  const w=createCombinedWorld({seed:r.seed},r.selection);
  let i=0,mask=0;
  while(w.status==='active' && w.tick<r.ticks){
    if(r.commands[i]?.[0]===w.tick)mask=r.commands[i++][1];
    stepCombined(w,mask);
  }
  const check=combinedReceipt(w);
  if(check.ticks!==r.ticks || check.stateHash!==r.stateHash || check.eventHash!==r.eventHash)
    throw Error('combined replay diverged');
  return w;
}
