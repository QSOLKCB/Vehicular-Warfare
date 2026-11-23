// Reopen the released command downloads through each historical scenario's file input.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const recordings = [
  ['warRoom','evidence/war-room/browser/native-replay.json'],
  ['warRoom','evidence/war-room/browser/software-replay.json'],
  ['formationRoom','evidence/formation-intelligence/formation-replay.json'],
  ['bigBattle','evidence/big-battle/native-replay.json'],
  ['bigBattle','evidence/big-battle/software-replay.json']
];

export async function check({evaluate,send,sleep}) {
  const links = await evaluate("Object.fromEntries(['warRoom','formationRoom','bigBattle'].map(id=>[id,document.getElementById(id).href]))");
  const results=[];
  for (const [mission,file] of recordings) {
    const expected=JSON.parse(await readFile(file,'utf8'));
    // The next file can use the very same scenario URL. Wait for its fresh
    // document before acquiring node IDs, which navigation invalidates.
    await evaluate("document.documentElement.dataset.leavingReplayFixture='1'");
    await send('Page.navigate',{url:links[mission]});
    let ready=false;
    for (let attempt=0;attempt<120 && !ready;attempt++) {
      ready=await evaluate(`location.href===${JSON.stringify(links[mission])} &&
        document.readyState==='complete' && !document.documentElement.dataset.leavingReplayFixture &&
        !!document.querySelector('dialog[open] #openReplay')`);
      if (!ready) await sleep(50);
    }
    assert.ok(ready,'Loaded replay briefing in '+mission);
    const {root}=await send('DOM.getDocument');
    const {nodeId:input}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#openReplay'});
    await send('DOM.setFileInputFiles',{nodeId:input,files:[resolve(file)]});
    let checked;
    for (let attempt=0;attempt<350 && !checked;attempt++) {
      const state=await evaluate("document.getElementById('report').textContent");
      if (state.startsWith('Replay rejected')) throw Error(file+' '+state);
      if (state.startsWith('Verified state')) {
        checked=await evaluate("import('./game/war-room.js').then(m=>m.inspect().receipt)");
      } else await sleep(50);
    }
    assert.deepEqual(checked,expected,file);
    const {scenario,source,ticks,stateHash,eventHash,outcome}=checked;
    results.push({file,scenario,source,ticks,stateHash,eventHash,outcome});
  }
  return {recordings:results};
}
