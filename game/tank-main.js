import {Clock,HZ} from '../sim/clock.js';
import {createTankWorld,stepTank,tankReceipt,replayTank,TK,TANK_LIMIT} from '../sim/tank-world.js';
import {TankView} from './tank-view.js';

const el=id=>document.getElementById(id);
const canvas=el('battlefield'),station=el('station'),clock=new Clock();
const controls={KeyW:TK.forward,KeyS:TK.back,KeyA:TK.left,KeyD:TK.right,
  ShiftLeft:TK.brake,ShiftRight:TK.brake,ArrowLeft:TK.turretLeft,ArrowRight:TK.turretRight,
  ArrowUp:TK.elevate,ArrowDown:TK.depress,Space:TK.fire};
const pressed=new Set();
let world=createTankWorld(),mode='briefing',camera='chase',view=null,session=null,raf=0;
let held=0,trigger=false,mouseX=0,mouseY=0,lastFrame=null;
let lastDraw=null,retired=0,peaks=0;
const frames=[],costs=[],viewMs=[];
const keep=(list,value)=>{if(list.length===1024)list.shift();list.push(value);};
function dispose(){
  cancelAnimationFrame(raf);raf=0;session?.abort();session=null;
  if(document.pointerLockElement===canvas)document.exitPointerLock();
  pressed.clear();held=0;trigger=false;mouseX=mouseY=0;
  clock.reset();lastFrame=null;
  if(view){view.dispose();retired=view.r.meshes.size;view=null;}
}
function panel(state,title,description,action){
  mode=state;station.dataset.mode=state;
  el('panel').hidden=false;el('hud').hidden=true;el('guide').open=false;
  el('title').textContent=title;el('desc').textContent=description;
  el('chapter').textContent=state==='paused'?'DRIVE SUSPENDED':state==='error'?'GROUND STATION':'MISSION DEBRIEF';
  el('primary').firstChild.textContent=action+' ';
  el('again').hidden=state!=='paused';
  el('save').hidden=!['victory','defeat','paused'].includes(state);
}
function errorPanel(error){
  dispose();panel('error','Display offline',error.message,'Retry');
}
function pause(){
  if(mode!=='playing')return;
  dispose();panel('paused','Holding','Controls neutral. Resume at your current position or restart the sortie.','Resume');
}
function setCamera(){
  camera=camera==='sight'?'chase':'sight';
  el('camera').textContent=camera==='chase'?'Gun sight':'Chase view';
}
function listen(){
  session=new AbortController();
  const on=(target,name,fn)=>target.addEventListener(name,fn,{signal:session.signal});
  on(window,'keydown',e=>{
    if(e.ctrlKey||e.altKey||e.metaKey)return;
    if(Object.hasOwn(controls,e.code)){
      e.preventDefault();pressed.add(e.code);held|=controls[e.code];return;
    }
    if(e.repeat)return;
    if(e.code==='KeyC')setCamera();
    if(e.code==='KeyP'||e.code==='Escape'){e.preventDefault();pause();}
  });
  on(window,'keyup',e=>{
    if(!pressed.delete(e.code))return;
    held=0;for(const code of pressed)held|=controls[code];
    e.preventDefault();
  });
  on(canvas,'pointerdown',e=>{if(e.button===0)trigger=true;});
  on(window,'pointerup',e=>{if(e.button===0)trigger=false;});
  on(canvas,'contextmenu',e=>{
    e.preventDefault();
    canvas.requestPointerLock?.()?.catch(()=>{});
  });
  on(document,'pointerlockchange',()=>{
    if(document.pointerLockElement!==canvas)pause();
  });
  on(document,'mousemove',e=>{
    if(document.pointerLockElement!==canvas)return;
    mouseX=Math.max(-24,Math.min(24,mouseX+e.movementX));
    mouseY=Math.max(-24,Math.min(24,mouseY+e.movementY));
  });
  on(window,'blur',pause);on(window,'pointercancel',pause);
  on(document,'visibilitychange',()=>{if(document.hidden)pause();});
}
function hud(){
  const p=world.player,s=lastDraw.sight;
  el('health').textContent=p.hp+'%';el('ammo').textContent=String(p.ammo).padStart(2,'0');
  el('speed').textContent=p.speed.toFixed(1)+' m/s';
  el('belts').textContent='L '+p.leftSpeed.toFixed(1)+' / R '+p.rightSpeed.toFixed(1);
  const wait=Math.max(0,p.ready-world.tick);
  el('reload').textContent=!p.ammo?'EMPTY':!lastDraw.clear?'BLOCKED':wait?(wait/HZ).toFixed(1)+'s':'READY';
  el('heading').textContent=String((Math.round(p.turretYaw*180/Math.PI)+360)%360).padStart(3,'0')+'°';
  const seconds=Math.ceil((TANK_LIMIT-world.tick)/HZ),time=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  const exposed=lastDraw.exposure;
  const cover=exposed.hull?'Hull exposed':exposed.turret?'Hull-down · turret exposed':'In cover';
  el('objectives').textContent='Destroy relay guard · '+time+'\n'+cover;
  el('contact').textContent='GUNNER SIGHT  /  '+(s.hull?'GUARD HULL':s.turret?'GUARD TURRET':'MASKED');
  const aim=el('aimPoint');aim.hidden=!lastDraw.aimVisible;
  aim.style.left=100*lastDraw.x+'%';aim.style.top=100*lastDraw.y+'%';
  let message='';
  for(let i=world.events.length-1;i>=0;i--){
    const event=world.events[i];if(world.tick-event.tick>110)break;
    if(event.type==='damage'){
      message=(event.target==='player'?'BASALT':'GUARD')+' '+event.component.toUpperCase()+
        ' · '+event.plate.toUpperCase()+' HIT −'+event.amount;
      break;
    }
    if(event.type==='impact' && event.source==='player' && event.target==='terrain'){
      message='ROUND STRUCK TERRAIN';break;
    }
  }
  el('message').textContent=message;
}
function frame(now){
  raf=0;
  if(lastFrame!==null)keep(frames,now-lastFrame);
  lastFrame=now;
  clock.frame(now,()=>{
    if(world.status!=='driving')return;
    let cmd=held|(trigger?TK.fire:0);
    if(Math.abs(mouseX)>=1){cmd|=mouseX>0?TK.turretRight:TK.turretLeft;mouseX-=Math.sign(mouseX);}
    if(Math.abs(mouseY)>=1){cmd|=mouseY>0?TK.depress:TK.elevate;mouseY-=Math.sign(mouseY);}
    const start=performance.now();stepTank(world,cmd);keep(costs,performance.now()-start);
    peaks=Math.max(peaks,world.shots.length);
  });
  try{
    const start=performance.now();lastDraw=view.draw(world,camera);keep(viewMs,performance.now()-start);hud();
  }catch(error){errorPanel(error);return;}
  if(world.status==='driving'){raf=requestAnimationFrame(frame);return;}
  dispose();
  const won=world.status==='victory';
  panel(world.status,won?'Relay secured':'Sortie lost',
    (won?'Guard disabled':world.reason)+' · '+world.score+' points · '+(world.tick/HZ).toFixed(1)+' s','Deploy again');
}
function begin(fresh){
  dispose();
  if(fresh){
    world=createTankWorld();camera='chase';el('camera').textContent='Gun sight';
    frames.length=costs.length=viewMs.length=0;peaks=0;
  }
  try{view=new TankView(canvas,world);}
  catch(error){errorPanel(error);return;}
  mode='playing';station.dataset.mode=mode;el('panel').hidden=true;el('hud').hidden=false;
  document.activeElement?.blur();listen();raf=requestAnimationFrame(frame);
}
function preview(){
  try{view??=new TankView(canvas,world);lastDraw=view.draw(world,'briefing');}
  catch(error){errorPanel(error);}
}
el('primary').addEventListener('click',()=>begin(mode!=='paused'));
el('again').addEventListener('click',()=>begin(true));el('pause').addEventListener('click',pause);
el('camera').addEventListener('click',setCamera);
el('save').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(tankReceipt(world))],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='cutbank-'+world.tick+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});
el('checkFile').addEventListener('change',async event=>{
  const input=event.currentTarget,file=input.files[0];if(!file)return;
  input.disabled=true;
  try{
    if(file.size>300000)throw Error('Replay exceeds the size limit');
    const w=replayTank(await file.text());
    el('checkResult').textContent='Verified · Cutbank Relay · '+(w.tick/HZ).toFixed(2)+' s · '+w.status;
  }catch(error){el('checkResult').textContent='Could not verify this sortie. '+error.message;}
  finally{input.disabled=false;input.value='';}
});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();errorPanel(Error('WebGL context lost. Restore the context and retry.'));});
window.addEventListener('resize',()=>{if(mode==='briefing')preview();});
window.addEventListener('pagehide',()=>{if(mode==='playing')pause();else dispose();});
window.addEventListener('pageshow',e=>{if(e.persisted && mode==='briefing')preview();});

// Detached snapshots for local acceptance tooling.
export function inspect(){
  return structuredClone({mode,camera,tick:world.tick,status:world.status,reason:world.reason,
    score:world.score,held,trigger,player:world.player,enemy:world.enemy,events:world.events,
    sight:lastDraw?.sight,shots:world.shots,receipt:tankReceipt(world),
    metrics:{frames,costs,viewMs,lastDraw,peaks,actors:2,buffers:view?.r.meshes.size??0,
      rafActive:Boolean(raf),sessionActive:Boolean(session),retired}});
}
preview();
