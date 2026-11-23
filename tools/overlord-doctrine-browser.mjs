// Run against the loaded, extracted Breakwater mission board using CDP.
export async function check(io){
  return io.evaluate(`(async()=>{
    const {doctrineScenario:s}=await import('./sim/overlord.js');
    const w=s.createWorld(),id='cobalt-helicopter';
    s.issueOrder(w,{tick:0,type:'DOCTRINE',doctrine:'RECON',units:[id],append:false});
    const crew=w.actors.find(a=>a.id===id),start=crew.p.slice();
    for(let i=0;i<240;i++)s.step(w);
    const r=s.receipt(w),again=await s.openReplay(JSON.stringify(r)),verified=s.receipt(again);
    if(r.stateHash!==verified.stateHash || !w.serial ||
       Math.hypot(crew.p[0]-start[0],crew.p[2]-start[2])<1)throw Error('Doctrine playthrough failed');
    return {receipt:r,start,end:crew.p,decision:w.tactical.crews[id].decision,
      launches:w.serial,verified:verified.stateHash};
  })()`,30000);
}
