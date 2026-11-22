import {HZ} from '../sim/clock.js';
import {createTankWorld,stepTank,tankReceipt,replayTank,TK,TANK_LIMIT} from '../sim/tank-world.js';
import {TankView} from './tank-view.js';
import {groundStation} from './ground-station.js';

const el=id=>document.getElementById(id);
function hud(world,lastDraw){
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

export const inspect=groundStation({
  createWorld:createTankWorld,step:stepTank,receipt:tankReceipt,replay:replayTank,View:TankView,
  keys:TK,aimLeft:TK.turretLeft,aimRight:TK.turretRight,
  vehicleKind:'tank',activeStatus:'driving',hud,name:'Cutbank Relay',replayPrefix:'cutbank',wonTitle:'Relay secured',wonSummary:'Guard disabled'
});
