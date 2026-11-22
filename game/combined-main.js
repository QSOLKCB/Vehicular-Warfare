import {HZ} from '../sim/clock.js';
import {BK,COMBINED_LIMIT,REQUIRED_DEFENDERS,createCombinedWorld,stepCombined,combinedReceipt,replayCombined} from '../sim/combined-world.js';
import {CombinedView} from './combined-view.js';
import {VehicleAudio} from './vehicle-audio.js';
import {groundStation} from './ground-station.js';

const el=id=>document.getElementById(id);
const bearing=angle=>String((Math.round(angle*180/Math.PI)+360)%360).padStart(3,'0')+'°';

const controls={
  helicopter:{name:'Kestrel',action:'Fly forward / aft',turn:'Yaw left / right',extra:'E / Q lift · Z / X strafe',
    hint:'Use E / Q to climb or descend. Approach your gate at the marked altitude.',motion:'ALTITUDE'},
  tank:{name:'Basalt',action:'Drive / reverse',turn:'Steer or pivot',extra:'Shift to brake',
    hint:'A / D pivot the tracks. Hold Shift to brake. The turret turns independently as you drive.',motion:'TRACK SPEED'},
  mech:{name:'Kiln',action:'Walk / backstep',turn:'Turn the chassis',extra:'Arrows slew the torso',
    hint:'Allow room for your six feet to plant. The torso turns independently as you walk.',motion:'FOOT CONTACT'},
  ship:{name:'Tern',action:'Ahead / astern',turn:'Port / starboard helm',extra:'Keep the keel in the channel',
    hint:'Make way before turning the rudder. Steer through the channel past the skerry.',motion:'SPEED'}
};
const defenderGoal=REQUIRED_DEFENDERS+' mobile defender'+(REQUIRED_DEFENDERS===1?'':'s');
el('defenderGoal').textContent=defenderGoal;
const select=el('vehicle');
function describeVehicle(){
  const c=controls[select.value];
  el('controlHint').textContent=c.hint;
  el('driveKeys').textContent='W / S　'+c.action;el('turnKeys').textContent='A / D　'+c.turn;
  el('extraKeys').textContent=c.extra;el('vehicleName').textContent=c.name.toUpperCase();
  el('motionLabel').textContent=c.motion;
  el('movementHint').textContent='W/S '+c.action.toUpperCase()+'　 A/D '+c.turn.toUpperCase();
}
select.addEventListener('change',describeVehicle);describeVehicle();

function actorName(w,id){
  const a=w.actors.find(unit=>unit.id===id);
  return a?.kind==='relay'?'Relay':a?((a.faction==='cobalt'?'Cobalt ':'Ember ')+a.kind):'';
}
function report(w){
  for(let i=w.events.length-1;i>=0;i--){
    const e=w.events[i];if(w.tick-e.tick>95)break;
    if(e.type==='repair')return 'Gate repair · +'+e.amount+' HP';
    if(e.type==='beacon')return 'Gate captured · resupplied';
    if(e.type==='destroy')return actorName(w,e.target)+' disabled';
    if(e.type==='damage' && e.target===w.player.id)return 'Taking fire · '+e.hp+' HP';
    if(e.type==='damage' && e.source===w.player.id)return actorName(w,e.target)+' hit · '+e.hp+' HP';
    if(e.type==='blocked' && e.source===w.player.id)return 'Muzzle obstructed';
  }
  return '';
}
function objective(w){
  if(w.status==='victory')return 'secured';
  if(w.relay.hp)return 'relay';
  return w.captured?'defender':'gate';
}
function hud(w,draw){
  const p=w.player,s=draw.sight;
  el('heading').textContent=bearing(p.yaw);
  el('health').textContent=p.hp+' HP';el('ammo').textContent=String(p.ammo).padStart(2,'0');
  let motion;
  if(p.kind==='helicopter')motion=p.p[1].toFixed(1)+' m';
  else if(p.kind==='mech')motion=p.gait==='recovering'?'RECOVER':p.supportCount+'/6';
  else motion=p.grounded?'AGROUND':p.blocked?'BLOCKED':p.speed.toFixed(1)+' m/s';
  el('motion').textContent=motion;
  const delay=Math.max(0,p.ready-w.tick);
  el('reload').textContent=!p.ammo?'EMPTY':!s.clear?'BLOCKED':delay?(delay/HZ).toFixed(1)+' s':'READY';
  const sec=Math.ceil((COMBINED_LIMIT-w.tick)/HZ),time=Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
  const stage=objective(w),end=stage==='relay'?w.relay.p:w.beacon;
  const dx=end[0]-p.p[0],dz=end[2]-p.p[2];
  const gateAltitude=p.kind==='helicopter' && stage==='gate'?' · '+Math.round(end[1])+' m ALT':'';
  const label=stage==='secured'?'Reach secured':stage==='relay'?'Disable relay · '+w.relay.hp+' HP':stage==='gate'?'Capture your gate':'Disable mobile defenders';
  const waypoint=w.captured?'Gate repairs · '+w.supplies+' HP left':Math.round(Math.hypot(dx,dz))+' m　'+bearing(Math.atan2(dx,-dz))+gateAltitude;
  const objectives=el('objectives');
  objectives.dataset.captured=String(w.captured);
  objectives.textContent=label+'　'+time+'\n'+waypoint+'\nMobile defenders disabled　'+Math.min(REQUIRED_DEFENDERS,w.mobileKills)+'/'+REQUIRED_DEFENDERS;
  el('contact').textContent=s.target?actorName(w,s.target).toUpperCase()+' IN SIGHT':
    s.visible.length?s.visible.length+' EMBER CONTACT'+(s.visible.length===1?'':'S'):'NO VISIBLE CONTACT';
  const aim=el('aimPoint');aim.hidden=!draw.aimVisible;
  if(!aim.hidden){aim.style.left=100*draw.x+'%';aim.style.top=100*draw.y+'%';}
  el('message').textContent=report(w);
}

export const inspect=groundStation({
  createWorld:selection=>createCombinedWorld(undefined,selection),step:stepCombined,receipt:combinedReceipt,
  replay:replayCombined,View:CombinedView,Sound:VehicleAudio,vehicleSelect:select,
  keys:BK,aimLeft:BK.aimLeft,aimRight:BK.aimRight,
  extraControls:{KeyE:BK.up,KeyQ:BK.down,KeyZ:BK.strafeLeft,KeyX:BK.strafeRight,ShiftLeft:BK.brake,ShiftRight:BK.brake},
  activeStatus:'active',hud,actors:9,observe:w=>({selection:w.selection,actors:w.actors,relay:w.relay,
    waterLevel:w.water.level,objective:objective(w),captured:w.captured,mobileKills:w.mobileKills,requiredDefenders:REQUIRED_DEFENDERS,repairReserve:w.supplies}),
  name:'Breakwater Reach',replayPrefix:'breakwater',wonTitle:'Reach secured',wonSummary:'Gate captured · '+defenderGoal+' disabled'
});
