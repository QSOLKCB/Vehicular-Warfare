import {Clock,HZ} from '../sim/clock.js';
import {bindChartControls} from './chart-controls.js';
import {crewKeys,SimpleSteering} from './drive-controls.js';

export function groundStation({createWorld,step,receipt,replay,View,keys,aimLeft,aimRight,
  vehicleKind,activeStatus,hud,name,replayPrefix,wonTitle,wonSummary,Sound,soundLabel='Sound',actors=2,observe,vehicleSelect}){
  const el=id=>document.getElementById(id);
  const canvas=el('battlefield'),station=el('station'),clock=new Clock();
  const style=el('driveStyle'),fxBeacon=el('fxBeacon');
  let controls,steering;
  const pressed=new Set();
  let vehicle=vehicleSelect?.value;
  let world=createWorld(vehicle),mode='briefing',camera='chase',view=null,session=null,raf=0;
  const mapMode=bindChartControls(enabled=>view?.setRetro(enabled));
  let held=0,trigger=false,mouseX=0,mouseY=0,lastFrame=null;
  let sound=null,soundEnabled=false;
  let lastDraw=null,retired=0,peaks=0;
  const frames=[],costs=[],viewMs=[];
  const keep=(list,value)=>{if(list.length===1024)list.shift();list.push(value);};
  try{if(localStorage.getItem('vw007:drive-style')==='independent')style.value='independent';}catch{}
  function configureControls(){
    const crew=world.selection??vehicleKind;
    controls=crewKeys(crew,keys,aimLeft,aimRight);
    const surface=crew!=='helicopter';
    el('driveSetup').hidden=!surface;
    if(el('nearAimKeys'))el('nearAimKeys').hidden=!surface;
    steering=surface && style.value==='simple'?new SimpleSteering(crew,keys,aimLeft,aimRight):null;
    if(!surface)return;
    const help=el('driveHelp');
    if(!steering){help.textContent='Steer and aim separately. Q/E aim left/right and R/F raise/lower.';return;}
    const details={tank:'Release the drive keys to brake.',mech:'Release W/S to finish your stride.',ship:'A/D gives the rudder a little ahead power at low speed.'};
    help.textContent='A/D steers and brings your aim around. '+details[crew];
  }
  style.addEventListener('change',()=>{
    configureControls();
    try{localStorage.setItem('vw007:drive-style',style.value);}catch{}
  });
  configureControls();
  function dispose(){
    cancelAnimationFrame(raf);raf=0;session?.abort();session=null;
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    pressed.clear();held=0;trigger=false;mouseX=mouseY=0;steering?.reset();
    sound?.dispose();sound=null;
    clock.reset();lastFrame=null;
    if(view){view.dispose();retired=view.r.meshes.size;view=null;}
  }
  function panel(state,title,description,action){
    mode=state;station.dataset.mode=state;
    el('panel').hidden=false;el('hud').hidden=true;el('guide').open=false;
    el('title').textContent=title;el('desc').textContent=description;
    el('chapter').textContent=state==='paused'?'SORTIE SUSPENDED':state==='error'?(station.dataset.offlineLabel||'GROUND STATION'):'MISSION DEBRIEF';
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
      if(e.code==='KeyG' && fxBeacon){
        fxBeacon.checked=!fxBeacon.checked;fxBeacon.dispatchEvent(new Event('change'));
      }
      if(e.code==='KeyM')mapMode?.click();
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
  function frame(now){
    raf=0;
    if(lastFrame!==null)keep(frames,now-lastFrame);
    lastFrame=now;
    clock.frame(now,()=>{
      if(world.status!==activeStatus)return;
      let cmd=held|(trigger?keys.fire:0);
      if(Math.abs(mouseX)>=1){cmd|=mouseX>0?aimRight:aimLeft;mouseX-=Math.sign(mouseX);}
      if(Math.abs(mouseY)>=1){cmd|=mouseY>0?keys.depress:keys.elevate;mouseY-=Math.sign(mouseY);}
      if(steering)cmd=steering.command(cmd,world.player);
      const start=performance.now();step(world,cmd);keep(costs,performance.now()-start);
      peaks=Math.max(peaks,world.shots.length);
    });
    try{
      const start=performance.now();lastDraw=view.draw(world,camera);keep(viewMs,performance.now()-start);hud(world,lastDraw);sound?.update(world);
    }catch(error){errorPanel(error);return;}
    if(world.status===activeStatus){raf=requestAnimationFrame(frame);return;}
    dispose();
    const won=world.status==='victory';
    panel(world.status,won?wonTitle:'Sortie lost',
      (won?wonSummary:world.reason)+' · '+world.score+' points · '+(world.tick/HZ).toFixed(1)+' s','Deploy again');
  }
  function begin(fresh){
    dispose();
    if(fresh){
      world=createWorld(vehicle);camera='chase';el('camera').textContent='Gun sight';
      frames.length=costs.length=viewMs.length=0;peaks=0;
    }
    try{view=new View(canvas,world,{retro:mapMode?.checked});}
    catch(error){errorPanel(error);return;}
    mode='playing';station.dataset.mode=mode;el('panel').hidden=true;el('hud').hidden=false;
    if(vehicleSelect)vehicleSelect.disabled=true;
    document.activeElement?.blur();syncSound();listen();raf=requestAnimationFrame(frame);
  }
  function preview(){
    try{view??=new View(canvas,world,{retro:mapMode?.checked});lastDraw=view.draw(world,'briefing');}
    catch(error){errorPanel(error);}
  }
  fxBeacon?.addEventListener('change',()=>{if(mode==='briefing')preview();});
  vehicleSelect?.addEventListener('change',()=>{
    if(mode!=='briefing')return;
    vehicle=vehicleSelect.value;
    dispose();world=createWorld(vehicle);configureControls();preview();
  });
  function syncSound(){
    if(!Sound)return;
    sound?.dispose();sound=null;
    if(soundEnabled){
      try{sound=new Sound(world);}catch{soundEnabled=false;}
    }
    el('sound').textContent=soundLabel+(soundEnabled?' on':' off');
    el('sound').setAttribute('aria-pressed',String(soundEnabled));
  }
  if(Sound)el('sound').addEventListener('click',()=>{soundEnabled=!soundEnabled;syncSound();});
  el('primary').addEventListener('click',()=>begin(mode!=='paused'));
  el('again').addEventListener('click',()=>begin(true));el('pause').addEventListener('click',pause);
  el('camera').addEventListener('click',setCamera);
  el('save').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(receipt(world))],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=replayPrefix+'-'+world.tick+'.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),500);
  });
  el('checkFile')?.addEventListener('change',async event=>{
    const input=event.currentTarget,file=input.files[0];if(!file)return;
    input.disabled=true;
    try{
      if(file.size>300000)throw Error('Replay exceeds the size limit');
      const w=replay(await file.text());
      const crew=vehicleSelect?' · '+w.selection:'';
      el('checkResult').textContent='Verified · '+name+crew+' · '+(w.tick/HZ).toFixed(2)+' s · '+w.status;
    }catch(error){el('checkResult').textContent='Could not verify this sortie. '+error.message;}
    finally{input.disabled=false;input.value='';}
  });
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();errorPanel(Error('WebGL context lost. Restore the context and retry.'));});
  window.addEventListener('resize',()=>{if(mode==='briefing')preview();});
  window.addEventListener('pagehide',()=>{if(mode==='playing')pause();else dispose();});
  window.addEventListener('pageshow',e=>{if(e.persisted && mode==='briefing')preview();});

  // Detached snapshots for local acceptance tooling.
  function inspect(){
    return structuredClone({mode,camera,driveStyle:el('driveSetup').hidden?null:style.value,tick:world.tick,status:world.status,reason:world.reason,
      score:world.score,held,trigger,player:world.player,enemy:world.enemy,events:world.events,
      ...(world.beacon?{beacon:world.beacon}:{}),...observe?.(world),sight:lastDraw?.sight,shots:world.shots,receipt:receipt(world),
      metrics:{frames,costs,viewMs,lastDraw,peaks,actors,buffers:view?.r.meshes.size??0,
        ...(mapMode?{liveRetroBytes:view?.retro?.retainedBytes??0}:{}),
        ...(Sound?{audioActive:Boolean(sound)}:{}),rafActive:Boolean(raf),sessionActive:Boolean(session),retired}});
  }
  preview();
  return inspect;
}
