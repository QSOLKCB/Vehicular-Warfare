import {createWorld,step,receipt,K,siteClear} from '../sim/world.js';
import {mission,enemyIds,zone} from '../sim/missions.js';
import {Clock} from '../sim/clock.js';
import {View} from './view.js';

const el=id=>document.getElementById(id);
const canvas=el('valley'), station=el('station'), clock=new Clock();
const keys={KeyR:K.up,KeyF:K.down,KeyW:K.forward,KeyS:K.back,KeyA:K.left,KeyD:K.right,
  ArrowLeft:K.yawLeft,ArrowRight:K.yawRight,ArrowUp:K.aimUp,ArrowDown:K.aimDown,Space:K.fire};
const selectedWorld=()=>createWorld({seed:mission(el('sortie').value).seed},el('sortie').value);
let world=selectedWorld(),mode='briefing',camera='chase',view=null,session=null,raf=0;
let held=0,trigger=false,mouseTurn=0,mouseTilt=0,lastFrame=null;
let frames=[],costs=[],peaks=0,lastDraw=null,retired=0,disposals=0;
const keep=(list,value,limit)=>{if(list.length===limit) list.shift(); list.push(value);};
function clearInput(){
  held=0; trigger=false; mouseTurn=0; mouseTilt=0; clock.reset(); lastFrame=null;
}
function dispose(){
  cancelAnimationFrame(raf); raf=0; clearInput();
  session?.abort(); session=null;
  if(document.pointerLockElement===canvas) document.exitPointerLock();
  if(view){
    const renderer=view.r;
    view.dispose(); retired=renderer.meshes.size; disposals++;
    view=null;
  }
}
function panel(state,title,desc,action){
  mode=state; station.dataset.mode=mode;
  el('panel').hidden=false; el('hud').hidden=true; el('guide').open=false;
  el('chapter').textContent=state==='briefing'?'MISSION 001 / RIDGE SECTOR':
    state==='paused'?'FLIGHT SUSPENDED':state==='error'?'FLIGHT STATION':'MISSION DEBRIEF';
  el('title').textContent=title; el('desc').textContent=desc;
  el('primary').firstChild.textContent=action+' ';
  el('sortieLabel').hidden=state!=='briefing';
  el('menu').hidden=!['paused','victory','defeat'].includes(state);
  el('again').hidden=state!=='paused';
  el('save').hidden=!['paused','victory','defeat'].includes(state);
  el('footerLeft').textContent=mission(el('sortie').value).name.toUpperCase();
  el('footerRight').textContent='QSOL–IMC　 /　VW–001';
}
function failure(message){
  dispose(); panel('error','Flight offline',message,'Retry WebGL');
}
function pause(){
  if(mode!=='flying') return;
  dispose();
  panel('paused','Holding','Flight paused. Resume with neutral controls or start a new sortie.','Resume flight');
}
function setCamera(){
  camera=camera==='chase'?'cockpit':'chase';
  el('camera').textContent=camera==='chase'?'Chase view':'Cockpit view';
  el('canopy').hidden=camera!=='cockpit';
}
function listen(){
  session=new AbortController();
  const on=(target,event,fn)=>target.addEventListener(event,fn,{signal:session.signal});
  on(window,'keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||e.repeat) return;
    if(Object.hasOwn(keys,e.code)) { e.preventDefault(); held|=keys[e.code]; }
    if(e.code==='KeyC') setCamera();
    if(['Escape','KeyP'].includes(e.code)) pause();
  });
  on(window,'keyup',e=>{if(Object.hasOwn(keys,e.code)){held&=~keys[e.code];e.preventDefault();}});
  on(canvas,'pointerdown',e=>{if(e.button===0) trigger=true;});
  on(window,'pointerup',()=>{trigger=false;});
  on(canvas,'contextmenu',e=>{
    e.preventDefault();
    if(canvas.requestPointerLock) canvas.requestPointerLock()?.catch(()=>{});
  });
  on(document,'pointerlockchange',()=>{if(document.pointerLockElement!==canvas) pause();});
  on(document,'mousemove',e=>{
    if(document.pointerLockElement===canvas) {
      mouseTurn=Math.max(-20,Math.min(20,mouseTurn+e.movementX));
      mouseTilt=Math.max(-20,Math.min(20,mouseTilt-e.movementY));
    }
  });
  on(window,'blur',pause); on(window,'pointercancel',pause);
  on(document,'visibilitychange',()=>{if(document.hidden) pause();});
}
function begin(fresh){
  dispose();
  if(fresh) {
    world=selectedWorld(); camera='chase'; frames=[]; costs=[]; peaks=0;
    el('camera').textContent='Chase view'; el('canopy').hidden=true;
  }
  try { view=new View(canvas,world); }
  catch(e) { failure(e.message); return; }
  mode='flying'; station.dataset.mode=mode;
  el('panel').hidden=true; el('hud').hidden=false;
  document.activeElement?.blur();
  el('footerLeft').textContent='R/F LIFT　 WASD CYCLIC　 ← → TURN　 SPACE FIRE';
  el('footerRight').textContent='C VIEW　 P PAUSE';
  listen(); raf=requestAnimationFrame(frame);
}
function hud(d){
  const p=world.player;
  el('health').textContent=p.hp+'%'; el('ammo').textContent=String(p.ammo).padStart(2,'0');
  el('alt').textContent=Math.round(p.p[1])+' / '+Math.round(p.p[1]-world.field.sample(p.p[0],p.p[2]).height)+' m';
  el('heading').textContent=String((Math.round(p.yaw*180/Math.PI)%360+360)%360).padStart(3,'0')+'°';
  const site=zone(world),ids=enemyIds(world);
  if(site){
    const [name,x,z,kinds]=site, spec=mission(world.route.id);
    const dx=x-p.p[0],dz=z-p.p[2],dist=Math.round(Math.hypot(dx,dz));
    const bearing=(Math.round(Math.atan2(dx,-dz)*180/Math.PI)+360)%360;
    const left=kinds.filter((kind,i)=>world[kind+'-'+(world.route.site+1)+'-'+(i+1)].hp).length;
    const goal=left?left+' patrols remaining':spec.hold===1?'Cross beacon below 34 m AGL':
      'Hold below 34 m AGL · '+(world.route.hold/120).toFixed(1)+' / 3 s';
    el('objectives').textContent=(world.route.site+1)+'/'+spec.sites.length+'  '+name+'\n'+goal+'\n'+dist+' m  ·  '+bearing+'°';
  }else if(!world.route){
    el('objectives').textContent=(world.aa.hp?'◇':'✓')+'  AA emplacement\n'+(world.convoy.hp?'◇':'✓')+'  Convoy carrier';
  }
  const modes=ids.map(id=>world[id].mode);
  const warning=modes.some(m=>m==='firing'||m==='tracking')?'TRACKED':
    modes.includes('acquiring')?'EXPOSED':modes.includes('search')?'SEARCHING':'MASKED';
  el('threat').textContent=warning;
  const ret=el('reticle'); ret.hidden=d.x<0||d.x>1||d.y<0||d.y>1;
  ret.style.left=d.x*100+'%';ret.style.top=d.y*100+'%';
  el('mark').textContent=d.target?.toUpperCase()??'';
}
function frame(now){
  raf=0;
  if(lastFrame!==null) keep(frames,now-lastFrame,1024);
  lastFrame=now;
  clock.frame(now,()=>{
    if(world.status!=='flying') return;
    let cmd=held|(trigger?K.fire:0);
    if(Math.abs(mouseTurn)>=1){cmd|=mouseTurn>0?K.yawRight:K.yawLeft;mouseTurn-=Math.sign(mouseTurn);}
    if(Math.abs(mouseTilt)>=1){cmd|=mouseTilt>0?K.aimUp:K.aimDown;mouseTilt-=Math.sign(mouseTilt);}
    const start=performance.now(); step(world,cmd);
    keep(costs,performance.now()-start,2048);peaks=Math.max(peaks,world.shots.length);
  });
  lastDraw=view.render(world,camera); hud(lastDraw);
  if(world.status==='flying'){ raf=requestAnimationFrame(frame); return; }
  dispose();
  const won=world.status==='victory';
  panel(world.status,won?'Valley secured':'Mission lost',
    (won?(world.route?'All crossings secured.':'Both ground units destroyed.'):world.reason[0].toUpperCase()+world.reason.slice(1)+'.')+
    '　'+world.score+' points · '+(world.tick/120).toFixed(1)+' s','Fly again');
}
function briefing(){
  dispose();
  world=selectedWorld();
  const spec=mission(el('sortie').value);
  panel('briefing','RIDGEFIRE',spec.brief,'Launch mission');
  el('chapter').textContent=spec.name.toUpperCase()+' / MISSION BRIEFING';
  try{
    view=new View(canvas,world);
    lastDraw=view.render(world,camera,true);
  }catch(e){failure(e.message);}
}
el('sortie').addEventListener('change',briefing);
el('menu').addEventListener('click',briefing);
el('primary').addEventListener('click',()=>begin(mode!=='paused'));
el('again').addEventListener('click',()=>begin(true));
el('save').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(receipt(world))],{type:'application/json'}));
  const a=document.createElement('a'); a.href=url;a.download='ridgefire-'+world.tick+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});
el('camera').addEventListener('click',setCamera);el('pause').addEventListener('click',pause);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();failure('WebGL context lost. Restore the context and retry the flight.');});
window.addEventListener('resize',()=>{if(mode==='briefing' && view) view.render(world,camera,true);});
window.addEventListener('pagehide',()=>{if(mode==='flying') pause(); else dispose();});
window.addEventListener('pageshow',e=>{if(e.persisted && mode==='briefing') briefing();});

// Detached snapshots for local review tooling. No control or state mutation API.
export function inspect(){
  return structuredClone({mode,camera,held,trigger,tick:world.tick,status:world.status,reason:world.reason,
    hp:world.player.hp,ammo:world.player.ammo,position:world.player.p,aa:world.aa,convoy:world.convoy,
    route:world.route,site:zone(world),clear:world.route?siteClear(world):false,velocity:world.player.v,
    events:world.events,receipt:receipt(world),metrics:{frames,costs,peaks,lastDraw,
      actors:enemyIds(world).length+1,buffers:view?.r.meshes.size??0,geometryBytes:view?.bytes??0,retired,disposals,
      rafActive:Boolean(raf),sessionActive:Boolean(session)}});
}
briefing();
