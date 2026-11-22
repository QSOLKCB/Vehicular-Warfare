import {HZ} from '../sim/clock.js';
import {createNavalWorld,stepNaval,navalReceipt,replayNaval,NK,NAVAL_LIMIT} from '../sim/naval-world.js';
import {groundStation} from './ground-station.js';
import {NavalView} from './naval-view.js';
import {VehicleAudio} from './vehicle-audio.js';

const el=id=>document.getElementById(id);
const bearing=radians=>String((Math.round(radians*180/Math.PI)+360)%360).padStart(3,'0')+'°';

function hud(w,draw){
  const p=w.player,sight=draw.sight;
  el('heading').textContent=bearing(p.yaw);
  el('health').textContent=p.hp+'%';el('ammo').textContent=String(p.ammo).padStart(2,'0');
  el('speed').textContent=p.speed.toFixed(1)+' m/s';
  const depth=w.water.heightAt(p.p[0],p.p[2])-w.field.sample(p.p[0],p.p[2]).height;
  el('depth').textContent=p.grounded?'AGROUND':Math.max(0,depth).toFixed(1)+' m';
  const cooldown=Math.max(0,p.ready-w.tick);
  el('reload').textContent=!p.ammo?'EMPTY':!sight.clear?'BLOCKED':cooldown?(cooldown/HZ).toFixed(1)+' s':'READY';
  const seconds=Math.ceil((NAVAL_LIMIT-w.tick)/HZ),time=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  const objective=w.enemy.hp?'Disable the patrol':w.shore.hp?'Disable the shore station':'Reach the exit buoys';
  const dest=w.enemy.hp && sight.visible?w.enemy.p:w.shore.hp?w.shore.p:w.beacon;
  const fix=w.enemy.hp && sight.visible?'Patrol':w.shore.hp?'Station':'Buoy';
  const dx=dest[0]-p.p[0],dz=dest[2]-p.p[2];
  el('objectives').textContent=objective+' · '+time+'\n'+fix+' '+Math.round(Math.hypot(dx,dz))+' m · '+bearing(Math.atan2(dx,-dz));
  el('contact').textContent=p.grounded?'KEEL CONTACT':w.enemy.hp?(sight.visible?'PATROL IN SIGHT':'PATROL MASKED'):w.shore.hp?(sight.shoreVisible?'STATION IN SIGHT':'STATION MASKED'):'CHANNEL CLEAR';
  const aim=el('aimPoint');aim.hidden=!draw.aimVisible;
  if(!aim.hidden){aim.style.left=100*draw.x+'%';aim.style.top=100*draw.y+'%';}
  let message='';
  for(let i=w.events.length-1;i>=0;i--){
    const e=w.events[i];if(w.tick-e.tick>96)break;
    if(e.type==='damage'){
      const label=e.target==='player'?'HULL HIT':e.target==='enemy'?'PATROL HIT':'STATION HIT';
      message=label+' · '+e.hp+' HP';break;
    }
    if(e.type==='impact' && e.source==='player' && (e.target==='water' || e.target==='terrain')){
      message=e.target==='water'?'SPLASH':'ISLAND IMPACT';break;
    }
  }
  el('message').textContent=message;
}
export const inspect=groundStation({
  createWorld:createNavalWorld,step:stepNaval,receipt:navalReceipt,replay:replayNaval,View:NavalView,Sound:VehicleAudio,
  vehicleKind:'ship',keys:NK,aimLeft:NK.mountLeft,aimRight:NK.mountRight,activeStatus:'sailing',hud,actors:3,
  observe:w=>({shore:w.shore,waterLevel:w.water.level}),name:'Lantern Sound',replayPrefix:'lantern',
  wonTitle:'Channel secured',wonSummary:'Exit buoys reached'
});
