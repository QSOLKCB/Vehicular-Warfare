// Lantern Sound. The fixed world owns the channel, hulls and spent signal cells.
import {add,clamp,dot,scale,seededRandom,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';
import {EDGE,missionSeed,sight} from './terrain.js';
import {HZ} from './clock.js';
import {receipt,sweep} from './world.js';
import {WaterSurface,HULL_HALF,createVessel,stepVessel,vesselPoint} from './vessel.js';
import {NAVAL_SOURCE} from './naval-identity.js';

export const NK=Object.freeze({forward:1,back:2,left:4,right:8,mountLeft:16,mountRight:32,
  elevate:64,depress:128,fire:256});
export const NAVAL_SEED=1404, NAVAL_LIMIT=120*HZ, BEACON_RADIUS=5;
const maxMask=511, reaction=100, memory=150, speed=44, fall=3, lifetime=3*HZ;
const separation=2*Math.hypot(...HULL_HALF);
const axis=(mask,pos,neg)=>Number(Boolean(mask&pos))-Number(Boolean(mask&neg));
const natural=(n,max)=>Number.isInteger(n) && n>=0 && n<=max;

function shoal(x,z,cx,cz,rx,rz,height){
  return height*Math.max(0,1-((x-cx)/rx)**2-((z-cz)/rz)**2);
}

function soundField(seed){
  const noise=seededRandom(seed),phase=noise()*6,heights=[];
  for(let z=-EDGE;z<=EDGE;z+=3){
    for(let x=-EDGE;x<=EDGE;x+=3){
      const east=shoal(x,z,9,12,5.3,11,13);
      const station=shoal(x,z,0,-69,14,20,6);
      const headlands=Math.max(shoal(x,z,-43,-15,26,32,15),shoal(x,z,57,-47,26,33,17),
        shoal(x,z,-68,69,38,22,16),shoal(x,z,79,60,32,24,13));
      const outer=clamp((Math.max(Math.abs(x),Math.abs(z))-82)/35,0,1);
      const cliffs=outer*(14+7*Math.cos(x/18+z/21+phase)+noise()*3);
      heights.push(-4+Math.max(east,station,headlands*(.9+.1*noise()),cliffs));
    }
  }
  return Object.freeze(new Heightfield({cellsX:96,cellsZ:96,cellSize:3,originX:-EDGE,originZ:-EDGE,heights}));
}

export function createNavalWorld(pack={seed:NAVAL_SEED}){
  const seed=missionSeed(pack),field=soundField(seed),water=new WaterSurface();
  const ship=(id,faction,x,z,yaw,mountYaw,hp,ammo)=>Object.assign(createVessel(field,water,x,z,yaw),{
    id,faction,mountYaw,elevation:0,hp,ammo,ready:0});
  const x=0,z=-60,half=[2.5,2,2.5];
  return {mission:'lantern',seed,field,water,player:ship('player','cobalt',0,42,0,0,100,32),
    enemy:Object.assign(ship('enemy','ember',13,-8,Math.PI/2,Math.PI,60,40),{
      elevation:.035,seen:0,memory:0,mode:'patrol',visible:false,lastSeen:null}),
    shore:{id:'shore',faction:'ember',p:[x,field.sample(x,z).height+half[1],z],half,hp:60},
    beacon:[0,water.heightAt(0,-34),-34],tick:0,status:'sailing',reason:'',score:0,
    shots:[],serial:0,events:[],eventHash:2166136261,commands:[],lastCommand:-1};
}

function emit(w,type,fields){
  const event={tick:w.tick,type,...fields};
  for(const c of JSON.stringify(event))w.eventHash=Math.imul(w.eventHash^c.charCodeAt(0),16777619)>>>0;
  if(w.events.length===96)w.events.shift();
  w.events.push(event);
}

export function navalGun(ship){
  const pivot=vesselPoint(ship,0,1.55,1.8),c=Math.cos(ship.elevation);
  const direction=[Math.sin(ship.mountYaw)*c,Math.sin(ship.elevation),-Math.cos(ship.mountYaw)*c];
  return {pivot,direction,muzzle:add(pivot,scale(direction,2.35))};
}

function aim(ship,turn,lift){
  const yaw=ship.mountYaw+turn*1.5/HZ;
  ship.mountYaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
  ship.elevation=clamp(ship.elevation+lift*.55/HZ,-.18,.55);
}
function clear(w,gun,ship){
  const inside=p=>Math.abs(p[0])<=EDGE && Math.abs(p[2])<=EDGE;
  const step=subtract(gun.muzzle,gun.pivot);
  return inside(gun.pivot) && inside(gun.muzzle) &&
    !sweep(w,{p:gun.pivot,step},shipBounds(ship,ship.p)) && !w.water.castSegment(gun.pivot,step);
}

// The hull envelope follows translation. Its horizontal extents enclose the
// rectangle at the end-of-tick heading. The smaller deckhouse is a second box.
function shipBounds(ship,previous){
  if(!ship.hp)return [];
  const s=Math.abs(Math.sin(ship.yaw)),c=Math.abs(Math.cos(ship.yaw));
  const [side,height,bow]=HULL_HALF;
  const deck=[0,1.15,0];
  return [{id:ship.id,p:ship.p,prev:previous,half:[side*c+bow*s,height,bow*c+side*s]},
    {id:ship.id+'-deck',p:add(ship.p,deck),prev:add(previous,deck),half:[1.15,1,1.15]}];
}

function contact(w,origin,delta,targets){
  const solid=sweep(w,{p:origin,step:delta},targets);
  const water=w.water.castSegment(origin,delta);
  if(!water)return solid;
  if(solid){
    const toSolid=subtract(solid.point,origin),toWater=subtract(water.point,origin);
    const separation=dot(toSolid,toSolid)-dot(toWater,toWater);
    if(separation<0 || (separation===0 && solid.id==='terrain'))return solid;
  }
  return {id:'water',point:water.point};
}

function opposing(w,playerShot,previous){
  if(!playerShot)return shipBounds(w.player,previous);
  const targets=shipBounds(w.enemy,previous);
  if(w.shore.hp)targets.push({...w.shore,prev:w.shore.p});
  return targets;
}

export function sightNaval(w){
  const gun=navalGun(w.player),open=clear(w,gun,w.player),ray=scale(gun.direction,105);
  const hit=open?contact(w,gun.muzzle,ray,opposing(w,true,w.enemy.p)):null;
  return {clear:open,point:open?hit?.point??add(gun.muzzle,ray):gun.muzzle,
    target:hit?.id.replace('-deck','')??null,
    visible:w.enemy.hp>0 && sight(w.field,gun.pivot,navalGun(w.enemy).pivot),
    shoreVisible:w.shore.hp>0 && sight(w.field,gun.pivot,w.shore.p)};
}

function launch(w,ship){
  if(!ship.ammo || w.tick<ship.ready || w.shots.length>=12)return;
  const gun=navalGun(ship);
  if(!clear(w,gun,ship)){
    ship.ready=w.tick+12;
    emit(w,'blocked',{source:ship.id,point:gun.muzzle});return;
  }
  const cell={id:++w.serial,owner:ship.id,p:gun.muzzle,prev:gun.muzzle,
    v:scale(gun.direction,speed),life:lifetime};
  w.shots.push(cell);ship.ammo--;ship.ready=w.tick+(ship===w.player?46:130);
  emit(w,'launch',{owner:ship.id,shot:cell.id,point:cell.p});
}

function impact(w,cell,hit){
  const id=hit.id.replace('-deck',''),target=w[id];
  emit(w,'impact',{source:cell.owner,shot:cell.id,target:id,point:hit.point});
  if(!target?.hp)return;
  target.hp=Math.max(0,target.hp-20);
  emit(w,'damage',{source:cell.owner,shot:cell.id,target:id,amount:20,hp:target.hp,point:hit.point});
  if(!target.hp){
    if(cell.owner==='player')w.score+=100;
    if(target===w.enemy){
      target.visible=false;target.seen=target.memory=0;target.lastSeen=null;target.mode='disabled';
    }
    emit(w,'destroy',{source:cell.owner,shot:cell.id,target:id,point:target.p.slice()});
  }
}

function moveCells(w,oldPlayer,oldEnemy){
  for(let i=0;i<w.shots.length;){
    const cell=w.shots[i],friendly=cell.owner==='player';
    const delta=scale(cell.v,1/HZ);
    delta[1]-=fall/(2*HZ*HZ);
    const hit=contact(w,cell.p,delta,opposing(w,friendly,friendly?oldEnemy:oldPlayer));
    if(hit)impact(w,cell,hit);
    if(hit || --cell.life===0){w.shots.splice(i,1);continue;}
    cell.prev=cell.p;cell.p=add(cell.p,delta);cell.v[1]-=fall/HZ;i++;
  }
}

function helm(w,ship,other,power,rudder){
  const next={...ship};
  stepVessel(next,w.field,w.water,power,rudder);
  // A pair of circumscribed horizontal discs prevents two live hulls from
  // interpenetrating. Buoyancy, pitch and roll keep integrating on contact.
  if(other.hp && Math.hypot(next.p[0]-other.p[0],next.p[2]-other.p[2])<separation){
    ship.v=[0,ship.v[1],0];ship.yawRate=0;
    stepVessel(ship,w.field,w.water,0,0);
  }else Object.assign(ship,next);
}

function watch(w){
  const e=w.enemy,p=w.player,from=navalGun(e).pivot,to=navalGun(p).pivot;
  const delta=subtract(to,from);
  e.visible=p.hp>0 && Math.hypot(...delta)<=80 && sight(w.field,from,to);
  if(!e.visible){
    e.seen=0;e.memory=Math.max(0,e.memory-1);e.mode=e.memory?'search':'patrol';
    if(!e.memory)e.lastSeen=null;
    return;
  }
  e.lastSeen=to;e.memory=memory;e.seen=Math.min(reaction,e.seen+1);
  e.mode=e.seen===reaction?'tracking':'acquiring';
  const yawError=Math.atan2(delta[0],-delta[2])-e.mountYaw;
  const turn=Math.atan2(Math.sin(yawError),Math.cos(yawError));
  // The patrol fires at the last visible bearing using a fixed toy elevation.
  aim(e,clamp(turn*60,-1,1),0);
  if(e.seen===reaction && Math.abs(turn)<.04)launch(w,e);
}

export function stepNaval(w,cmd=0){
  if(!natural(cmd,maxMask))throw RangeError('invalid naval controls');
  if(w.status!=='sailing')return;
  if(cmd!==w.lastCommand){w.commands.push([w.tick,cmd]);w.lastCommand=cmd;}
  w.tick++;
  const p=w.player,e=w.enemy,oldPlayer=p.p.slice(),oldEnemy=e.p.slice();
  helm(w,p,e,axis(cmd,NK.forward,NK.back),axis(cmd,NK.right,NK.left));
  aim(p,axis(cmd,NK.mountRight,NK.mountLeft),axis(cmd,NK.elevate,NK.depress));
  if(e.hp){
    const waypoint=2+11*Math.cos(.72*w.tick/HZ);
    const desired=clamp(waypoint-e.p[0],-3.8,3.8);
    helm(w,e,p,clamp((desired-e.v[0])*.8,-1,1),0);
  }
  moveCells(w,oldPlayer,oldEnemy);
  if(e.hp && p.hp)watch(w);
  if(p.hp && (cmd&NK.fire))launch(w,p);
  if(!p.hp)w.reason='vessel disabled';
  else if(!e.hp && !w.shore.hp && !p.grounded &&
    Math.hypot(p.p[0]-w.beacon[0],p.p[2]-w.beacon[2])<=BEACON_RADIUS){
    w.score+=50;w.reason='passage reopened';emit(w,'beacon',{point:w.beacon});
  }else if((e.hp || w.shore.hp) && !p.ammo && !w.shots.some(c=>c.owner===p.id))w.reason='cells exhausted';
  else if(w.tick>=NAVAL_LIMIT)w.reason='time expired';
  if(w.reason){
    w.status=w.reason==='passage reopened'?'victory':'defeat';
    emit(w,'outcome',{status:w.status,reason:w.reason,score:w.score});
  }
}

export function navalReceipt(w){
  return {...receipt(w),source:NAVAL_SOURCE,mission:w.mission};
}

export function replayNaval(text){
  if(typeof text!=='string' || text.length>300000)throw RangeError('invalid naval replay size');
  const r=JSON.parse(text);
  if(!r || Object.keys(r).sort().join()!=='commands,eventHash,mission,seed,source,stateHash,ticks' ||
    r.source!==NAVAL_SOURCE || r.mission!=='lantern' || !natural(r.seed,0xffffffff) ||
    !natural(r.ticks,NAVAL_LIMIT) || !Array.isArray(r.commands) || r.commands.length>r.ticks ||
    (r.ticks>0 && r.commands[0]?.[0]!==0) ||
    ![r.stateHash,r.eventHash].every(h=>typeof h==='string' && /^[a-f0-9]{8}$/.test(h)))
    throw Error('invalid naval replay header');
  let lastTick=-1,lastMask=-1;
  for(const c of r.commands){
    if(!Array.isArray(c) || c.length!==2 || !natural(c[0],r.ticks-1) || c[0]<=lastTick ||
      !natural(c[1],maxMask) || c[1]===lastMask)throw Error('invalid naval replay command');
    [lastTick,lastMask]=c;
  }
  const w=createNavalWorld({seed:r.seed});
  let i=0,mask=0;
  while(w.status==='sailing' && w.tick<r.ticks){
    if(r.commands[i]?.[0]===w.tick)mask=r.commands[i++][1];
    stepNaval(w,mask);
  }
  const check=navalReceipt(w);
  if(check.ticks!==r.ticks || check.stateHash!==r.stateHash || check.eventHash!==r.eventHash)
    throw Error('naval replay diverged');
  return w;
}
