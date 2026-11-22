import {cpus,platform,arch} from 'node:os';
import {createWorld,step,receipt,K} from '../sim/world.js';
import {createMechWorld,stepMech,mechReceipt,MK} from '../sim/mech-world.js';
import {createNavalWorld,stepNaval,navalReceipt,NK} from '../sim/naval-world.js';
import {createCombinedWorld,stepCombined,combinedReceipt,BK} from '../sim/combined-world.js';
import {stepVessel} from '../sim/vessel.js';
import {HZ} from '../sim/clock.js';

function measure(w,active,actors,advance,record,observe){
  const microseconds=[];
  let maxShots=0;
  while(w.status===active){
    const start=performance.now();
    advance(w);
    microseconds.push(Math.round((performance.now()-start)*1000));
    maxShots=Math.max(maxShots,w.shots.length);
    observe?.(w);
  }
  const sorted=[...microseconds].sort((a,b)=>a-b);
  return {node:process.version,cpu:cpus()[0].model,platform:platform(),arch:arch(),
    status:w.status,maxShots,actors,p50:sorted[Math.floor(sorted.length*.5)],
    p95:sorted[Math.floor(sorted.length*.95)],microseconds,receipt:record(w),events:w.events};
}

function combinedRuns(){
  const runs=[];
  for(const selection of ['helicopter','tank','mech','ship']){
    const world=createCombinedWorld(undefined,selection),encounter=[],load=[];
    let peakEvents=0;
    const result=measure(world,'active',world.actors.length,w=>{
      const move=w.captured?(selection==='tank'?BK.brake:0):BK.forward;
      stepCombined(w,move|BK.fire);
    },combinedReceipt,w=>{
      peakEvents=Math.max(peakEvents,w.events.length);
      let start=w.events.length;
      while(start>0 && w.events[start-1].tick===w.tick)start--;
      for(let i=start;i<w.events.length;i++)encounter.push(w.events[i]);
      if(w.tick===1 || w.tick%60===0 || w.status!=='active'){
        load.push({tick:w.tick,liveActors:w.actors.filter(a=>a.hp>0).length,shots:w.shots.length,
          playerPosition:w.player.p.slice(),score:w.score});
      }
    });
    runs.push({selection,peakEvents,encounter,load,...result});
  }
  return {runs};
}

// A separate release in the same harbour measures passive settling without
// mixing diagnostic work into the timed mission or changing its replay.
function floatTrace(){
  const {field,water,player}=createNavalWorld();
  const equilibrium=player.p[1],samples=[];
  player.p[1]+=1;
  player.roll=.12;
  player.pitch=-.08;
  const release={height:player.p[1],roll:player.roll,pitch:player.pitch};
  for(let tick=1;tick<=8*HZ;tick++){
    stepVessel(player,field,water,0,0);
    if(tick===1 || tick%30===0)samples.push({tick,height:player.p[1],roll:player.roll,pitch:player.pitch,
      wetPoints:player.wetPoints,displacedVolume:player.displacedVolume});
  }
  return {waterLevel:water.level,equilibrium,release,samples};
}
function missionRun(mode){
  if(mode==='combined')return combinedRuns();
  if(mode==='naval'){
    const result=measure(createNavalWorld(),'sailing',3,w=>stepNaval(w,NK.forward|NK.fire),navalReceipt);
    return {...result,floatRelease:floatTrace()};
  }
  if(mode==='mech')return measure(createMechWorld(),'walking',2,w=>stepMech(w,MK.forward|MK.fire),mechReceipt);
  return measure(createWorld(),'flying',3,w=>step(w,w.tick<300?0:w.tick<440?K.up:K.fire),receipt);
}
const result=missionRun(process.argv[2]);
console.log(JSON.stringify(result,null,1));
