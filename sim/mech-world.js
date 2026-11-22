// Glassworks Crossing. Every event comes from an accepted fixed world step.
import {add,clamp,dot,normalize,scale,seededRandom,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';
import {EDGE,missionSeed,sight} from './terrain.js';
import {HZ} from './clock.js';
import {receipt,sweep} from './world.js';
import {createWalker,stepWalker,stopWalker,aimWalker,walkerGun} from './walker.js';
import {MECH_SOURCE} from './mech-identity.js';

export const MK=Object.freeze({forward:1,back:2,left:4,right:8,torsoLeft:16,torsoRight:32,
  elevate:64,depress:128,fire:256});
export const MECH_SEED=919, MECH_LIMIT=120*HZ;
export const BEACON_RADIUS=2.8;
const maxMask=511, reaction=120, memory=120, roundSpeed=48, roundLife=2*HZ;
const axis=(cmd,positive,negative)=>Number(Boolean(cmd&positive))-Number(Boolean(cmd&negative));
const natural=(n,max)=>Number.isInteger(n) && n>=0 && n<=max;

function glassworks(seed){
  const noise=seededRandom(seed),phase=noise()*6,heights=[];
  for(let z=-EDGE;z<=EDGE;z+=3){
    for(let x=-EDGE;x<=EDGE;x+=3){
      const shoulder=clamp((Math.abs(x)-8)/33,0,1);
      const spoil=shoulder*(5+2.8*Math.cos(x/12+z/15+phase)+noise()*1.7);
      const bank=4.8*Math.exp(-z*z/160);
      const shelf=2.15/(1+Math.exp((z+15)/4));
      heights.push(1+bank+shelf+spoil);
    }
  }
  return Object.freeze(new Heightfield({cellsX:96,cellsZ:96,cellSize:3,originX:-EDGE,originZ:-EDGE,heights}));
}

export function createMechWorld(pack={seed:MECH_SEED}){
  const seed=missionSeed(pack),field=glassworks(seed);
  const actor=(id,faction,z,yaw,hp,ammo)=>Object.assign(createWalker(field,0,z,yaw),
    {id,faction,hp,ammo,ready:0});
  return {mission:'glassworks',seed,field,player:actor('player','cobalt',24,0,100,30),
    enemy:Object.assign(actor('enemy','ember',-27,Math.PI,60,40),{
      patrol:1,mode:'patrol',seen:0,memory:0,lastSeen:null,visible:false}),
    beacon:[0,field.sample(0,-16).height,-16],tick:0,status:'walking',reason:'',score:0,
    shots:[],serial:0,events:[],eventHash:2166136261,commands:[],lastCommand:-1};
}

function emit(w,type,fields={}){
  const e={tick:w.tick,type,...fields};
  for(const c of JSON.stringify(e))w.eventHash=Math.imul(w.eventHash^c.charCodeAt(0),16777619)>>>0;
  if(w.events.length===96)w.events.shift();
  w.events.push(e);
}

function gunClear(field,gun){
  const inside=p=>Math.abs(p[0])<=EDGE && Math.abs(p[2])<=EDGE;
  return inside(gun.pivot) && inside(gun.muzzle) && sight(field,gun.pivot,gun.muzzle);
}

// The two translating game bounds stay axis-aligned at every torso bearing.
function sweepParts(w,shot,target,previous){
  const offset=[0,1,0];
  const parts=target.hp ? [
    {id:'pelvis',p:target.p,prev:previous,half:[1,.45,1.05]},
    {id:'torso',p:add(target.p,offset),prev:add(previous,offset),half:[.98,.88,1.05]}
  ] : [];
  return sweep(w,shot,parts);
}

export function sightMech(w,actor=w.player){
  const target=actor===w.player?w.enemy:w.player,gun=walkerGun(actor);
  const clear=gunClear(w.field,gun), delta=scale(gun.direction,roundSpeed*roundLife/HZ);
  const hit=clear?sweepParts(w,{p:gun.muzzle,step:delta},target,target.p):null;
  return {clear,visible:target.hp>0 && sight(w.field,gun.pivot,walkerGun(target).pivot),
    point:clear?(hit?.point??add(gun.muzzle,delta)):gun.muzzle,target:hit?.id??null};
}

function fire(w,actor){
  if(!actor.ammo || w.tick<actor.ready || w.shots.length>=12)return;
  const gun=walkerGun(actor);
  if(!gunClear(w.field,gun)){
    actor.ready=w.tick+12;
    emit(w,'blocked',{source:actor.id,point:gun.muzzle});
    return;
  }
  const shot={id:++w.serial,owner:actor.id,p:gun.muzzle,prev:gun.muzzle,
    step:scale(gun.direction,roundSpeed/HZ),life:roundLife};
  w.shots.push(shot);actor.ammo--;actor.ready=w.tick+(actor===w.player?52:168);
  emit(w,'launch',{owner:actor.id,shot:shot.id,point:shot.p});
}

function moveRounds(w,oldPlayer,oldEnemy){
  for(let i=0;i<w.shots.length;){
    const s=w.shots[i],playerRound=s.owner===w.player.id,target=playerRound?w.enemy:w.player;
    const hit=sweepParts(w,s,target,playerRound?oldEnemy:oldPlayer);
    if(hit){
      const component=hit.id==='pelvis' || hit.id==='torso'?hit.id:null;
      const targetId=component?target.id:hit.id;
      emit(w,'impact',{source:s.owner,shot:s.id,target:targetId,component,point:hit.point});
      if(component){
        const amount=20;
        target.hp=Math.max(0,target.hp-amount);
        emit(w,'damage',{source:s.owner,shot:s.id,target:targetId,component,amount,hp:target.hp,point:hit.point});
        if(!target.hp){
          if(playerRound){
            w.score+=100;
            target.visible=false;target.seen=target.memory=0;target.lastSeen=null;target.mode='disabled';
          }
          emit(w,'destroy',{source:s.owner,shot:s.id,target:targetId,point:target.p.slice()});
        }
      }
    }
    if(hit || --s.life===0)w.shots.splice(i,1);
    else {s.prev=s.p;s.p=add(s.p,s.step);i++;}
  }
}

function walk(w,actor,other,throttle,steer){
  const next={...actor};
  stepWalker(next,w.field,throttle,steer);
  if(other.hp && Math.hypot(next.p[0]-other.p[0],next.p[2]-other.p[2])<6.2){
    stopWalker(actor,w.field);actor.blocked=true;return;
  }
  Object.assign(actor,next);
}

function guard(w){
  const e=w.enemy,p=w.player;
  const gun=walkerGun(e),aim=walkerGun(p).pivot;
  e.visible=p.hp>0 && Math.hypot(...subtract(aim,gun.pivot))<=74 && sight(w.field,gun.pivot,aim);
  if(!e.visible){
    e.seen=0;e.memory=Math.max(0,e.memory-1);
    e.mode=e.memory?'search':'patrol';
    if(!e.memory)e.lastSeen=null;
    return;
  }
  e.seen=Math.min(reaction,e.seen+1);e.memory=memory;e.lastSeen=aim;
  e.mode=e.seen===reaction?'tracking':'acquiring';
  const dir=normalize(subtract(aim,gun.pivot));
  const dyaw=Math.atan2(dir[0],-dir[2])-e.torsoYaw;
  const del=Math.asin(clamp(dir[1],-1,1))-e.elevation;
  aimWalker(e,clamp(Math.atan2(Math.sin(dyaw),Math.cos(dyaw))*60,-1,1),clamp(del*100,-1,1));
  if(e.seen===reaction && dot(walkerGun(e).direction,dir)>.9999)fire(w,e);
}

export function stepMech(w,cmd=0){
  if(!natural(cmd,maxMask))throw new RangeError('invalid walker controls');
  if(w.status!=='walking')return;
  if(cmd!==w.lastCommand){w.commands.push([w.tick,cmd]);w.lastCommand=cmd;}
  w.tick++;
  const p=w.player,e=w.enemy,oldPlayer=p.p.slice(),oldEnemy=e.p.slice();
  walk(w,p,e,axis(cmd,MK.forward,MK.back),axis(cmd,MK.right,MK.left));
  aimWalker(p,axis(cmd,MK.torsoRight,MK.torsoLeft),axis(cmd,MK.elevate,MK.depress));
  if(e.hp){
    if(e.p[2]>=-24)e.patrol=-1;
    if(e.p[2]<=-30)e.patrol=1;
    walk(w,e,p,.48*e.patrol,0);
  }
  moveRounds(w,oldPlayer,oldEnemy);
  if(e.hp && p.hp)guard(w);
  if(p.hp && cmd&MK.fire)fire(w,p);
  if(!p.hp)w.reason='walker disabled';
  else if(!e.hp && p.supportCount>=3 && p.gait!=='recovering' &&
    Math.hypot(p.p[0]-w.beacon[0],p.p[2]-w.beacon[2])<=BEACON_RADIUS){
    w.score+=50;w.reason='survey beacon linked';emit(w,'beacon',{point:w.beacon});
  }else if(e.hp && !p.ammo && !w.shots.some(s=>s.owner===p.id))w.reason='cells exhausted';
  else if(w.tick>=MECH_LIMIT)w.reason='time expired';
  if(w.reason){
    w.status=w.reason==='survey beacon linked'?'victory':'defeat';
    emit(w,'outcome',{status:w.status,reason:w.reason,score:w.score});
  }
}

export function mechReceipt(w){
  return {...receipt(w),source:MECH_SOURCE,mission:w.mission};
}

export function replayMech(text){
  if(typeof text!=='string' || text.length>300000)throw new RangeError('invalid walker replay size');
  const r=JSON.parse(text);
  if(!r || Object.keys(r).sort().join()!=='commands,eventHash,mission,seed,source,stateHash,ticks' ||
    r.source!==MECH_SOURCE || r.mission!=='glassworks' || !natural(r.seed,0xffffffff) ||
    !natural(r.ticks,MECH_LIMIT) || !Array.isArray(r.commands) || r.commands.length>r.ticks ||
    (r.ticks>0 && r.commands[0]?.[0]!==0) ||
    ![r.stateHash,r.eventHash].every(h=>typeof h==='string' && /^[a-f0-9]{8}$/.test(h)))
    throw Error('invalid walker replay header');
  let lastTick=-1,lastMask=-1;
  for(const c of r.commands){
    if(!Array.isArray(c) || c.length!==2 || !natural(c[0],r.ticks-1) || c[0]<=lastTick ||
       !natural(c[1],maxMask) || c[1]===lastMask)throw Error('invalid walker replay command');
    [lastTick,lastMask]=c;
  }
  const w=createMechWorld({seed:r.seed});
  let i=0,mask=0;
  while(w.status==='walking' && w.tick<r.ticks){
    if(r.commands[i]?.[0]===w.tick)mask=r.commands[i++][1];
    stepMech(w,mask);
  }
  const check=mechReceipt(w);
  if(check.ticks!==r.ticks || check.stateHash!==r.stateHash || check.eventHash!==r.eventHash)
    throw Error('walker replay diverged');
  return w;
}
