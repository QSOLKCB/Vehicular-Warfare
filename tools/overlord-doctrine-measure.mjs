import {doctrineScenario as game} from '../sim/overlord.js';

const data={node:process.version,base:'19b530b04692607f4dacc96e3f14525e3562aaa2',scenarios:[]};
for(const doctrine of ['DEFEND','RECON']){
  const w=game.createWorld(),id='cobalt-helicopter',a=w.actors.find(b=>b.id===id);
  const start=a.p.slice(),obs=[],phase=[];
  game.issueOrder(w,{tick:0,units:[id],type:'DOCTRINE',doctrine,append:false});
  while(w.status==='active'){
    game.step(w,{onTactics:ms=>phase.push(ms)});
    if([1,101,165].includes(w.tick))obs.push({tick:w.tick,p:a.p.slice(),mask:w.tactical.crews[id].mask,
      decision:w.tactical.crews[id].decision,launches:w.serial});
  }
  const receipt=game.receipt(w),replay=game.receipt(game.replay(JSON.stringify(receipt)));
  phase.sort((a,b)=>a-b);
  data.scenarios.push({start,obs,receipt,verified:receipt.stateHash===replay.stateHash && receipt.eventHash===replay.eventHash,
    reason:w.reason,decisions:w.tactical.decisions,decisionHash:w.tactical.decisionHash,launches:w.serial,
    routeCounts:w.navigation,phaseMs:{p50:phase[phase.length>>1],p95:phase[Math.floor(phase.length*.95)],max:phase.at(-1)}});
}
console.log(JSON.stringify(data,null,2));
