import test from 'node:test';
import assert from 'node:assert/strict';
import {CreatorMusic,scoreCue} from '../game/creator-music.js';
import {BK,createCombinedWorld,stepCombined,combinedReceipt} from '../sim/combined-world.js';

function silentContext(){
  const param=()=>({setValueAtTime(){},cancelScheduledValues(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  return {state:'running',currentTime:0,destination:{},
    createGain:()=>({gain:param(),connect(){},disconnect(){}}),
    createOscillator:()=>({frequency:param(),connect(){},disconnect(){},start(){},stop(){}}),
    async close(){this.state='closed';}};
}

test('score follows observed acquisition, accepted events, gate and terminal outcomes',()=>{
  const w=createCombinedWorld();
  assert.equal(scoreCue(w),'departure');
  const a=w.actors.find(a=>a.faction!==w.player.faction);
  a.target=w.player.id;a.seen=15;assert.equal(scoreCue(w),'contact');
  w.events.push({tick:0,type:'launch'});assert.equal(scoreCue(w),'exchange');
  w.tick=109;assert.equal(scoreCue(w),'contact');
  w.captured=true;assert.equal(scoreCue(w),'crossing');
  w.status='defeat';assert.equal(scoreCue(w),'lost');
  w.status='victory';assert.equal(scoreCue(w),'secured');
});

test('score reads leave command and event digests intact and release all three voices',()=>{
  const w=createCombinedWorld(),copy=createCombinedWorld(),ctx=silentContext();
  const score=new CreatorMusic(w,ctx),cues=new Set([score.inspect().cue]);
  while(w.status==='active'){
    const cmd=BK.fire|(w.captured?0:BK.forward);
    stepCombined(w,cmd);stepCombined(copy,cmd);
    score.update(w);
    const state=score.inspect();
    cues.add(state.cue);
    score.update(w);assert.deepEqual(score.inspect(),state);
  }
  for(const cue of ['departure','exchange','crossing','secured'])assert.ok(cues.has(cue),cue);
  assert.equal(score.inspect().voices,3);assert.ok(score.inspect().notes>30);
  assert.deepEqual(combinedReceipt(w),combinedReceipt(copy));
  score.dispose();score.dispose();
  assert.equal(ctx.state,'closed');assert.equal(score.inspect().voices,0);
});
