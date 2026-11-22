import {add, clamp, dot, normalize, scale, subtract} from '../vendor/vanillajs/modules/math/index.js';
import {castMovingSegment} from '../vendor/vanillajs/modules/collision/index.js';
import {EDGE, missionSeed, sight, valley} from './terrain.js';
import {HZ} from './clock.js';
import {SOURCE} from './identity.js';

export const K = Object.freeze({up:1, down:2, forward:4, back:8, left:16, right:32,
  yawLeft:64, yawRight:128, fire:256, aimUp:512, aimDown:1024});
export const DEFAULT_SEED = 417;
export const LIMIT = 120 * 180;
export const REACTION = 120;
export const MEMORY = 180;
const DT = 1/HZ;
const axes = (cmd, pos, neg) => Number(Boolean(cmd & pos)) - Number(Boolean(cmd & neg));
const enemies = ['aa','convoy'];

function actor(id, p, hp, half) {
  return {id, p, prev:p, hp, half};
}

export function createWorld(pack = {seed:DEFAULT_SEED}) {
  const seed = missionSeed(pack);
  const {field,offset} = valley(seed);
  const at = (x,z,h) => [x,field.sample(x,z).height+h,z];
  const player = Object.assign(actor('player', at(0,38,offset+0.8), 100,[1.35,0.8,2]), {
    v:[0,0,0], yaw:0, pitch:0, bank:0, aim:0, ammo:16, ready:0});
  const aa = actor('aa', at(-3,-25,2.1), 60,[2,2.1,2]);
  const convoy = actor('convoy', at(7,-36,1.6), 60,[2.5,1.6,1.55]);
  for (const enemy of [aa,convoy]) Object.assign(enemy, {
    mode:'idle', seen:0, lastSeen:null, memory:0, ready:0, visible:false});
  return {seed,field,offset,player,aa,convoy,tick:0,status:'flying',reason:'',score:0,
    shots:[], serial:0, events:[], eventHash:2166136261, commands:[], lastCommand:-1};
}

// The last 96 events drive effects. The rolling digest covers the whole mission.
function hash(text, initial = 2166136261) {
  let h = initial;
  for (let i=0;i<text.length;i++) h = Math.imul(h ^ text.charCodeAt(i),16777619) >>> 0;
  return h;
}
function emit(w,type,detail) {
  const event = {tick:w.tick,type,...detail};
  w.eventHash = hash(JSON.stringify(event), w.eventHash);
  if (w.events.length === 96) w.events.shift();
  w.events.push(event);
}
function damage(w, body, amount, source, shot, point) {
  body.hp = Math.max(0,body.hp-amount);
  emit(w,'damage',{target:body.id,source,shot,hp:body.hp,point});
  if (body.hp === 0) {
    emit(w,'destroy',{target:body.id,source,shot,point:body.p});
    if (source === 'player') w.score += 100;
  }
}

function fly(w,cmd) {
  const p = w.player;
  const collective = axes(cmd,K.up,K.down);
  p.pitch += (0.48*axes(cmd,K.forward,K.back)-p.pitch)*4*DT;
  p.bank += (0.48*axes(cmd,K.right,K.left)-p.bank)*4*DT;
  p.yaw = (p.yaw + axes(cmd,K.yawRight,K.yawLeft)*1.35*DT) % (2*Math.PI);
  p.aim = clamp(p.aim + axes(cmd,K.aimUp,K.aimDown)*0.75*DT,-0.95,0.65);
  // Fictional assisted rotor: tilt redirects thrust. Neutral collective trims
  // vertical lift to weight. Damping bleeds momentum after controls release.
  const lift = (20 + 17*collective) / (Math.cos(p.bank)*Math.cos(p.pitch));
  const side = lift*Math.sin(p.bank), forward = lift*Math.cos(p.bank)*Math.sin(p.pitch);
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const acceleration = [side*c+forward*s, lift*Math.cos(p.bank)*Math.cos(p.pitch)-20, side*s-forward*c];
  p.v = p.v.map((v,i)=>clamp(v + DT*(acceleration[i]-v*(i===1?1.8:0.65)),-25,25));
  const next = add(p.p,scale(p.v,DT));
  for (const i of [0,1,2]) {
    const bounded = i===1 ? Math.min(95,next[i]) : clamp(next[i],-EDGE+4,EDGE-4);
    if (bounded !== next[i]) p.v[i]=0;
    next[i]=bounded;
  }
  const hit = w.field.castSegment(p.p,subtract(next,p.p),{verticalOffset:w.offset});
  if (!hit) { p.p=next; return; }
  p.p = add(hit.point,[0,0.002,0]);
  const speed = -dot(p.v,hit.normal);
  p.v = [0,0,0];
  if (speed > 7.2) damage(w,p,100,'terrain',null,p.p);
}

