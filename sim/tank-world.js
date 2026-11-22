import {add,clamp,dot,normalize,scale,seededRandom,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';
import {HZ} from './clock.js';
import {missionSeed} from './terrain.js';
import {createTracks,stepTracks,aimTracks,tankGun} from './tracks.js';
import {ARENA_EDGE,ARMOUR,barrelClear,componentSight,pulseSweep} from './tank-combat.js';
import {TANK_SOURCE} from './tank-identity.js';

export {barrelClear,componentSight} from './tank-combat.js';
export const TK=Object.freeze({forward:1,back:2,left:4,right:8,brake:16,turretLeft:32,
  turretRight:64,elevate:128,depress:256,fire:512});
export const TANK_LIMIT=HZ*120, TANK_SEED=622;
const maxMask=1023, reaction=100, search=150, maxShots=12;
const validMask=n=>Number.isInteger(n) && n>=0 && n<=maxMask;
const axis=(cmd,pos,neg)=>Number(Boolean(cmd&pos))-Number(Boolean(cmd&neg));
const ordinal=(value,limit)=>Number.isInteger(value) && value>=0 && value<=limit;
const checksum=n=>n.toString(16).padStart(8,'0');

function hash(text,h=2166136261){
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
  return h;
}
function emit(w,type,fields){
  const event={tick:w.tick,type,...fields};
  w.eventHash=hash(JSON.stringify(event),w.eventHash);
  if(w.events.length===96)w.events.shift();
  w.events.push(event);
}

function cutbank(seed){
  const heights=[], noise=seededRandom(seed),wave=noise()*Math.PI*2;
  for(let z=-ARENA_EDGE;z<=ARENA_EDGE;z+=4){
    for(let x=-ARENA_EDGE;x<=ARENA_EDGE;x+=4){
      const shoulder=clamp((Math.abs(x)-15)/44,0,1);
      // A level bench behind the low crown admits a turret-only sightline.
      const crest=2.72*Math.max(0,1-Math.abs(z-8-shoulder*4*Math.sin(x/14))/12);
      const bench=1.15*clamp((32-z)/8,0,1)*clamp((z-4)/8,0,1);
      const shelf=1.1*clamp((-z-2)/14,0,1);
      const hills=shoulder*(6+4*Math.cos(z/16+x/21+wave)+2*noise());
      heights.push(1+shelf+Math.max(crest,bench)+hills);
    }
  }
  return Object.freeze(new Heightfield({cellsX:72,cellsZ:72,cellSize:4,
    originX:-ARENA_EDGE,originZ:-ARENA_EDGE,heights}));
}
export function createTankWorld(pack={seed:TANK_SEED}){
  const seed=missionSeed(pack),field=cutbank(seed);
  const actor=(id,faction,z,yaw,hp,ammo)=>Object.assign(createTracks(field,0,z,yaw),
    {id,faction,hp,ammo,ready:0});
  const player=actor('player','blue',32,0,100,16);
  const enemy=Object.assign(actor('enemy','amber',-27,Math.PI,60,30),{
    visible:false,seen:0,memory:0,lastSeen:null,mode:'idle'});
  return {mission:'cutbank',seed,field,player,enemy,tick:0,status:'driving',reason:'',score:0,
    shots:[],serial:0,events:[],eventHash:2166136261,commands:[],lastCommand:-1};
}

function drive(w,cmd){
  const p=w.player,throttle=axis(cmd,TK.forward,TK.back),turn=axis(cmd,TK.right,TK.left);
  const next={...p};
  stepTracks(next,w.field,clamp(throttle+turn,-1,1),clamp(throttle-turn,-1,1),Boolean(cmd&TK.brake));
  // The guard holds its post. A conservative separation circle around each
  // chassis keeps both hulls and their turret pivots from overlapping.
  if(Math.hypot(next.p[0]-w.enemy.p[0],next.p[2]-w.enemy.p[2])<5.1){
    p.speed=p.leftSpeed=p.rightSpeed=0;p.v=[0,0,0];p.blocked=true;
  }else Object.assign(p,next);
  aimTracks(p,axis(cmd,TK.turretRight,TK.turretLeft),axis(cmd,TK.elevate,TK.depress));
}

function fire(w,actor){
  if(!actor.hp || !actor.ammo || actor.ready>w.tick || w.shots.length>=maxShots)return;
  const {muzzle,direction}=tankGun(actor);
  if(!barrelClear(w.field,actor)){
    actor.ready=w.tick+12;
    emit(w,'blocked',{source:actor.id,point:muzzle});
    return;
  }
  const shot={id:++w.serial,owner:actor.id,p:muzzle,prev:muzzle,
    step:scale(direction,44/HZ),life:HZ*4};
  w.shots.push(shot);
  actor.ammo--;actor.ready=w.tick+(actor.id==='player'?72:165);
  emit(w,'launch',{owner:actor.id,shot:shot.id,point:muzzle});
}

function perceive(w){
  const e=w.enemy,p=w.player;
  if(!e.hp){e.mode='destroyed';e.visible=false;e.lastSeen=null;e.seen=e.memory=0;return;}
  const inRange=Math.hypot(...subtract(p.p,e.p))<95;
  const visible=p.hp && inRange ? componentSight(w.field,e,p) : {hull:false,turret:false};
  e.visible=visible.hull || visible.turret;
  if(!e.visible){
    e.seen=0;
    if(e.memory>0)e.memory--;
    e.mode=e.memory?'search':'idle';
    if(!e.memory)e.lastSeen=null;
    return;
  }
  e.seen=Math.min(reaction,e.seen+1); e.memory=search;
  e.lastSeen=visible.point;
  e.mode=e.seen<reaction?'acquiring':'tracking';
  const g=tankGun(e),line=normalize(subtract(e.lastSeen,g.pivot));
  const azimuth=Math.atan2(line[0],-line[2]), error=azimuth-e.turretYaw;
  const yawDelta=Math.atan2(Math.sin(error),Math.cos(error));
  const elevationDelta=Math.asin(clamp(line[1],-1,1))-e.elevation;
  aimTracks(e,clamp(yawDelta*80,-1,1),clamp(elevationDelta*100,-1,1));
  if(e.seen===reaction && dot(tankGun(e).direction,line)>.99995)fire(w,e);
}

function moveShots(w,oldPlayer,oldEnemy){
  for(let i=0;i<w.shots.length;){
    const s=w.shots[i],own=s.owner==='player';
    const target=own?w.enemy:w.player;
    const hit=pulseSweep(w.field,s,own?oldEnemy:oldPlayer,target);
    if(hit){
      const {id,point,component,plate}=hit;
      emit(w,'impact',{source:s.owner,shot:s.id,target:id,point});
      if(id===target.id){
        const amount=10*(5-ARMOUR[plate]);
        target.hp=Math.max(0,target.hp-amount);
        emit(w,'damage',{source:s.owner,shot:s.id,target:id,component,plate,amount,hp:target.hp,point});
        if(!target.hp){
          if(own)w.score+=100;
          emit(w,'destroy',{source:s.owner,shot:s.id,target:id,point:target.p});
        }
      }
    }
    if(hit || --s.life===0)w.shots.splice(i,1);
    else {s.prev=s.p;s.p=add(s.p,s.step);i++;}
  }
}

export function stepTank(w,cmd=0){
  if(!validMask(cmd))throw new RangeError('invalid tracked controls');
  if(w.status!=='driving')return;
  if(cmd!==w.lastCommand){w.commands.push([w.tick,cmd]);w.lastCommand=cmd;}
  w.tick++;
  const oldPlayer={...w.player}, oldEnemy={...w.enemy};
  drive(w,cmd);
  moveShots(w,oldPlayer,oldEnemy);
  if(w.player.hp && w.enemy.hp && (cmd&TK.fire))fire(w,w.player);
  perceive(w);
  if(!w.player.hp)w.reason='vehicle disabled';
  else if(!w.enemy.hp)w.reason='relay secured';
  else if(!w.player.ammo && !w.shots.some(s=>s.owner==='player'))w.reason='magazine empty';
  else if(w.tick===TANK_LIMIT)w.reason='time expired';
  if(w.reason){
    w.status=w.reason==='relay secured'?'victory':'defeat';
    emit(w,'outcome',{status:w.status,reason:w.reason,score:w.score});
  }
}

export function tankReceipt(w){
  const {field,events,commands,...state}=w;
  return {source:TANK_SOURCE,mission:w.mission,seed:w.seed,ticks:w.tick,commands:commands.map(c=>[...c]),
    stateHash:checksum(hash(JSON.stringify(state))),eventHash:checksum(w.eventHash)};
}
export function replayTank(text){
  if(typeof text!=='string' || text.length>300000)throw new RangeError('invalid tank replay size');
  const r=JSON.parse(text), keys='commands,eventHash,mission,seed,source,stateHash,ticks';
  if(!r || Object.keys(r).sort().join()!==keys || r.mission!=='cutbank' || r.source!==TANK_SOURCE ||
     !ordinal(r.seed,0xffffffff) || !ordinal(r.ticks,TANK_LIMIT) || !Array.isArray(r.commands) ||
     r.commands.length>r.ticks || (r.ticks>0 && r.commands[0]?.[0]!==0) ||
     ![r.stateHash,r.eventHash].every(s=>typeof s==='string' && /^[0-9a-f]{8}$/.test(s)))
    throw new Error('invalid tank replay header');
  let prior=-1,previous=-1;
  for(const pair of r.commands){
    if(!Array.isArray(pair) || pair.length!==2 || !ordinal(pair[0],r.ticks-1) || pair[0]<=prior ||
       !validMask(pair[1]) || pair[1]===previous)throw new Error('invalid tank replay command');
    [prior,previous]=pair;
  }
  const w=createTankWorld({seed:r.seed});
  let index=0,cmd=0;
  while(w.tick<r.ticks && w.status==='driving'){
    if(r.commands[index]?.[0]===w.tick)cmd=r.commands[index++][1];
    stepTank(w,cmd);
  }
  const result=tankReceipt(w);
  if(result.ticks!==r.ticks || result.stateHash!==r.stateHash || result.eventHash!==r.eventHash)
    throw new Error('tank replay diverged');
  return w;
}
