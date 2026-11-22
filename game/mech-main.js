import {HZ} from '../sim/clock.js';
import {createMechWorld,stepMech,mechReceipt,replayMech,MK,MECH_LIMIT} from '../sim/mech-world.js';
import {groundStation} from './ground-station.js';
import {MechView} from './mech-view.js';
import {MechAudio} from './mech-audio.js';

const el=id=>document.getElementById(id);
const support=el('support');
function hud(world,draw){
  const p=world.player,e=world.enemy;
  el('health').textContent=p.hp+'%';el('ammo').textContent=String(p.ammo).padStart(2,'0');
  el('gait').textContent=p.blocked?'BLOCKED':p.gait==='recovering'?'RECOVER':p.speed.toFixed(1)+' m/s';
  for(let i=0;i<p.feet.length;i++)support.children[i].dataset.stance=String(p.feet[i].stance);
  support.setAttribute('aria-label',p.supportCount+' planted feet');
  const reload=Math.max(0,p.ready-world.tick);
  el('reload').textContent=!p.ammo?'EMPTY':!draw.sight.clear?'BLOCKED':reload?(reload/HZ).toFixed(1)+'s':'READY';
  el('heading').textContent=String((Math.round(p.torsoYaw*180/Math.PI)+360)%360).padStart(3,'0')+'°';
  const dx=world.beacon[0]-p.p[0],dz=world.beacon[2]-p.p[2];
  const bearing=(Math.round(Math.atan2(dx,-dz)*180/Math.PI)+360)%360;
  const objective=e.hp?'Disable the sentinel':'Enter survey beacon';
  const seconds=Math.ceil((MECH_LIMIT-world.tick)/HZ),time=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  el('objectives').textContent=objective+' · '+time+'\nBeacon '+Math.round(Math.hypot(dx,dz))+' m · '+bearing+'°';
  el('contact').textContent=!e.hp?'SENTINEL OFFLINE':draw.sight.visible?'SENTINEL IN SIGHT':'SENTINEL MASKED';
  const aim=el('aimPoint');aim.hidden=!draw.aimVisible;aim.style.left=100*draw.x+'%';aim.style.top=100*draw.y+'%';
  let message='';
  for(let i=world.events.length-1;i>=0;i--){
    const ev=world.events[i];if(world.tick-ev.tick>90)break;
    if(ev.type==='damage'){message=(ev.target==='player'?'FRAME HIT':'SENTINEL HIT')+' · '+ev.hp+' HP';break;}
    if(ev.type==='impact' && ev.source==='player' && ev.target==='terrain'){message='PULSE STRUCK TERRAIN';break;}
  }
  el('message').textContent=message;
}
export const inspect=groundStation({
  createWorld:createMechWorld,step:stepMech,receipt:mechReceipt,replay:replayMech,
  View:MechView,Sound:MechAudio,keys:MK,aimLeft:MK.torsoLeft,aimRight:MK.torsoRight,
  vehicleKind:'mech',activeStatus:'walking',hud,name:'Glassworks Crossing',replayPrefix:'glassworks',
  wonTitle:'Crossing secured',wonSummary:'Survey beacon reached'
});
