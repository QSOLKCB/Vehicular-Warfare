import {crewControls as controls,combinedHud as hud,objective} from './combined-hud.js';
import {BK,REQUIRED_DEFENDERS,createCombinedWorld,stepCombined,combinedReceipt,replayCombined} from '../sim/combined-world.js';
import {CombinedView} from './combined-view.js';
import {VehicleAudio} from './vehicle-audio.js';
import {groundStation} from './ground-station.js';

const el=id=>document.getElementById(id);
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

export const inspect=groundStation({
  createWorld:selection=>createCombinedWorld(undefined,selection),step:stepCombined,receipt:combinedReceipt,
  replay:replayCombined,View:CombinedView,Sound:VehicleAudio,vehicleSelect:select,
  keys:BK,aimLeft:BK.aimLeft,aimRight:BK.aimRight,
  extraControls:{KeyE:BK.up,KeyQ:BK.down,KeyZ:BK.strafeLeft,KeyX:BK.strafeRight,ShiftLeft:BK.brake,ShiftRight:BK.brake},
  activeStatus:'active',hud,actors:9,observe:w=>({selection:w.selection,actors:w.actors,relay:w.relay,
    waterLevel:w.water.level,objective:objective(w),captured:w.captured,mobileKills:w.mobileKills,requiredDefenders:REQUIRED_DEFENDERS,repairReserve:w.supplies}),
  name:'Breakwater Reach',replayPrefix:'breakwater',wonTitle:'Reach secured',wonSummary:'Gate captured · '+defenderGoal+' disabled'
});