export function aim(w) {
  const p = w.player, angle = p.aim-p.pitch*0.55;
  const bore = [Math.sin(p.yaw)*Math.cos(angle),Math.sin(angle),-Math.cos(p.yaw)*Math.cos(angle)];
  let best = Math.cos(0.55), target = null, direction = bore;
  for (const id of enemies) {
    const e = w[id];
    if (!e.hp) continue;
    const line = normalize(subtract(e.p,p.p)), alignment = dot(bore,line);
    if (alignment > best && sight(w.field,p.p,e.p)) {
      best=alignment; target=id; direction=line;
    }
  }
  return {target,direction};
}

function launch(w,owner,direction) {
  if (w.shots.length >= 32) return false;
  const p = w[owner].p;
  const shot = {id:++w.serial,owner,p,prev:p,step:scale(direction,(owner==='player'?85:32)*DT),life:480};
  w.shots.push(shot);
  emit(w,'launch',{owner,shot:shot.id,point:p});
  return true;
}
function sense(w,e) {
  if (!e.hp) { e.visible=false; e.mode='destroyed'; e.lastSeen=null; return; }
  const visible = w.player.hp>0 && sight(w.field,e.p,w.player.p);
  e.visible=visible;
  if (visible) {
    e.lastSeen=w.player.p.slice(); e.memory=MEMORY; e.seen++;
    const delay=e.id==='aa'?REACTION:REACTION*2;
    e.mode=e.seen<delay?'acquiring':'tracking';
    if (e.mode==='tracking' && w.tick>=e.ready &&
        launch(w,e.id,normalize(subtract(e.lastSeen,e.p)))) {
      e.mode='firing'; e.ready=w.tick+(e.id==='aa'?120:300);
    }
  } else {
    e.seen=0;
    if (e.memory>0) e.memory--;
    e.mode=e.memory?'search':'idle';
    if (!e.memory) e.lastSeen=null;
  }
}

// Truncate the sweep at the world boundary, preserving the matching slice of
// target motion. Terrain wins exact ties. Points travel without guidance.
export function sweep(w,shot,targets) {
  let fraction=1;
  for (const axis of [0,2]) {
    const d=shot.step[axis];
    if (d) fraction=Math.min(fraction,((d>0?EDGE:-EDGE)-shot.p[axis])/d);
  }
  const end=add(shot.p,scale(shot.step,fraction));
  for (const i of [0,2]) end[i]=clamp(end[i],-EDGE,EDGE);
  const delta=subtract(end,shot.p), terrain=w.field.castSegment(shot.p,delta);
  const boxes=targets.map(e=>({id:e.id,box:{min:subtract(e.prev,e.half),max:add(e.prev,e.half)},
    displacement:scale(subtract(e.p,e.prev),fraction)}));
  const hit=castMovingSegment(shot.p,delta,boxes);
  if (terrain && (!hit || terrain.time<=hit.time)) return {id:'terrain',point:terrain.point};
  return hit ?? (fraction<1?{id:'boundary',point:end}:null);
}

