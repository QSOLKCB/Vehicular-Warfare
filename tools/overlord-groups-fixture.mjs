// The browser driver supplies the same function to the extracted runtime.
// All orders go through scenario admission. Captured rows are observations.
export function groupFixture(api,variant,onFrame) {
  const world=api.createWorld({seed:2505}),crew=id=>world.actors.find(a=>a.id===id);
  const cover='cobalt-tank-2',adv='cobalt-helicopter';
  const flank=['cobalt-tank-3','cobalt-helicopter-3'];
  const coordinated=variant==='advance' || variant==='alternate';
  const crewIds=variant==='alternate'?[cover,adv,...flank]:[cover,adv];
  const admissionMs=[];
  const admission=(task,units,x,z)=>{
    const command=coordinated?{type:'TASK',task}:{type:task==='COVER'?'DEFEND':'MOVE'};
    const started=performance.now();
    api.issueOrder(world,{tick:0,units,x,z,append:false,...command});
    admissionMs.push({task,ms:performance.now()-started});
  };
  const station=variant==='alternate'?[-26,15]:[-30,17];
  admission('COVER',[cover],...station);
  admission('ADVANCE',[adv],-30,3);
  if(variant==='alternate')admission('FLANK',flank,-6,66);
  const positions=()=>crewIds.map(id=>({id,p:crew(id).p.slice(),hp:crew(id).hp}));
  const initial=positions();
  const plans=crewIds.map(id=>({id,orders:structuredClone(world.units[id].queue),
    assignment:structuredClone(world.tactical?.crews[id].task ?? null)}));
  const movement=[],engagements=[],results=[],impact=[];
  let release=null;
  while(world.status==='active'){
    const advancing=world.units[adv].queue[0]?.type==='MOVE';
    api.step(world);
    if(!release && world.tactical?.crews[adv].task?.releaseTick!==undefined) {
      const task=world.tactical.crews[adv].task;
      release={tick:task.releaseTick,cover:task.cover,reason:task.reason,positions:positions()};
    }
    for(const event of world.events) {
      if(event.tick!==world.tick)continue;
      if(event.type==='launch' && event.owner===cover) {
        engagements.push({...event,advancing,advanceP:crew(adv).p.slice(),advanceSpeed:Math.hypot(...crew(adv).v),
          ammoAfter:crew(cover).ammo,activeShots:world.shots.length});
      }
      if(event.type==='impact' && event.source===cover)impact.push(event);
    }
    if(world.tick%120===0) {
      const ps=positions();
      if(world.tick<=1200 || world.tick%600===0)movement.push({tick:world.tick,positions:ps});
    }
    for(const id of crewIds) {
      const u=world.units[id];
      if(u.lastResult?.tick===world.tick)results.push({id,p:crew(id).p.slice(),...u.lastResult});
    }
    if(world.tick===240)onFrame?.(world,crewIds);
  }
  const recording=api.receipt(world);
  const reopened=api.receipt(api.replay(JSON.stringify(recording)));
  if(JSON.stringify(reopened)!==JSON.stringify(recording))throw Error('Divergent group replay');
  return {variant,initial,plans,admissionMs,movement,results,release,engagements,impact,navigation:world.navigation,
    final:positions(),recording,reopened:{stateHash:reopened.stateHash,eventHash:reopened.eventHash}};
}
