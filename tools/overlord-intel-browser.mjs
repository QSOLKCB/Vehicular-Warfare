// Exercise the numerical contact API in the browser that loaded the packaged game.
import assert from 'node:assert/strict';

export async function check({evaluate}){
  const result=await evaluate(`(async()=>{
    const {bigBattle}=await import('./sim/big-battle.js');
    const {createIntelligence,sampleIntelligence}=await import('./sim/overlord-intel.js');
    const {canSee}=await import('./sim/combined-world.js');
    const world=bigBattle.createWorld();
    const intel=createIntelligence();
    const samples=[];
    for(let i=0;i<=120;i++){
      if(i%30===0){
        sampleIntelligence(world,intel);
        for(const faction of ['cobalt','ember']){
          const contacts=intel[faction].contacts.filter(c=>c.visible);
          const valid=contacts.every(c=>{
            const source=world.actors.find(a=>a.id===c.source);
            const subject=world.actors.find(a=>a.id===c.id);
            return source?.faction===faction && source.hp>0 && canSee(world,source,subject);
          });
          samples.push({tick:i,faction,valid,contacts:contacts.map(c=>[c.id,c.source])});
        }
      }
      if(i<120)bigBattle.step(world);
    }
    return {samples,receipt:bigBattle.receipt(world)};
  })()`);
  assert.equal(result.samples.length,10);
  assert.ok(result.samples.every(row=>row.valid && row.contacts.length));
  return result;
}
