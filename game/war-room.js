import {sight} from '../sim/terrain.js';
import {vehicleGun} from '../sim/combined-vehicles.js';
import {Clock,HZ} from '../sim/clock.js';
import {COMBINED_LIMIT,REQUIRED_DEFENDERS} from '../sim/combined-world.js';
import {commandContacts,MAX_COMMAND_REPLAY_BYTES} from '../sim/command-world.js';
import {FORMATION_REPLAY_BYTES} from '../sim/formation-world.js';
import {commandScenarios} from './command-scenarios.js';
import {CombinedView} from './combined-view.js';
import {StrategicMap,crewName} from './strategic-map.js';
import {CreatorMusic} from './creator-music.js';
import {directorSubject,directorAngle,directorPose} from './battle-director.js';

const scenarioKey=new URLSearchParams(location.search).get('scenario')??'classic';
const scenario=Object.hasOwn(commandScenarios,scenarioKey)?commandScenarios[scenarioKey]:commandScenarios.classic;
const {createWorld:createCommandWorld,issueOrder,step:stepCommand,receipt:commandReceipt,openReplay:openCommandReplay}=scenario;
const replayLimit=scenario===commandScenarios.classic?MAX_COMMAND_REPLAY_BYTES:FORMATION_REPLAY_BYTES;
const el=id=>document.getElementById(id);
const canvas=el('strategy'),battle=el('battlefield'),panel=el('panel');
const clock=new Clock(),selected=new Set(),groups=new Map(),roster=new Map();
const listeners=new AbortController();
const on=(node,type,fn,opts={})=>node.addEventListener(type,fn,{...opts,signal:listeners.signal});
let world=createCommandWorld(),map=new StrategicMap(canvas,world);
let mode='briefing',screen='map',camera='overview',raf=0,lastFrame=null,view=null,music=null;
let drag=null,loading=null,contactKey,contextLost=false;
let heldFrame=null,subjectKey='',sweepStart=null,lastDirector=null;
const director=el('directorTools');
const metrics={frames:[],mapMs:[],sceneMs:[],tickMs:[],orderMs:[],draws:0,lastDraw:null};
const sample=(values,n)=>{if(values.length===240)values.shift();values.push(n);};
const friendly=()=>world.actors.filter(a=>a.faction==='cobalt');
function visibleActors(){
  const contacts=commandContacts(world);
  return world.actors.filter(a=>a.hp && (a.faction==='cobalt' || contacts.includes(a.id)));
}
function cameraCrew(){
  return world.actors.find(a=>a.hp && selected.has(a.id)) ?? friendly().find(a=>a.hp) ?? world.player;
}