function projectiles(w) {
  for (let i=0;i<w.shots.length;) {
    const shot=w.shots[i];
    const ids=shot.owner==='player'?enemies:['player'];
    const hit=sweep(w,shot,ids.map(id=>w[id]).filter(e=>e.hp>0));
    if (hit) {
      emit(w,'impact',{source:shot.owner,shot:shot.id,target:hit.id,point:hit.point});
      if (w[hit.id]?.hp) damage(w,w[hit.id],shot.owner==='player'?30:25,shot.owner,shot.id,hit.point);
    }
    shot.life--;
    if (hit || !shot.life) w.shots.splice(i,1);
    else { shot.prev=shot.p; shot.p=add(shot.p,shot.step); i++; }
  }
}

export function step(w,cmd=0) {
  if (!Number.isInteger(cmd) || cmd<0 || cmd>2047) throw new RangeError('invalid control bits');
  if (w.status!=='flying') return;
  if (cmd!==w.lastCommand) { w.commands.push([w.tick,cmd]); w.lastCommand=cmd; }
  w.tick++;
  for (const body of [w.player,w.aa,w.convoy]) body.prev=body.p;
  fly(w,cmd);
  if (w.convoy.hp) {
    const x=7+6*Math.sin(w.tick*DT*0.3), z=-36;
    w.convoy.p=[x,w.field.sample(x,z).height+1.6,z];
  }
  // Shots originate at the accepted end pose and first move the following tick.
  projectiles(w);
  if (w.player.hp && cmd&K.fire && w.player.ammo && w.tick>=w.player.ready &&
      launch(w,'player',aim(w).direction)) {
    w.player.ammo--; w.player.ready=w.tick+42;
  }
  for (const id of enemies) sense(w,w[id]);
  if (!w.player.hp) w.reason='aircraft lost';
  else if (!w.aa.hp && !w.convoy.hp) w.reason='valley secured';
  else if (!w.player.ammo && !w.shots.some(s=>s.owner==='player')) w.reason='rockets exhausted';
  else if (w.tick>=LIMIT) w.reason='mission time expired';
  if (w.reason) {
    w.status=w.reason==='valley secured'?'victory':'defeat';
    emit(w,'outcome',{status:w.status,reason:w.reason,score:w.score});
  }
}

export function receipt(w) {
  const {field,commands,events,...state}=w;
  return {source:SOURCE,seed:w.seed,ticks:w.tick,commands:commands.map(c=>[...c]),
    stateHash:hash(JSON.stringify(state)).toString(16).padStart(8,'0'),
    eventHash:w.eventHash.toString(16).padStart(8,'0')};
}

// Replay imports accept bounded JSON text only, so accessors never execute.
export function replay(text) {
  if (typeof text!=='string' || text.length>400000) throw new RangeError('replay size');
  const r=JSON.parse(text);
  if (!r || Object.keys(r).sort().join()!=='commands,eventHash,seed,source,stateHash,ticks' ||
      r.source!==SOURCE || !Number.isInteger(r.ticks) || r.ticks<0 || r.ticks>LIMIT ||
      !Array.isArray(r.commands) || r.commands.length>r.ticks ||
      (r.ticks>0 && r.commands[0]?.[0]!==0)) throw new Error('invalid replay header');
  let prior=-1,previous=-1;
  for (const pair of r.commands) {
    if (!Array.isArray(pair) || pair.length!==2 || !Number.isInteger(pair[0]) ||
        pair[0]<=prior || pair[0]>=r.ticks || !Number.isInteger(pair[1]) ||
        pair[1]<0 || pair[1]>2047 || pair[1]===previous) throw new Error('invalid replay command');
    [prior,previous]=pair;
  }
  const w=createWorld({seed:r.seed});
  let j=0,cmd=0;
  for (let i=0;i<r.ticks;i++) {
    if (r.commands[j]?.[0]===i) cmd=r.commands[j++][1];
    step(w,cmd);
  }
  const got=receipt(w);
  if (got.ticks!==r.ticks || got.stateHash!==r.stateHash || got.eventHash!==r.eventHash)
    throw new Error('replay diverged');
  return w;
}
