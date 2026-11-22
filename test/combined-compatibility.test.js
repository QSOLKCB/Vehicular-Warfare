import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {replay,receipt} from '../sim/world.js';
import {replayTank,tankReceipt} from '../sim/tank-world.js';
import {replayMech,mechReceipt} from '../sim/mech-world.js';
import {replayNaval,navalReceipt} from '../sim/naval-world.js';

const saved=name=>JSON.parse(readFileSync(new URL('../evidence/'+name,import.meta.url),'utf8'));
const flight=saved('browser/playthrough.json');
for(const [mission,runs,play,record] of [
  ['Sable Valley',[flight.win,flight.loss],replay,receipt],
  ['Cutbank Relay',saved('tracked-warfare/tank-numeric.json').runs,replayTank,tankReceipt],
  ['Glassworks Crossing',saved('mech-warfare/mech-outcomes.json'),replayMech,mechReceipt],
  ['Lantern Sound',saved('naval-warfare/naval-outcomes.json'),replayNaval,navalReceipt]
]){
  test(mission+' archived victory and defeat survive the mixed-world integration',()=>{
    const outcomes=[];
    for(const {receipt:original} of runs){
      const w=play(JSON.stringify(original)),current=record(w);
      outcomes.push(w.status);
      for(const key of ['ticks','stateHash','eventHash','commands'])assert.deepEqual(current[key],original[key]);
    }
    assert.deepEqual(outcomes,['victory','defeat']);
  });
}