function presentation(visible,player=cameraCrew()){
  const ids=new Set(visible.map(a=>a.id));
  // Hide tracer paths and debris when their origin or struck unit is hidden.
  // Combat always uses the full, unfiltered authority.
  const known=id=>ids.has(id) || ['terrain','boundary','water'].includes(id);
  const eyes=visible.filter(a=>a.faction==='cobalt').map(a=>vehicleGun(a).pivot);
  function observedPoint(point){
    if(!point)return false;
    return eyes.some(eye=>{
      const delta=point.map((v,i)=>v-eye[i]);
      return Math.hypot(...delta)<=100 && sight(world.field,eye,point) && !world.water.castSegment(eye,delta);
    });
  }
  const shots=world.shots.filter(s=>ids.has(s.owner) && observedPoint(s.p));
  const events=world.events.filter(e=>world.tick-e.tick<=108 && known(e.owner??e.source) &&
    (!e.target || known(e.target)) && observedPoint(e.point));
  const {tick,seed,field,water,beacon,captured,status}=world;
  // The fixed relay site is on the briefing chart. Its hidden health and
  // mount pose are unavailable to the overview camera and beacon display.
  const relay=visible.find(a=>a.kind==='relay') ??
    {p:world.relay.p,half:world.relay.half,hp:captured?0:1};
  return {tick,seed,field,water,beacon,captured,status,relay,actors:visible,player,selection:player.kind,shots,events};
}
function releaseView(){view?.dispose();view=null;}
function cancelDrag(){
  const id=drag?.id;drag=null;
  if(id!==undefined && canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
}
function clearSession(){
  cancelAnimationFrame(raf);raf=0;clock.reset();lastFrame=null;
  cancelDrag();releaseView();music?.dispose();music=null;
}
function abortImport(){loading?.abort();loading=null;el('openReplay').value='';}
function box(){
  return drag?.button===0 && drag.moved ? [drag.x,drag.y,drag.u-drag.x,drag.v-drag.y]:null;
}
function liveMusic(visible){
  if(el('music').checked && mode==='live'){
    try{
      const w=presentation(visible);
      if(!music)music=new CreatorMusic(w);
      else music.update(w);
    }catch(error){el('music').checked=false;el('feedback').textContent=error.message;}
  }else if(music){music.dispose();music=null;}
}

function setSelected(ids,additive=false){
  if(!additive)selected.clear();
  for(const a of friendly())if(a.hp && ids.includes(a.id))selected.add(a.id);
  updateUi(visibleActors());
}
function selectOne(id,toggle){
  if(toggle && selected.has(id)){selected.delete(id);updateUi(visibleActors());}
  else setSelected([id],toggle);
}
function orderLabel(u){
  const head=u.queue[0],last=u.lastResult;
  if(!head)return u.status+(last ? ' · '+last.reason : '');
  const metres=Number.isFinite(u.distance)?' · '+Math.round(u.distance)+' m':'';
  const route=head.route?.length>1?' · '+head.route.length+' legs':'';
  const queued=u.queue.length>1?' · '+(u.queue.length-1)+' queued':'';
  const history=last?' · last '+last.type+' '+last.status:'';
  return head.type+' · '+(u.onStation?'on station':u.status)+metres+route+queued+history;
}
function initRoster(){
  const rows=[];
  roster.clear();
  for(const a of friendly()){
    const button=document.createElement('button'),name=document.createElement('b');
    const hp=document.createElement('em'),state=document.createElement('span');
    button.type='button';button.className='unit';button.dataset.unit=a.id;
    name.textContent=crewName(a)+' / '+a.kind;
    button.append(name,hp,state);rows.push(button);roster.set(a.id,{button,hp,state});
  }
  el('roster').replaceChildren(...rows);
}
function changeText(node,text){if(node.textContent!==text)node.textContent=text;}
function updateUi(visible){
  for(const a of friendly()){
    if(!a.hp)selected.delete(a.id);
    const r=roster.get(a.id);
    r.button.disabled=!a.hp;
    r.button.setAttribute('aria-pressed',String(selected.has(a.id)));
    changeText(r.hp,a.hp+' HP');changeText(r.state,orderLabel(world.units[a.id]));
  }
  const enemies=visible.filter(a=>a.faction==='ember'),key=enemies.map(a=>a.id).join(',');
  if(key!==contactKey){
    contactKey=key;
    const previous=el('contact').value;
    el('contact').replaceChildren(...enemies.map(a=>new Option(a.id,a.id)));
    if(enemies.some(a=>a.id===previous))el('contact').value=previous;
  }
  const sec=Math.ceil((COMBINED_LIMIT-world.tick)/HZ);
  changeText(el('clock'),String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0'));
  const relay=visible.some(a=>a.kind==='relay')?'online':world.captured?'disabled':'unconfirmed';
  changeText(el('objective'),'Shore relay '+relay+' · Crossing '+
    (world.captured?'secured':'open objective')+' · '+world.mobileKills+'/'+REQUIRED_DEFENDERS+' mobile defenders disabled');
}
function draw(){
  const visible=visibleActors();
  if(screen==='map'){
    const t=performance.now();map.draw(world,visible,selected,box(),el('retro').checked);
    sample(metrics.mapMs,performance.now()-t);
  }else{
    const t=performance.now();
    let subject,pose;
    if(camera==='director'){
      const crews=visible.filter(a=>a.faction==='cobalt');
      const key=crews.map(a=>a.id).join(',');
      const picker=el('directorSubject');
      if(subjectKey!==key){
        const pin=picker.value;
        picker.replaceChildren(new Option('Current selection',''),...crews.map(a=>new Option(a.id,a.id)));
        picker.value=crews.some(a=>a.id===pin)?pin:'';
        subjectKey=key;
      }
      subject=directorSubject(crews,picker.value,selected);
      const bearing=directorAngle(el('bearing').valueAsNumber,world.tick,sweepStart);
      const tilt=el('tilt').valueAsNumber,range=el('range').valueAsNumber;
      pose=directorPose(world,subject,bearing,tilt,range);
      changeText(el('bearingText'),Math.round(bearing)+'°');
      changeText(el('tiltText'),tilt+'°');changeText(el('rangeText'),range+' m');
      const reading=subject?subject.id+' · '+subject.hp+' HP':'Crossing';
      changeText(el('directorReadout'),reading+' · tick '+world.tick);
      lastDirector={subject:subject?.id??null,eye:pose.eye,bearing,tilt,range,tick:world.tick};
    }
    const shell=presentation(visible,subject??cameraCrew());
    view??=new CombinedView(battle,shell,{retro:el('retro').checked,fx:el('fx').checked,crewSets:world.crewSets??1});
    view.setRetro(el('retro').checked);view.fx=el('fx').checked;
    metrics.lastDraw=view.draw(shell,camera,pose);
    metrics.draws=metrics.lastDraw.draws;
    sample(metrics.sceneMs,performance.now()-t);
  }
  updateUi(visible);liveMusic(visible);
}
function showScreen(next){
  releaseView();cancelDrag();
  screen=next;
  const observing=next==='observation';
  canvas.hidden=observing;battle.hidden=!observing;
  el('theatreMap').hidden=!observing;el('mapTools').hidden=observing;el('camera').hidden=!observing;
  el('camera').value=camera;el('tab').textContent=observing?'Return to map':'Observe in 3D';
  director.hidden=!observing || camera!=='director';
}
function dialog(next,text){
  clearSession();mode=next;
  const names={briefing:scenario.title??'The War Room',paused:'Command paused',debrief:world.status==='victory'?'Crossing secured':'Operation ended',
    verified:'Replay verified'};
  el('panelTitle').textContent=names[next];if(text)el('panelText').textContent=text;
  el('primary').textContent=next==='paused'?'Resume command':next==='briefing'?'Deploy crews':'New mission';
  el('inspectFrame').hidden=next==='briefing' || contextLost;
  el('restart').hidden=next!=='paused';el('save').hidden=next==='briefing';
  if(!panel.open)panel.showModal();
}
// Hold the accepted world while inspecting a paused, verified or terminal tick.
function inspectHeld(){
  if(!['paused','verified','debrief'].includes(mode) || contextLost)return;
  if(loading){
    abortImport();
    el('report').textContent='Replay verification cancelled.';
  }
  heldFrame={mode,screen,camera,text:el('panelText').textContent};
  panel.close();mode='inspection';camera='director';
  document.body.classList.add('inspecting');
  showScreen('observation');
  el('camera').hidden=true;el('expand').hidden=true;el('pause').hidden=true;
  el('directorSweep').disabled=true;
  el('tab').textContent='Return to '+({paused:'pause',verified:'replay',debrief:'debrief'})[heldFrame.mode];
  el('tab').focus();
  drawHeld();
}
function closeHeld(){
  if(!heldFrame)return;
  const previous=heldFrame;
  heldFrame=null;document.body.classList.remove('inspecting');
  el('expand').hidden=false;el('pause').hidden=false;el('directorSweep').disabled=false;
  camera=previous.camera;showScreen(contextLost?'map':previous.screen);
  dialog(previous.mode,previous.text);
}
function drawHeld(){
  if(!heldFrame || raf)return;
  raf=requestAnimationFrame(()=>{
    raf=0;
    try{draw();}
    catch(error){closeHeld();el('report').textContent=error.message;}
  });
}
function pause(reason='Your crews are standing by.'){
  if(heldFrame)closeHeld();
  else if(mode==='live')dialog('paused',reason);
}
function frame(now){
  raf=0;
  if(mode!=='live')return;
  if(lastFrame!==null)sample(metrics.frames,now-lastFrame);lastFrame=now;
  try{
    clock.frame(now,()=>{
      if(world.status!=='active')return;
      const start=performance.now();stepCommand(world);sample(metrics.tickMs,performance.now()-start);
    });
    draw();
    if(world.status!=='active'){
      dialog('debrief',world.reason+' · '+world.score+' points · '+world.tick+' accepted ticks.');return;
    }
    raf=requestAnimationFrame(frame);
  }catch(error){
    showScreen('map');pause('Display interrupted. '+error.message);
  }
}
function start(fresh){
  clearSession();abortImport();
  if(fresh){
    el('directorSubject').value='';el('directorSweep').checked=false;sweepStart=null;
    el('bearing').value='40';el('tilt').value='19';el('range').value='18';lastDirector=null;
    const oldSeed=world.seed;
    world=createCommandWorld();
    if(world.seed!==oldSeed)map=new StrategicMap(canvas,world);
    selected.clear();groups.clear();contactKey=undefined;camera='overview';
    map.cx=-6;map.cz=0;map.zoom=2.2;showScreen('map');
    for(const n of ['frames','mapMs','sceneMs','tickMs','orderMs'])metrics[n].length=0;
    metrics.lastDraw=null;metrics.draws=0;
    el('feedback').textContent='Select a crew to issue orders.';
  }
  panel.close();el('report').textContent='';mode='live';
  (screen==='map'?canvas:battle).focus({preventScroll:true});
  frame(performance.now());
}
function toggleView(next,follow=false){
  if(mode!=='live')return;
  if(next==='observation' && contextLost){
    el('feedback').textContent='3D display is restoring. The command map is available.';return;
  }
  if(follow)camera='chase';
  showScreen(next);(next==='map'?canvas:battle).focus({preventScroll:true});
}
function give(order,append){
  if(mode!=='live')return;
  const t=performance.now();
  try{
    const accepted=issueOrder(world,{tick:world.tick,units:[...selected],append,...order});
    el('feedback').textContent=accepted.type+(append?' queued for ':' issued to ')+accepted.units.map(id=>crewName(world.actors.find(a=>a.id===id))).join(', ')+'.';
  }catch(error){el('feedback').textContent='Order rejected. '+error.message;}
  sample(metrics.orderMs,performance.now()-t);updateUi(visibleActors());
}
function group(n,store){
  if(mode!=='live')return;
  if(store)groups.set(n,[...selected]);
  else setSelected(groups.get(n)??[]);
  el('feedback').textContent='Group '+n+(store?' assigned':' recalled')+' · '+selected.size+' selected.';
}
function xy(e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
function zoom(factor){
  map.zoomAt(canvas.clientWidth/2,canvas.clientHeight/2,factor);
}

on(canvas,'pointerdown',e=>{
  if(mode!=='live' || drag || e.button>2)return;
  const [x,y]=xy(e);
  e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
  drag={id:e.pointerId,button:e.button,x,y,u:x,v:y,shift:e.shiftKey,moved:false};
});
on(canvas,'pointermove',e=>{
  if(!drag || drag.id!==e.pointerId)return;
  const [u,v]=xy(e);
  if(drag.button===1)map.pan(u-drag.u,v-drag.v);
  drag.moved ||= Math.hypot(u-drag.x,v-drag.y)>4;
  drag.u=u;drag.v=v;
});
on(canvas,'pointerup',e=>{
  if(!drag || drag.id!==e.pointerId)return;
  const d=drag,[u,v]=xy(e);cancelDrag();
  if(mode!=='live')return;
  const visible=visibleActors();
  if(d.button===2){
    const target=map.hit(visible.filter(a=>a.faction==='ember'),u,v);
    const [x,z]=map.transform().world(u,v);
    give(target?{type:'ATTACK',target:target.id}:{type:'MOVE',x,z},d.shift);
  }else if(d.button===0){
    const own=visible.filter(a=>a.faction==='cobalt');
    if(Math.hypot(d.x-u,d.y-v)>4){
      const tr=map.transform(),ids=own.filter(a=>{
        const [x,y]=tr.screen(a.p[0],a.p[2]);
        return x>=Math.min(d.x,u) && x<=Math.max(d.x,u) && y>=Math.min(d.y,v) && y<=Math.max(d.y,v);
      }).map(a=>a.id);
      setSelected(ids,d.shift);
    }else{
      const actor=map.hit(own,u,v);
      if(actor)selectOne(actor.id,d.shift);
      else if(!d.shift)setSelected([]);
    }
  }
});
on(canvas,'contextmenu',e=>e.preventDefault());
on(canvas,'pointercancel',()=>pause('Pointer cancelled. Resume to continue.'));
on(canvas,'lostpointercapture',e=>{if(drag?.id===e.pointerId)cancelDrag();});
on(canvas,'wheel',e=>{
  if(mode!=='live')return;
  e.preventDefault();
  const [u,v]=xy(e);map.zoomAt(u,v,Math.exp(-Math.sign(e.deltaY)*.15));
},{passive:false});
on(el('more'),'click',()=>zoom(1.25));on(el('less'),'click',()=>zoom(.8));
on(el('fit'),'click',()=>{map.cx=0;map.cz=0;map.zoom=1;});
on(el('roster'),'click',e=>{
  const b=e.target.closest('.unit');
  if(mode==='live' && b)selectOne(b.dataset.unit,e.shiftKey || Boolean(el('multiSelect')?.checked));
});
on(el('roster'),'keydown',e=>{
  if(e.shiftKey && ['Space','Enter'].includes(e.code) && mode==='live'){
    const b=e.target.closest('.unit');
    if(b){e.preventDefault();selectOne(b.dataset.unit,true);}
  }
});
on(el('all'),'click',()=>setSelected(friendly().filter(a=>a.hp).map(a=>a.id)));
on(el('type'),'change',()=>{
  const type=el('type').value;
  const coords=['MOVE','DEFEND'].includes(type);
  el('coords').hidden=!coords;el('east').disabled=!coords;el('south').disabled=!coords;
  el('contactLabel').hidden=type!=='ATTACK';
});
on(el('orderForm'),'submit',e=>{
  e.preventDefault();const type=el('type').value,order={type};
  if(type==='MOVE' || type==='DEFEND'){order.x=el('east').valueAsNumber;order.z=el('south').valueAsNumber;}
  if(type==='ATTACK')order.target=el('contact').value;
  give(order,el('append').checked);
});
on(el('expand'),'click',()=>{
  const expanded=document.body.classList.toggle('expanded');
  el('expand').setAttribute('aria-pressed',String(expanded));
  el('expand').textContent=expanded?'Show roster':'Expand chart';
});
on(el('tab'),'click',()=>heldFrame?closeHeld():toggleView(screen==='map'?'observation':'map'));
on(el('inspectFrame'),'click',inspectHeld);
on(el('directorSubject'),'change',drawHeld);
for(const id of ['bearing','tilt','range'])on(el(id),'input',drawHeld);
on(el('directorSweep'),'change',()=>{
  if(el('directorSweep').checked)sweepStart=world.tick;
  else{
    el('bearing').value=Math.round(directorAngle(el('bearing').valueAsNumber,world.tick,sweepStart));
    sweepStart=null;
  }
});
on(window,'resize',drawHeld);
on(el('camera'),'change',()=>{camera=el('camera').value;director.hidden=camera!=='director';battle.focus();});
on(el('primary'),'click',()=>start(mode!=='paused'));
on(el('restart'),'click',()=>start(true));
on(el('pause'),'click',()=>pause());
on(el('music'),'change',()=>liveMusic(visibleActors()));
on(panel,'cancel',e=>{e.preventDefault();if(mode==='paused')start(false);});
if(el('storeGroup'))on(el('storeGroup'),'click',()=>group(el('groupNumber').value,true));
if(el('recallGroup'))on(el('recallGroup'),'click',()=>group(el('groupNumber').value,false));
on(window,'keydown',e=>{
  if(e.altKey || e.metaKey)return;
  if(e.code==='Escape' || e.code==='KeyP' && !e.target.closest('input,select,textarea')){
    if(e.repeat)return;
    if(heldFrame){e.preventDefault();closeHeld();}
    else if(mode==='live'){e.preventDefault();pause();}
    else if(mode==='paused'){e.preventDefault();start(false);}
    return;
  }
  if(mode!=='live' || e.target.closest('input,select,textarea'))return;
  const n=/^Digit([1-9])$/.exec(e.code);
  if(n){e.preventDefault();if(!e.repeat)group(n[1],e.ctrlKey);return;}
  if(e.ctrlKey)return;
  if(screen==='map' && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)){
    e.preventDefault();map.pan(({ArrowLeft:35,ArrowRight:-35})[e.code]??0,({ArrowUp:35,ArrowDown:-35})[e.code]??0);return;
  }
  if(e.repeat)return;
  if(e.code==='Tab' && !e.shiftKey && (e.target===canvas || e.target===battle)){
    e.preventDefault();toggleView(screen==='map'?'observation':'map');
    // The view switch takes focus so the next Tab reaches normal controls.
    el('tab').focus({preventScroll:true});
  }
  if(e.code==='KeyF')toggleView('observation',true);
  if(e.code==='KeyC'){
    const cameras=['overview','chase','sight','director'];
    camera=cameras[(cameras.indexOf(camera)+1)%3];toggleView('observation');
  }
  if(e.code==='KeyM')el('retro').checked=!el('retro').checked;
  if(e.code==='KeyG')el('fx').checked=!el('fx').checked;
});
on(window,'blur',()=>pause('Window lost focus.'));
on(document,'visibilitychange',()=>{if(document.hidden)pause('Tab hidden.');});
on(battle,'webglcontextlost',e=>{
  e.preventDefault();contextLost=true;el('inspectFrame').hidden=true;
  showScreen('map');pause('3D context lost. Resume on the command map.');
});
on(battle,'webglcontextrestored',()=>{
  contextLost=false;
  el('inspectFrame').hidden=!['paused','debrief','verified'].includes(mode);
});
on(window,'pagehide',e=>{
  abortImport();pause('Left the command station.');clearSession();
  if(!e.persisted)listeners.abort();
});

on(el('save'),'click',()=>{
  const blob=new Blob([JSON.stringify(commandReceipt(world),null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='war-room-'+world.tick+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
});
on(el('openReplay'),'change',async()=>{
  const file=el('openReplay').files[0];if(!file)return;
  abortImport();const controller=loading=new AbortController();
  try{
    if(file.size>replayLimit)throw RangeError('Command replay exceeds file limit');
    const recovered=await openCommandReplay(await file.text(),{signal:controller.signal,
      onProgress:n=>el('report').textContent='Verifying tick '+n+'…'});
    controller.signal.throwIfAborted();
    world=recovered;map=new StrategicMap(canvas,world);selected.clear();groups.clear();contactKey=undefined;
    showScreen('map');draw();dialog('verified',world.status+' · '+world.tick+' reproduced ticks · '+world.score+' points.');
    const r=commandReceipt(world);el('report').textContent='Verified state '+r.stateHash+' · events '+r.eventHash;
  }catch(error){
    if(!controller.signal.aborted)el('report').textContent='Replay rejected. '+error.message;
  }finally{if(loading===controller)loading=null;}
});

export function inspect(){
  const tr=map.transform(),r=canvas.getBoundingClientRect();
  const visible=visibleActors().map(a=>{
    const [u,v]=tr.screen(a.p[0],a.p[2]);
    return {id:a.id,x:a.p[0],z:a.p[2],u:u+r.left,v:v+r.top,hp:a.hp};
  });
  return structuredClone({mode,tick:world.tick,status:world.status,selected:[...selected],visible,
    camera,screen,director:screen==='observation' && camera==='director'?lastDirector:null,units:world.units,metrics:{...metrics,buffers:view?.r.meshes.size??0,rafActive:Boolean(raf),
      dragging:Boolean(drag),audioActive:Boolean(music)},receipt:commandReceipt(world),zoom:map.zoom,cx:map.cx,cz:map.cz});
}
if(scenario.briefing)el('panelText').textContent=scenario.briefing;
document.body.classList.toggle('big-battle',scenario===commandScenarios.big);
initRoster();draw();dialog('briefing');
