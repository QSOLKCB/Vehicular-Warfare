import {Clock,HZ} from '../sim/clock.js';
import {BK,REQUIRED_DEFENDERS,combinedReceipt} from '../sim/combined-world.js';
import {acceptPack,createCreatorWorld,creatorReceipt,defaultPack,openReplay,stepCreator} from '../sim/creator.js';
import {configureFxControl} from './fx-gate.js';
import {CombinedView} from './combined-view.js';
import {combinedHud,crewControls} from './combined-hud.js';
import {CreatorMusic} from './creator-music.js';
import {groundStation} from './ground-station.js';

configureFxControl();
const el=id=>document.getElementById(id);
const station=el('station'),canvas=el('battlefield');
const replayPage=new URLSearchParams(location.search).has('replay');
const replayKey='vw006:view-replay';
let snapshot=()=>({mode:station.dataset.mode,tick:0,metrics:{buffers:0,rafActive:false,audioActive:false}});
let score=null,peakVoices=0;
station.dataset.kind=replayPage?'replay':'playtest';

class WorkshopMusic extends CreatorMusic{
  constructor(world){super(world);score=this;}
  update(world){
    const before=this.cue;
    super.update(world);
    const state=this.inspect();
    peakVoices=Math.max(peakVoices,state.voices);
    if(before!==state.cue){
      const label=el('musicCue');
      label.hidden=false;label.textContent='Score · '+state.cue;
    }
  }
  dispose(){super.dispose();score=null;el('musicCue').hidden=true;}
}

export function inspect(){
  return {...snapshot(),music:score?.inspect()??null,peakVoices};
}

function describe(world,title){
  const crew=crewControls[world.selection];
  el('missionLabel').textContent=title;
  el('vehicleName').textContent=crew.name.toUpperCase();
  el('motionLabel').textContent=crew.motion;
  el('driveKeys').textContent='W / S　'+crew.action;
  el('turnKeys').textContent='A / D　'+crew.turn;
  el('extraKeys').textContent=crew.extra;
  el('movementHint').textContent='W/S '+crew.action.toUpperCase()+'　 A/D '+crew.turn.toUpperCase();
}
function showError(error){
  station.dataset.mode='error';
  el('panel').hidden=false;
  el('hud').hidden=true;
  el('replayDeck').hidden=true;
  el('primary').hidden=false;
  el('primary').firstChild.textContent='Retry ';
  el('primary').onclick=()=>location.reload();
  el('title').textContent='Station unavailable';
  el('chapter').textContent='CREATOR WORKSHOP';
  el('desc').textContent=error.message;
}
function playtest(){
  const saved=sessionStorage.getItem('vw006:play-pack');
  const pack=saved===null?defaultPack():acceptPack(saved);
  const crew=crewControls[pack.crew];
  describe({selection:pack.crew},pack.title);
  el('title').textContent=pack.title;
  el('desc').textContent='Take the '+crew.name+' to your marked gate after the relay falls. Help Cobalt disable '+REQUIRED_DEFENDERS+' mobile defenders.';
  document.title=pack.title+' · Workshop playtest';
  snapshot=groundStation({
    createWorld:()=>createCreatorWorld(pack),step:stepCreator,receipt:creatorReceipt,
    View:CombinedView,Sound:WorkshopMusic,soundLabel:'Music',keys:BK,aimLeft:BK.aimLeft,aimRight:BK.aimRight,
    activeStatus:'active',hud:combinedHud,actors:9,observe:w=>({pack:w.pack,selection:w.selection,captured:w.captured,mobileKills:w.mobileKills,relay:w.relay}),
    name:pack.title,replayPrefix:'workshop',wonTitle:'Gate secured',wonSummary:'Relay down · defenders repelled'
  });
  el('watch').addEventListener('click',()=>{
    try{
      sessionStorage.setItem(replayKey,JSON.stringify(snapshot().receipt));
      location.assign('./creator-play.html?replay');
    }catch(error){el('checkResult').textContent='Could not open replay. '+error.message;}
  });
}

async function viewer(){
  station.dataset.mode='loading';
  el('title').textContent='Checking recording';
  el('chapter').textContent='REPLAY VIEWER';
  el('primary').hidden=true;el('guide').hidden=true;
  const text=sessionStorage.getItem(replayKey);
  if(!text)throw Error('Open a saved recording from the workshop editor.');
  const loading=new AbortController();
  const abort=()=>loading.abort();
  window.addEventListener('pagehide',abort,{once:true});
  // A page restored mid-verification starts a new verifier for its saved input.
  window.addEventListener('pageshow',e=>{if(e.persisted && loading.signal.aborted)location.reload();});
  let cursor;
  try{
    cursor=await openReplay(text,{signal:loading.signal,onProgress:(tick,total)=>{
      el('desc').textContent='Verifying tick '+tick+' of '+total+'…';
    }});
  }catch(error){if(loading.signal.aborted)return;throw error;}
  finally{window.removeEventListener('pagehide',abort);}
  const recording=cursor.receipt;
  const title=cursor.world.pack?.title??'Breakwater Reach';
  const timeline=el('timeline'),cameraSelect=el('replayCamera'),toggle=el('replayToggle');
  const clock=new Clock();
  let camera='chase',view=null,raf=0,lastDraw=null,musicEnabled=false,retired=0;
  describe(cursor.world,title);
  document.title=title+' · Replay';
  el('panel').hidden=true;
  el('replayDeck').hidden=false;el('hud').hidden=false;
  timeline.max=String(cursor.ticks);

  function updateTransport(){
    const w=cursor.world,atEnd=w.tick===cursor.ticks,running=station.dataset.mode==='replaying';
    timeline.value=String(w.tick);
    el('timecode').textContent=(w.tick/HZ).toFixed(2)+' s / '+(cursor.ticks/HZ).toFixed(2)+' s';
    timeline.setAttribute('aria-valuetext','Tick '+w.tick+' of '+cursor.ticks);
    el('replayState').textContent=atEnd?(w.status==='active'?'End of recording':w.status):running?'Playing':'Paused';
    toggle.textContent=running?'Pause':atEnd?'Replay':'Play';
    toggle.disabled=cursor.ticks===0;el('rewind').disabled=w.tick===0;
  }
  function draw(){
    const w=cursor.world;
    view??=new CombinedView(canvas,w);
    lastDraw=view.draw(w,camera);
    combinedHud(w,lastDraw);
    if(camera==='overview')el('aimPoint').hidden=true;
    updateTransport();
  }
  function release(){
    cancelAnimationFrame(raf);raf=0;clock.reset();
    score?.dispose();
    if(view){view.dispose();retired=view.r.meshes.size;view=null;}
  }
  function fail(error){release();showError(error);}
  function still(){
    release();
    station.dataset.mode=cursor.world.tick===cursor.ticks?'finished':'reviewing';
    // The compositor keeps the last frame. A stationary viewer needs no live
    // mesh buffers, audio context or pending animation callbacks.
    try{draw();}catch(error){fail(error);return;}
    release();
  }
  function syncMusic(){
    score?.dispose();
    if(musicEnabled && station.dataset.mode==='replaying'){
      try{new WorkshopMusic(cursor.world);}catch{musicEnabled=false;}
    }
    el('replayMusic').textContent=musicEnabled?'Music on':'Music off';
    el('replayMusic').setAttribute('aria-pressed',String(musicEnabled));
  }
  function frame(now){
    raf=0;
    try{
      clock.frame(now,()=>{if(cursor.world.tick<cursor.ticks)cursor.advance();});
      draw();score?.update(cursor.world);
      if(cursor.world.tick===cursor.ticks){
        station.dataset.mode='finished';release();updateTransport();
      }else raf=requestAnimationFrame(frame);
    }catch(error){fail(error);}
  }
  function pause(){
    if(station.dataset.mode!=='replaying')return;
    release();station.dataset.mode='reviewing';updateTransport();
  }
  function transport(){
    if(station.dataset.mode==='replaying'){pause();return;}
    if(station.dataset.mode==='error' || !cursor.ticks)return;
    try{
      if(cursor.world.tick===cursor.ticks)cursor.seek(0);
      station.dataset.mode='replaying';clock.reset();draw();syncMusic();raf=requestAnimationFrame(frame);
    }catch(error){fail(error);}
  }
  function seek(tick){
    if(station.dataset.mode==='error')return;
    try{cursor.seek(tick);still();}catch(error){fail(error);}
  }

  snapshot=()=>{
    const w=cursor.world;
    return structuredClone({mode:station.dataset.mode,camera,tick:w.tick,status:w.status,reason:w.reason,score:w.score,
      selection:w.selection,pack:w.pack,player:w.player,events:w.events,shots:w.shots,captured:w.captured,held:0,
      receipt:w.pack?creatorReceipt(w):combinedReceipt(w),recording,
      metrics:{buffers:view?.r.meshes.size??0,rafActive:Boolean(raf),audioActive:Boolean(score),lastDraw,retired}});
  };
  toggle.addEventListener('click',transport);
  el('rewind').addEventListener('click',()=>seek(0));
  el('replayMusic').addEventListener('click',()=>{musicEnabled=!musicEnabled;syncMusic();});
  const fxBeacon=el('fxBeacon');
  el('replayDeck').querySelector('.transport').append(fxBeacon.parentElement);
  fxBeacon.addEventListener('change',()=>{if(station.dataset.mode!=='replaying')still();});
  cameraSelect.addEventListener('change',()=>{
    camera=cameraSelect.value;
    if(station.dataset.mode!=='replaying')still();
  });
  timeline.addEventListener('pointerdown',pause);
  timeline.addEventListener('input',()=>{
    const target=timeline.value;
    pause();
    timeline.value=target;
    el('timecode').textContent=(Number(target)/HZ).toFixed(2)+' s / '+(cursor.ticks/HZ).toFixed(2)+' s';
  });
  timeline.addEventListener('change',()=>seek(Number(timeline.value)));
  window.addEventListener('blur',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  window.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.altKey||e.metaKey||e.repeat||station.dataset.mode==='error')return;
    if(e.code==='Escape' || e.code==='KeyP'){e.preventDefault();pause();}
    else if(e.code==='Space' && !e.target.closest('input,select,button,a')){e.preventDefault();transport();}
  });
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fail(Error('WebGL context lost. Restore the display and retry.'));});
  window.addEventListener('resize',()=>{if(['reviewing','finished'].includes(station.dataset.mode))still();});
  window.addEventListener('pagehide',()=>{pause();release();});
  window.addEventListener('pageshow',e=>{if(e.persisted)still();});
  still();
}

try{if(replayPage)await viewer();else playtest();}
catch(error){showError(error);}
